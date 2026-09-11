import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import { buildSenderAddress, logEmail, sendEmail } from '@/lib/services/email-service';
import { WarmingEmail } from '@/lib/email/templates/warming-email';

// ===========================================================================
// THE WARMING SENDER [Josh, deliverability session, 2026-09-10]
// ===========================================================================
//
// Google Postmaster reports ezcontractorbinder.com compliant on every
// requirement — SPF, DKIM, alignment, DMARC, encryption, spam rate, DNS,
// one-click unsubscribe — and then says it cannot determine deliverability
// because not enough mail has reached personal Gmail accounts. Nothing is
// misconfigured. The gap is volume Gmail can count. This sends 24 messages a
// week, 12 per tenant, at irregular times, from the app's real send path.
//
// ---------------------------------------------------------------------------
// ⚠️ READ THIS BEFORE TREATING IT AS A FIX. IT PROBABLY HELPS LESS THAN IT LOOKS.
// ---------------------------------------------------------------------------
// Recorded here rather than in a report, because the next person to read this
// file will otherwise assume the deliverability problem was solved in 2026-09.
//
//   · VOLUME WITHOUT ENGAGEMENT IS THE THING GMAIL DETECTS. Opens count and
//     Josh will open these. Replies count for more, and there is a limit to how
//     many times a person genuinely replies to a delivery test — which is why
//     the copy asks for one in plain words instead of pretending to be
//     something worth answering.
//   · FOUR FIXED ADDRESSES IS LIST-WARMING, NOT ORGANIC MAIL. 24/week to the
//     same four inboxes is, structurally, a warming list. Gmail models
//     per-recipient engagement, so a mailbox that has received three hundred of
//     these contributes progressively less signal than three hundred different
//     people receiving one each. This shape is closer to the problem than to
//     the cure, and it is the honest limit of what four inboxes can do.
//   · THE OBSERVED VERDICT WAS ABOUT CONTENT, NOT VOLUME. The test invite
//     landed in spam "similar to messages that were identified as spam in the
//     past". Volume does not repair a content-similarity judgement. The copy
//     below is varied deliberately, but six messages repeating weekly is still
//     six messages.
//   · WHAT ACTUALLY REPAIRS REPUTATION IS TIME AND REAL, WANTED MAIL. See
//     `docs/specs/email-deliverability-diagnosis.md` §3.
//
// So: a necessary input, not a fix, and worth measuring rather than believing.
// The Resend webhook (live since 2026-09-10) is what makes it measurable —
// `email_logs.delivered_at` / `opened_at` on these rows is the actual result.
// ===========================================================================

/**
 * ⚠️ A HARDCODED CONSTANT, AND IT SHOULD STAY ONE.
 *
 * These are Josh's own inboxes. Warming mail must never be able to reach a
 * tenant's contacts, so the recipient list deliberately does not come from any
 * table — there is no query here that a bad row could widen. `email_warming_enabled`
 * chooses WHICH COMPANY SENDS; it can never choose who receives.
 */
export const WARMING_RECIPIENTS = [
  'JSBishop14@gmail.com',
  'EZContractorBinder@gmail.com',
  'Christine.Bishop926@gmail.com',
  'FrameFocus2026@gmail.com',
] as const;

/** Per company, per ISO week. Two enabled companies × 12 = 24/week. */
export const WEEKLY_QUOTA_PER_COMPANY = 12;

// ---------------------------------------------------------------------------
// The schedule, mirrored from vercel.json.
//
// ⚠️ THIS IS A SECOND COPY OF A FACT THAT LIVES IN `vercel.json`, and a second
// copy is exactly the divergence the PARITY rule warns about. It cannot be
// imported (vercel.json is deploy configuration, not a module), so instead
// `email-warming.test.ts` ASSERTS the two agree and fails if either moves.
// ---------------------------------------------------------------------------
/** UTC hours the cron fires: 13:00–22:59 = 09:00–18:00 EDT / 08:00–17:00 EST. */
export const SLOT_HOURS_UTC = { first: 13, last: 22 } as const;
// Fires per hour. The cron's minute field is a step of 60 / this.
// (Written as a line comment on purpose: the step expression contains the
// two characters that CLOSE a block comment, which is a parse error that
// reads as a missing semicolon forty lines away.)
export const SLOTS_PER_HOUR = 4;
/** Monday–Friday. */
export const SLOT_WEEKDAYS = [1, 2, 3, 4, 5] as const;

// ---------------------------------------------------------------------------
// THE COPY. Approved verbatim [Josh, 2026-09-10].
//
// Six subjects, three bodies, paired by index — so each body appears twice
// under a different subject and the set is six distinct messages. RULED [Josh]:
// "fewer, better-written, repeating; assembled text reads as assembled." A
// combinatorial generator was the alternative and was rejected.
//
// ⚠️ THE SUBJECTS VARY IN STRUCTURE, NOT IN A TOKEN. `email-deliverability-diagnosis.md`
// §1c named near-duplicate subjects distinguishable only by a machine string as
// THE content problem on this domain. `Delivery check #4` would reproduce it
// exactly. No subject here contains a number, an id, or a date.
// ---------------------------------------------------------------------------
const SUBJECTS = [
  'Quick check on our email setup',
  'Making sure this lands',
  'Testing our outgoing mail — no action needed',
  'Checking mail from the {company} address',
  'Mail test, {weekday}',
  'Seeing whether this one gets through',
] as const;

type BodyBuilder = (company: string, morning: boolean) => string;

const BODIES: readonly BodyBuilder[] = [
  // A
  (company) =>
    `Hi Josh,\n\n` +
    `This is a delivery test from ${company}. We're checking that mail from this address reaches you and doesn't end up in spam.\n\n` +
    `Nothing to do here — there's no link and no account attached to this message. If you have a second, a short reply helps confirm the round trip.\n\n` +
    `— ${company}`,
  // B
  (company) =>
    `Josh,\n\n` +
    `Delivery test, sent from the ${company} address.\n\n` +
    `We're building up a sending history so real mail to clients doesn't get filtered. This message is exactly what it looks like — no link, no record behind it, nothing that happens if you ignore it. Replying is genuinely more useful than opening.\n\n` +
    `— ${company}`,
  // C
  //
  // ⚠️ THE GREETING IS TIME-AWARE, and this is the one refinement to the
  // approved copy. "Morning Josh" arriving at 4pm is precisely the sloppy tell
  // that makes mail read as automated — the opposite of what the human-voiced
  // ruling is for. The words are otherwise unchanged.
  (company, morning) =>
    `${morning ? 'Morning' : 'Afternoon'} Josh,\n\n` +
    `Another delivery test from ${company} — checking this address still lands in the inbox.\n\n` +
    `No action needed. If it turned up in spam instead, that's the useful signal, and moving it to the inbox helps more than a reply would.\n\n` +
    `— ${company}`,
];

const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

// ---------------------------------------------------------------------------
// Pure decisions. Exported so the pacing can be asserted without a database, a
// clock or a transport — the shape `emailSendAllowed` and `recipientIsDeliverable`
// already use.
// ---------------------------------------------------------------------------

/** ISO-8601 week number. Weeks start Monday; the quota and rotation key on it. */
export function isoWeek(now: Date): { year: number; week: number } {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  // Thursday of this week decides the year, per ISO-8601.
  const dayNum = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return { year: d.getUTCFullYear(), week };
}

/** UTC instant of the Monday 00:00 that opens `now`'s ISO week. */
export function weekStart(now: Date): Date {
  const d = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0)
  );
  const dayNum = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
  d.setUTCDate(d.getUTCDate() - (dayNum - 1));
  return d;
}

/**
 * How many firing slots remain in this ISO week, INCLUDING the one happening
 * now. This is the denominator that makes the spacing irregular without ever
 * missing the quota — see `shouldSendNow`.
 */
export function slotsRemainingInWeek(now: Date): number {
  const nowDay = now.getUTCDay();
  const nowHour = now.getUTCHours();
  const nowMinute = now.getUTCMinutes();
  let slots = 0;
  for (const day of SLOT_WEEKDAYS) {
    if (day < nowDay) continue;
    for (let hour = SLOT_HOURS_UTC.first; hour <= SLOT_HOURS_UTC.last; hour++) {
      if (day === nowDay && hour < nowHour) continue;
      for (let i = 0; i < SLOTS_PER_HOUR; i++) {
        const minute = i * (60 / SLOTS_PER_HOUR);
        if (day === nowDay && hour === nowHour && minute < nowMinute) continue;
        slots += 1;
      }
    }
  }
  return slots;
}

/**
 * The pacing decision.
 *
 * ⚠️ THE POINT IS THAT SPACING IS IRREGULAR, NOT THAT TIMING IS RANDOM. Vercel
 * cron fires on a fixed UTC schedule and cannot be jittered, so randomness has
 * to live here: each slot sends with probability (remaining / slotsLeft), which
 * spreads the quota unevenly across the week and never produces the same
 * pattern twice.
 *
 * The guarantee at the end of the week is deliberate: once slots left equals
 * sends left, every remaining slot fires. Without it the quota would be missed
 * roughly half the time and the "steady rate" Postmaster asks for would drift
 * downward week over week.
 *
 * ⚠️ RESIDUAL, STATED RATHER THAN HIDDEN: sends still land on a quarter-hour
 * boundary, because that is when the cron runs. `:00/:15/:30/:45` across a
 * randomised weekday spread is not a detectable pattern; a fixed daily `:00`
 * would have been. A 0–14 minute in-invocation sleep would remove even that and
 * was rejected as paying for idle compute.
 */
export function shouldSendNow(
  sentThisWeek: number,
  slotsLeft: number,
  random: number,
  quota: number = WEEKLY_QUOTA_PER_COMPANY
): boolean {
  const remaining = quota - sentThisWeek;
  if (remaining <= 0) return false;
  if (slotsLeft <= remaining) return true;
  return random < remaining / slotsLeft;
}

/**
 * Which of the four inboxes this send goes to.
 *
 * `companyOffset` staggers the tenants so Worth Properties and H&H do not hit
 * the same mailbox in lockstep, and the week number rotates the starting point
 * so the same company/recipient pairing does not recur every Monday.
 */
export function recipientFor(
  sentThisWeek: number,
  week: number,
  companyOffset: number
): string {
  const n = WARMING_RECIPIENTS.length;
  // ⚠️ `week` ENTERS UNSCALED, and that is not an accident. The first cut wrote
  // `week * WEEKLY_QUOTA_PER_COMPANY`, which is INERT: the quota is 12, there
  // are 4 recipients, and 12 % 4 === 0, so multiplying by the week contributed
  // nothing at all and every week opened on the same inbox. Caught by
  // 'the starting inbox moves week to week'. Any future change to either
  // constant should re-run that test rather than trusting this line.
  return WARMING_RECIPIENTS[(week + sentThisWeek + companyOffset) % n];
}

export interface WarmingMessage {
  subject: string;
  body: string;
}

/** Compose one message. Pure — index and clock in, text out. */
export function composeWarmingMessage(
  companyName: string,
  index: number,
  now: Date
): WarmingMessage {
  const i = ((index % SUBJECTS.length) + SUBJECTS.length) % SUBJECTS.length;
  // 13:00–15:59 UTC is 09:00–11:59 EDT — the only slots that are honestly morning.
  const morning = now.getUTCHours() < 16;
  const subject = SUBJECTS[i]
    .replace('{company}', companyName)
    .replace('{weekday}', WEEKDAY_NAMES[now.getUTCDay()]);
  return { subject, body: BODIES[i % BODIES.length](companyName, morning) };
}

// ---------------------------------------------------------------------------
// The run.
// ---------------------------------------------------------------------------

export interface WarmingCompany {
  id: string;
  name: string;
  slug: string;
}

export interface WarmingOutcome {
  considered: number;
  sent: Array<{ company: string; to: string; subject: string }>;
  skipped: Array<{ company: string; reason: string }>;
  errors: string[];
}

/**
 * One cron tick.
 *
 * The LOOP lives here and the route is the auth gate plus the real clock — the
 * split every cron in this repo uses, and what lets a harness drive this with an
 * injected clock and an injected random.
 */
export async function runEmailWarming(
  admin: SupabaseClient<Database>,
  now: Date,
  random: () => number = Math.random
): Promise<WarmingOutcome> {
  const outcome: WarmingOutcome = { considered: 0, sent: [], skipped: [], errors: [] };

  // ⚠️ THE ERROR IS READ, NOT DISCARDED. A destructure of `data` alone would
  // make "the query failed" and "no company is enabled" the same silent no-op —
  // the pattern that hid a Purchase orphan (S104), a deleted storage object
  // (S107) and a missing DNS tool. A warming sender that quietly stops is
  // exactly the failure nobody would notice.
  const { data: companies, error: companiesError } = await admin
    .from('companies')
    .select('id, name, slug')
    .eq('email_warming_enabled', true)
    .order('slug', { ascending: true });

  if (companiesError) {
    outcome.errors.push(`companies query failed: ${companiesError.message}`);
    console.error('[warming] companies query failed', companiesError.message);
    return outcome;
  }

  const enabled = (companies ?? []) as WarmingCompany[];
  outcome.considered = enabled.length;
  if (enabled.length === 0) return outcome;

  const { week } = isoWeek(now);
  const since = weekStart(now).toISOString();
  const slotsLeft = slotsRemainingInWeek(now);

  for (const [offset, company] of enabled.entries()) {
    // Count THIS COMPANY's warming sends this ISO week. `email_logs` is the
    // ledger; no separate state table exists and none is needed.
    //
    // ⚠️ `status` IS DELIBERATELY NOT FILTERED. A refused or failed send still
    // consumed its slot, and counting only successes would make a broken send
    // path retry every quarter-hour for the rest of the week — turning a
    // delivery problem into a volume problem, on the one domain that cannot
    // afford one.
    const { count, error: countError } = await admin
      .from('email_logs')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', company.id)
      .eq('email_type', 'warming')
      .gte('created_at', since);

    if (countError) {
      outcome.errors.push(`${company.slug}: count failed: ${countError.message}`);
      console.error('[warming] count failed', { slug: company.slug, message: countError.message });
      continue;
    }

    const sentThisWeek = count ?? 0;
    if (!shouldSendNow(sentThisWeek, slotsLeft, random())) {
      outcome.skipped.push({
        company: company.slug,
        reason: `not this slot (${sentThisWeek}/${WEEKLY_QUOTA_PER_COMPANY} sent, ${slotsLeft} slots left)`,
      });
      continue;
    }

    const to = recipientFor(sentThisWeek, week, offset);
    const { subject, body } = composeWarmingMessage(company.name, sentThisWeek + offset, now);
    const from = buildSenderAddress({ name: company.name, slug: company.slug });

    let messageId: string | null = null;
    let error: string | null = null;
    try {
      const result = await sendEmail({
        from,
        to,
        subject,
        // Reply-To resolves to the SENDING COMPANY [Josh]: a reply must be a
        // real reply to a real address, because a reply is the signal that
        // counts for most and the copy asks for one.
        replyToCompanyId: company.id,
        react: WarmingEmail({ body, preview: subject }),
        // ⚠️ NO `unsubscribe`. RULED [Josh]: skip List-Unsubscribe. The ruled
        // scope is the recurring CLIENT class (reminder, co_reminder,
        // invoice_reminder) and adding a 'warming' scope would mean a second
        // migration to widen a CHECK constraint — for an opt-out on mail to
        // Josh's own four inboxes, which he controls by flipping the column.
      });
      messageId = result.messageId;
      error = result.error;
    } catch (err: unknown) {
      error = err instanceof Error ? err.message : 'send failed';
    }

    // Logged on success AND failure, like every other sender. This row IS the
    // "what, when, from which company" record the build asked for, and — now
    // that the Resend webhook is live — `delivered_at` / `opened_at` on it are
    // the only measurement of whether any of this worked.
    await logEmail(admin, {
      company_id: company.id,
      estimate_id: null,
      signing_session_id: null,
      resend_message_id: messageId,
      email_type: 'warming',
      recipient_email: to,
      sender_email: from,
      subject,
      status: error ? 'failed' : 'sent',
      metadata: {
        week,
        slot_index: sentThisWeek,
        slots_left_at_decision: slotsLeft,
        ...(error ? { error } : {}),
      },
    });

    if (error) {
      outcome.errors.push(`${company.slug}: ${error}`);
      console.error('[warming] send failed', { slug: company.slug, to, message: error });
    } else {
      outcome.sent.push({ company: company.slug, to, subject });
    }
  }

  return outcome;
}
