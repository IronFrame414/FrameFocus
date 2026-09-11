import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import { brand } from '@/lib/brand';
import {
  SENDING_DOMAIN,
  buildSenderAddress,
  logEmail,
  sendEmail,
  type EmailType,
} from '@/lib/services/email-service';
import { AuthEmail, type AuthEmailKind } from '@/lib/email/templates/auth-email';

// ===========================================================================
// P1 + P2 + P3 [S160] — Supabase Auth's email, delivered by us.
// ===========================================================================
//
// THE PROBLEM, from `S159-invite-email-investigation.md` §4. Four surfaces —
// sign-up, INVITE ACCEPTANCE, forgot-password and the team page's reset — call
// GoTrue, which on production has `smtp_host: null`. So they went out over
// Supabase's built-in shared mailer: no SPF/DKIM/DMARC alignment to
// `ezcontractorbinder.com`, a project-wide cap of **2 emails per hour**, and no
// `email_logs` row. Meanwhile every email the app composes itself has gone over
// Resend on the aligned domain since S135.
//
// ---------------------------------------------------------------------------
// ⚠️ THE SEND EMAIL HOOK, NOT CUSTOM SMTP — and the reason is P2
// ---------------------------------------------------------------------------
// Both routes fix deliverability. Only one fixes the invisibility.
//
//   * CUSTOM SMTP — point GoTrue at Resend's SMTP relay. Two config fields, no
//     code. GoTrue still composes the email from its own templates, still
//     decides the From address, and **still tells us nothing**: there is no
//     moment at which our code runs, so there is nowhere to call `logEmail()`
//     from. P2 would need its own plumbing — a Resend webhook correlation by
//     recipient and subject, which is guesswork.
//   * SEND EMAIL HOOK — GoTrue POSTs the payload here and sends nothing itself.
//     Our code renders, calls `sendEmail()` and calls `logEmail()`. **P2 falls
//     out of P1 for free**, which is exactly what Josh asked to be preferred,
//     and it is also what makes P3 possible at all (below).
//
// The cap goes away as a CONSEQUENCE rather than being raised:
// `rate_limit_email_sent` governs GoTrue's own mailer, and once GoTrue is not
// sending, Resend's limits are the only ones left.
//
// ---------------------------------------------------------------------------
// ⚠️ P3 — AN INVITED USER IS CONFIRMED HERE, AND `mailer_autoconfirm` IS NOT
//        TOUCHED. [RULED Josh, S160]
// ---------------------------------------------------------------------------
// The ruling is that INVITED users do not confirm their email. The obvious
// implementation — flipping `mailer_autoconfirm` to true — is the wrong one and
// was explicitly refused: that flag is PROJECT-WIDE, so it would also skip
// confirmation for PUBLIC sign-ups, where the address is self-asserted and
// nobody has vouched for it. That is a real weakening and is not what was
// ruled.
//
// So the distinction is drawn HERE, per message, where the two cases are
// actually distinguishable:
//
//   · an INVITED signup  → confirm the user, send nothing, return 200.
//   · a PUBLIC signup    → send the confirmation exactly as before, over Resend.
//
// **Why an invited address is already proven, in one step.** `handle_new_user()`
// raises `check_violation` when `get_invitation_for_signup()` cannot resolve the
// token — status pending, not deleted, `expires_at > now()`. A raise inside the
// `auth.users` insert means **no auth user is created**, so no hook fires. The
// mere existence of a user carrying an `invitation_token` is therefore already
// proof the trigger validated it. Josh's reasoning, recorded: *"an invitee
// arrived through a link only they could have received, at an address the
// inviter typed. The invitation already establishes what the confirmation
// re-proves, and it is the step most likely to fail."*
//
// **The token is re-checked anyway** — see `invitedCompanyFor()`. `user_metadata`
// is user-controlled, and a public signup can put any string in it. The argument
// above depends on a trigger that this repository did not create until S135 and
// that production had configured BY HAND (`20260914000000` §1). A check that
// costs one indexed lookup is not worth skipping on the strength of "the trigger
// would have stopped them".

/**
 * GoTrue's `email_action_type`. `email_change_current` / `email_change_new` are
 * the two halves of a secure email change (`mailer_secure_email_change_enabled`
 * is true on production), and both are real values on the wire.
 */
export type AuthEmailAction =
  | 'signup'
  | 'recovery'
  | 'magiclink'
  | 'invite'
  | 'email_change'
  | 'email_change_current'
  | 'email_change_new'
  | 'reauthentication';

/** The Send Email Hook payload, as GoTrue posts it. */
export interface AuthEmailPayload {
  user: {
    id: string;
    email: string;
    user_metadata?: Record<string, unknown> | null;
  };
  email_data: {
    token: string;
    token_hash: string;
    redirect_to: string;
    email_action_type: string;
    site_url: string;
    token_new?: string;
    token_hash_new?: string;
  };
}

export interface AuthEmailOutcome {
  /** What happened, for the route's response body and for the tests. */
  action: AuthEmailAction | 'unknown';
  /** True when P3 short-circuited: user confirmed, no email sent. */
  autoConfirmedInvite: boolean;
  sent: boolean;
  logged: boolean;
  error: string | null;
  /**
   * ⚠️ WHY THE LOG ROW IS MISSING, OR WHY P3 DID NOT FIRE — in words.
   *
   * Added 2026-09-10 after `auth_signup_confirmation` was found to have ZERO
   * rows on production while the mail was demonstrably delivering. Every path
   * that ends in "no row" or "sent anyway" now says which one it was, and the
   * route puts this in its 200 body and in the Vercel log line. Null when
   * nothing noteworthy happened.
   */
  diagnosis?: string | null;
}

/**
 * `email_action_type` → the `email_types` row it logs under, and the copy it
 * renders. `email_change_current` and `email_change_new` deliberately collapse
 * onto one type: they are two messages from ONE user action, and splitting them
 * would make `email_logs` imply two different things happened.
 */
const ACTIONS: Record<
  AuthEmailAction,
  { emailType: EmailType; kind: AuthEmailKind }
> = {
  signup: { emailType: 'auth_signup_confirmation', kind: 'confirm_signup' },
  recovery: { emailType: 'auth_recovery', kind: 'recover_password' },
  magiclink: { emailType: 'auth_magic_link', kind: 'magic_link' },
  invite: { emailType: 'auth_invite', kind: 'auth_invite' },
  email_change: { emailType: 'auth_email_change', kind: 'change_email' },
  email_change_current: { emailType: 'auth_email_change', kind: 'change_email' },
  email_change_new: { emailType: 'auth_email_change', kind: 'change_email' },
  reauthentication: { emailType: 'auth_reauthentication', kind: 'reauthenticate' },
};

/**
 * The verification URL GoTrue would have put in its own template.
 *
 * ⚠️ BUILT FROM `token_hash`, NEVER FROM `token`. `token` is the raw 6-digit (or
 * 8-digit — `mailer_otp_length` is 8 on production) OTP a human types;
 * `token_hash` is what `/auth/v1/verify` accepts in a link. Swapping them
 * produces a link that always fails verification, and it fails at the far end,
 * on someone else's screen, with no error anywhere near this code.
 *
 * `redirect_to` is GoTrue's own — it comes from the client's `emailRedirectTo`
 * and has ALREADY been checked against the project's `uri_allow_list`. Passing
 * it through unchanged is what keeps that check meaningful; constructing our own
 * destination here would route around it.
 */
export function buildVerifyUrl(
  supabaseUrl: string,
  emailData: AuthEmailPayload['email_data'],
  /** The `email_change_new` half verifies with the NEW address's hash. */
  useNewToken = false
): string {
  const hash =
    useNewToken && emailData.token_hash_new ? emailData.token_hash_new : emailData.token_hash;
  const base = supabaseUrl.replace(/\/+$/, '');
  const params = new URLSearchParams({
    token: hash,
    type: emailData.email_action_type,
  });
  if (emailData.redirect_to) params.set('redirect_to', emailData.redirect_to);
  return `${base}/auth/v1/verify?${params.toString()}`;
}

/**
 * The company whose identity this email goes out under, and whose `company_id`
 * the log row needs.
 *
 * ⚠️ THE OLD REASON GIVEN HERE WAS STALE BY TWELVE DAYS. Quoted rather than
 * deleted, because it is the sentence that made a later reader (me) believe a
 * database constraint was involved in the missing-log defect:
 *
 *   "`email_logs.company_id` IS NOT NULL [LIVE], which is why this is resolved
 *    rather than defaulted."
 *
 * It stopped being true on 2026-08-30. `20261054000000` (deletion sweep §3)
 * dropped that NOT NULL and made the FK `ON DELETE SET NULL`, so a tenant's mail
 * record outlives the tenant. The column has been nullable ever since, on BOTH
 * databases (verified: `is_nullable = YES` on rebuild-test and production).
 *
 * So the sender is resolved here for the FROM LINE, not to satisfy a
 * constraint — and the missing `email_logs` rows were caused by a CODE branch
 * skipping `logEmail()`, never by a rejected INSERT.
 *
 * ⚠️ THE COMMENT THAT STOOD HERE WAS RIGHT ABOUT THE TRIGGER AND WRONG ABOUT
 * VISIBILITY. Quoted rather than deleted, because it is the reason nobody
 * looked:
 *
 *   "Every real case has one by the time the hook runs — the `auth.users`
 *    trigger creates the profile (and, on the owner path, the company) INSIDE
 *    the insert, so the row exists before GoTrue gets as far as sending."
 *
 * The trigger half is correct. `handle_new_user()` does create the profile
 * inside the insert. But INSIDE THE INSERT IS INSIDE A TRANSACTION, and this
 * function reads over a SEPARATE CONNECTION through `getSupabaseAdmin()`. A row
 * written by an uncommitted transaction is invisible from outside it. So the
 * sentence describes precisely why the code ought to work while naming the
 * exact reason it cannot.
 *
 * WHAT IT SHOULD HAVE SAID: on RECOVERY, MAGIC LINK, EMAIL CHANGE and
 * REAUTHENTICATION the user is long committed and this resolves normally. On
 * SIGNUP it resolves to null essentially always, because a signup is by
 * definition the case where the profile is newest — GoTrue calls the hook
 * during the signup request, and the row it needs is still inside that
 * request's open transaction.
 *
 * MEASURED, 2026-09-10: production `email_logs` held 37 `invite` rows,
 * 1 `auth_recovery` row and ZERO `auth_signup_confirmation` rows, while signup
 * confirmations were demonstrably being delivered. An invited crew member's
 * invitation row was written at 21:40:45 and their profile at 21:41:04 —
 * nineteen seconds later, inside the transaction the hook was already running
 * against.
 *
 * ⚠️ AND THE CONSEQUENCE IS NOT ONLY A MISSING LOG ROW. `sender` gates the From
 * line as well, so every signup confirmation goes out as
 * `no-reply@ezcontractorbinder.com` rather than under the tenant's name — a
 * second From address accumulating its own sending reputation on a domain with
 * very little. See `docs/specs/email-deliverability-diagnosis.md` §6 and §7.
 *
 * The trade below still holds and is unchanged: when the sender cannot be
 * resolved the email STILL GOES OUT and only the LOG is skipped. An unsent
 * email is a user-visible failure; an unlogged one is a bookkeeping gap, and
 * trading the first for the second would be the wrong way round. What was wrong
 * was believing this path was rare.
 */
type SenderResolution =
  | { sender: { companyId: string; from: string }; reason: null }
  | { sender: null; reason: string };

async function senderFor(
  admin: SupabaseClient<Database>,
  userId: string
): Promise<SenderResolution> {
  // ⚠️ THE ERROR IS READ, NOT DISCARDED [2026-09-10]. This function previously
  // destructured `data` alone on BOTH queries, which made "the query failed"
  // and "the row is not there" produce an identical null — and therefore an
  // identical silent skip of logEmail(). That is the FOURTH instance of this
  // pattern in this campaign: the S104 Purchase orphan, S107's cached storage
  // read, the absent DNS tool that read as a missing DNS record, and this.
  //
  // The four differ in subject and are the same defect: a result destructured
  // for its happy path, so the failure arrives wearing the empty case's
  // clothes. Reading the error does not fix anything here — it makes the
  // question answerable, which it was not.
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('company_id')
    .eq('user_id', userId)
    .eq('is_deleted', false)
    .maybeSingle();

  if (profileError) {
    return { sender: null, reason: `profiles query FAILED: ${profileError.message}` };
  }
  if (!profile) {
    // The expected shape of the signup case: the row exists inside the
    // uncommitted insert and is invisible from this connection. Named as
    // "not visible" rather than "missing" because those are different facts and
    // only one of them is a bug.
    return { sender: null, reason: 'no profiles row VISIBLE for this user' };
  }

  const companyId = (profile as { company_id: string }).company_id;
  const { data: company, error: companyError } = await admin
    .from('companies')
    .select('name, slug')
    .eq('id', companyId)
    .maybeSingle();

  if (companyError) {
    return { sender: null, reason: `companies query FAILED: ${companyError.message}` };
  }
  if (!company) {
    return { sender: null, reason: `no companies row VISIBLE for ${companyId}` };
  }

  const co = company as { name: string; slug: string };
  return { sender: { companyId, from: buildSenderAddress(co) }, reason: null };
}

/**
 * Did this user arrive on a real invitation? Returns the invitation's company
 * id, or null.
 *
 * The token is read from `user_metadata` — where `accept-invite.tsx` puts it and
 * where `handle_new_user()` reads it from — and then CHECKED against the row, on
 * both token and address. See the header for why the check is kept even though
 * the trigger has already enforced it.
 *
 * `status` is deliberately NOT filtered. By the time this runs the trigger has
 * already set it to `accepted`, so requiring `pending` would match nothing and
 * silently turn P3 off — a bug that would look exactly like "the ruling was
 * never implemented".
 */
export async function invitedCompanyFor(
  admin: SupabaseClient<Database>,
  user: AuthEmailPayload['user']
): Promise<string | null> {
  const raw = user.user_metadata?.invitation_token;
  if (typeof raw !== 'string' || raw.length === 0) return null;

  // ⚠️ THE ERROR IS READ, NOT DISCARDED [2026-09-10] — same pattern as
  // senderFor above, and this one is NOT merely a bookkeeping gap. A null here
  // silently turns P3 OFF: the invited user is not auto-confirmed and is sent a
  // confirmation email instead. That is user-visible, and it is
  // indistinguishable from "this token is not an invitation" unless the error
  // is read.
  const { data, error } = await admin
    .from('invitations')
    .select('id, company_id, email')
    .eq('token', raw)
    .eq('is_deleted', false)
    .maybeSingle();
  if (error) {
    console.error('auth email hook: invitations lookup FAILED; treating as not invited', {
      route: 'POST /api/auth/send-email',
      user_id: user.id,
      message: error.message,
    });
    return null;
  }
  if (!data) return null;

  const inv = data as { company_id: string; email: string };
  // The address must match the one the inviter typed. Without this, a token
  // seen anywhere could confirm an address of the holder's choosing.
  if (inv.email.trim().toLowerCase() !== user.email.trim().toLowerCase()) return null;

  return inv.company_id;
}

// ===========================================================================
// THE AUTH-EMAIL RATE CAP — RULED [Josh, 2026-09-11]
// ===========================================================================
// ⚠️ REPLACING A BOUND THAT WAS SILENTLY REMOVED. While GoTrue was the sender,
// Supabase enforced `rate_limit_email_sent` = 2 per hour, PROJECT-WIDE. Turning
// on the Send Email Hook moved sending into this application and that limit
// stopped binding — and NOTHING replaced it. The effective cap became the Resend
// plan quota, shared with every invoice, proposal and the warming sender, which
// is the wrong thing to exhaust and the wrong place to discover it.
//
// TWO CEILINGS, because one number cannot do both jobs:
//
//   · PER ADDRESS, PER HOUR — the realistic loop: a retry storm on one account,
//     or a signup form hammered.
//   · PROJECT-WIDE, PER HOUR — the blast radius. GoTrue's limit was project-wide;
//     removing it with only a per-address cap leaves nothing between a bug that
//     enumerates addresses and the Resend quota.
//
// ⚠️ THREE IS NOT TWO, AND THE DIFFERENCE IS DELIBERATE [Josh]. A person
// legitimately retrying a password reset — "did that send?", check spam, try
// again — must not be stopped by the mechanism meant to stop a loop.
//
// ⚠️ AND `auth_recovery` IS EXEMPT FROM THE GLOBAL CEILING [Josh]. A
// platform-wide incident must never take away the way back in. A recovery email
// is somebody's only route to their own account, and a global counter is a
// shared resource they cannot influence or even see — being refused because
// other users are busy is not a trade this product makes. The PER-ADDRESS cap
// still applies to recovery, because that one IS about their own behaviour.
//
// ON EXCEEDING: refuse the send, WRITE THE email_logs ROW as 'failed' with the
// reason, and still return 2xx. A throttled auth email must be visible in the
// same table as everything else — invisibility is the defect this whole session
// has been unpicking.
export const AUTH_RATE_PER_ADDRESS_HOURLY = 3;
export const AUTH_RATE_GLOBAL_HOURLY = 50;
/** Exempt from the GLOBAL ceiling only; the per-address cap still applies. */
const GLOBAL_CEILING_EXEMPT: ReadonlySet<EmailType> = new Set(['auth_recovery']);

export type RateDecision = { allowed: true } | { allowed: false; reason: string };

/**
 * Pure, so the policy can be asserted without a database — the shape
 * `emailSendAllowed` and `recipientIsDeliverable` already use.
 */
export function authRateDecision(
  emailType: EmailType,
  sentToAddressThisHour: number,
  sentGloballyThisHour: number
): RateDecision {
  if (sentToAddressThisHour >= AUTH_RATE_PER_ADDRESS_HOURLY) {
    return {
      allowed: false,
      reason: `rate cap: ${sentToAddressThisHour} auth emails to this address in the last hour (limit ${AUTH_RATE_PER_ADDRESS_HOURLY})`,
    };
  }
  if (GLOBAL_CEILING_EXEMPT.has(emailType)) return { allowed: true };
  if (sentGloballyThisHour >= AUTH_RATE_GLOBAL_HOURLY) {
    return {
      allowed: false,
      reason: `rate cap: ${sentGloballyThisHour} auth emails platform-wide in the last hour (limit ${AUTH_RATE_GLOBAL_HOURLY})`,
    };
  }
  return { allowed: true };
}

/**
 * Counts this hour's auth mail, from `email_logs`.
 *
 * ⚠️ THIS IS WHY THE LOGGING FIX HAD TO LAND FIRST. Before 20261610000000,
 * signup confirmations wrote NO ROW, so a counter reading this table would have
 * seen zero of them however many went out — a cap that counted everything except
 * the highest-volume thing it was capping.
 *
 * ⚠️ `status` IS NOT FILTERED. A refused or failed send still means the send
 * path ran; counting only successes would let a failing loop retry forever at
 * full speed, which is the exact shape this exists to stop.
 *
 * FAILS OPEN, and that is the ruled trade: if the count cannot be read, the
 * email goes. An unsent password reset is a person locked out of their account;
 * an uncapped hour is a bill. The console line names it either way.
 */
async function authRateCounts(
  admin: SupabaseClient<Database>,
  recipientEmail: string
): Promise<{ address: number; global: number } | null> {
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const [addressRes, globalRes] = await Promise.all([
    admin
      .from('email_logs')
      .select('id', { count: 'exact', head: true })
      .like('email_type', 'auth\\_%')
      .ilike('recipient_email', recipientEmail)
      .gte('created_at', since),
    admin
      .from('email_logs')
      .select('id', { count: 'exact', head: true })
      .like('email_type', 'auth\\_%')
      .gte('created_at', since),
  ]);

  if (addressRes.error || globalRes.error) {
    console.error('auth email hook: rate-cap count failed; allowing the send', {
      route: 'POST /api/auth/send-email',
      message: addressRes.error?.message ?? globalRes.error?.message,
    });
    return null;
  }
  return { address: addressRes.count ?? 0, global: globalRes.count ?? 0 };
}

/**
 * Is the in-transaction autoconfirm trigger actually installed?
 *
 * ⚠️ FEATURE DETECTION, NOT A FLAG. `invited_signup_autoconfirm_installed()`
 * (20261600000000) reads `pg_trigger` at call time, so it reports what is
 * really there rather than what somebody remembered to record.
 *
 * FAILS SAFE: a missing function, a permissions problem or any other error
 * returns FALSE, which sends the confirmation email — the behaviour that
 * shipped before this mechanism existed.
 */
async function autoconfirmTriggerInstalled(
  admin: SupabaseClient<Database>
): Promise<boolean> {
  const { data, error } = await admin.rpc('invited_signup_autoconfirm_installed');
  if (error) {
    console.error('auth email hook: autoconfirm feature-detection failed; assuming absent', {
      route: 'POST /api/auth/send-email',
      message: error.message,
    });
    return false;
  }
  return data === true;
}

type ConfirmationState =
  /** GoTrue can see the user and they are confirmed. */
  | 'confirmed'
  /** GoTrue can see the user and they are NOT confirmed — the trigger did not fire. */
  | 'committed_unconfirmed'
  /** GoTrue cannot see the user: mid-transaction, the normal signup case. */
  | 'not_visible'
  /** Anything else. Treated as doubt, and doubt sends the email. */
  | 'unknown';

/**
 * What GoTrue currently believes about this user's confirmation.
 *
 * ⚠️ 'User not found' IS THE EXPECTED ANSWER ON SIGNUP, not an error. It is the
 * same invisibility that broke the old P3, read deliberately this time: it tells
 * us the signup transaction is still open, which is precisely when the
 * in-transaction trigger is the right thing to trust.
 *
 * The valuable answer is `committed_unconfirmed` — the user IS visible and is
 * still unconfirmed, which means the trigger has already had its chance and did
 * not take it. That is the only way this code can catch a silently swallowed
 * trigger failure, and it is why the trigger is allowed to swallow at all.
 */
async function confirmationState(
  admin: SupabaseClient<Database>,
  userId: string
): Promise<ConfirmationState> {
  try {
    const { data, error } = await admin.auth.admin.getUserById(userId);
    if (error) {
      const status = (error as { status?: number }).status;
      if (status === 404 || /not found/i.test(error.message)) return 'not_visible';
      console.error('auth email hook: could not read confirmation state', {
        route: 'POST /api/auth/send-email',
        user_id: userId,
        message: error.message,
      });
      return 'unknown';
    }
    if (!data?.user) return 'not_visible';
    return data.user.email_confirmed_at ? 'confirmed' : 'committed_unconfirmed';
  } catch (err: unknown) {
    console.error('auth email hook: confirmation-state lookup threw', {
      route: 'POST /api/auth/send-email',
      user_id: userId,
      message: err instanceof Error ? err.message : 'unknown',
    });
    return 'unknown';
  }
}

/**
 * Handle one Send Email Hook payload: confirm-and-skip, or render, send and log.
 *
 * NEVER THROWS. GoTrue treats a non-2xx as a failed auth operation, so a thrown
 * error here does not merely lose an email — it fails the user's sign-up or
 * password reset outright. Everything is reported through the return value and
 * the caller answers 200 whenever the payload was authentic.
 */
export async function handleAuthEmail(
  admin: SupabaseClient<Database>,
  payload: AuthEmailPayload,
  supabaseUrl: string
): Promise<AuthEmailOutcome> {
  const actionRaw = payload.email_data.email_action_type;
  const action = (actionRaw in ACTIONS ? actionRaw : 'unknown') as AuthEmailAction | 'unknown';
  /** Set only when P3 was reached and did not short-circuit. See below. */
  let p3Diagnosis: string | null = null;

  // ── P3 ────────────────────────────────────────────────────────────────────
  //
  // ⚠️ REBUILT 2026-09-10. The old version called
  // `admin.auth.admin.updateUserById(id, { email_confirm: true })` from here and
  // suppressed the email only if that succeeded. It NEVER succeeded: GoTrue
  // calls this hook DURING the signup request, before the `auth.users` insert
  // commits, and the admin API reaches GoTrue over HTTP on a different
  // connection. Production, 21:41:04: `message: 'User not found'` — GoTrue
  // naming the cause itself. So every invited user fell through and was mailed a
  // confirmation they should never have received, and P3 had been silently off
  // since it shipped.
  //
  // THE CONFIRM NOW HAPPENS IN THE TRANSACTION, in the
  // `on_auth_user_created_autoconfirm` trigger (20261600000000), where the row
  // is visible. That call is gone from here rather than kept as a fallback: it
  // cannot work in this flow, and a call that always errors is noise that has
  // already cost one investigation.
  //
  // ⚠️ THIS CODE'S JOB IS NARROWER NOW, AND IT IS THE DANGEROUS HALF. Deciding
  // to suppress the email is a decision to make someone's only route into their
  // account unnecessary. If that judgement is wrong the user is not merely
  // un-emailed, they are LOCKED OUT with no self-service fix. So suppression
  // requires THREE things to hold, and any doubt sends the email — which is
  // exactly today's behaviour, so the failure mode of this whole mechanism is
  // "no change".
  if (action === 'signup') {
    const invitedCompanyId = await invitedCompanyFor(admin, payload.user);

    if (!invitedCompanyId) {
      // A public signup, or a token that does not match this address. Either
      // way the address is unverified and the email is the verification.
      p3Diagnosis = 'P3: NOT suppressed — no invitation matched this token and address';
    } else if (!(await autoconfirmTriggerInstalled(admin))) {
      // (2) `apps/web` deploys from `main` while migrations are applied by hand,
      // so the two can skew. Suppressing against a database without the trigger
      // would lock out every invited user.
      p3Diagnosis =
        'P3: NOT suppressed — the in-transaction autoconfirm trigger is NOT installed ' +
        '(migration 20261600000000 not applied to this database); sent the confirmation instead';
    } else {
      // (3) THE LOCKOUT GUARD, and it is a READ rather than an assumption.
      //
      // If GoTrue can see this user, the signup transaction has committed and
      // the trigger has had its chance — so `email_confirmed_at` is the truth
      // about whether it worked. If GoTrue CANNOT see them ('User not found'),
      // we are mid-transaction, which is the normal signup case and the one
      // where trusting the trigger is correct.
      const confirmed = await confirmationState(admin, payload.user.id);
      if (confirmed === 'committed_unconfirmed') {
        p3Diagnosis =
          'P3: NOT suppressed — the user is committed and STILL UNCONFIRMED, so the ' +
          'autoconfirm trigger did not confirm them; sent the confirmation instead';
      } else if (confirmed === 'unknown') {
        p3Diagnosis =
          'P3: NOT suppressed — could not establish whether the user is confirmed; ' +
          'sent the confirmation rather than risk a lockout';
      } else {
        return {
          action,
          autoConfirmedInvite: true,
          sent: false,
          logged: false,
          error: null,
          diagnosis:
            `P3: SUPPRESSED — invited to company ${invitedCompanyId}; auto-confirmed ` +
            `in-transaction by on_auth_user_created_autoconfirm` +
            (confirmed === 'confirmed' ? ' (verified: user is confirmed)' : ' (user not yet visible: mid-transaction, as expected on signup)'),
        };
      }
    }
  }

  if (action === 'unknown') {
    // A GoTrue version that grows a new action type must not silently drop the
    // email — that is the S159 defect in a new place. Refused loudly instead, so
    // it surfaces as a failed auth operation rather than as nothing at all.
    console.error('auth email hook: unrecognised email_action_type', {
      route: 'POST /api/auth/send-email',
      email_action_type: actionRaw,
    });
    return {
      action,
      autoConfirmedInvite: false,
      sent: false,
      logged: false,
      error: `Unrecognised email_action_type "${actionRaw}"`,
    };
  }

  const { emailType, kind } = ACTIONS[action];
  const verifyUrl = buildVerifyUrl(
    supabaseUrl,
    payload.email_data,
    action === 'email_change_new'
  );

  const { sender, reason: senderReason } = await senderFor(admin, payload.user.id);

  // ⚠️ THE LOG'S COMPANY IS RESOLVED SEPARATELY FROM THE SENDER'S, and the
  // order is deliberate [2026-09-10].
  //
  // `senderFor()` reads `profiles`, which on SIGNUP is inside the still-open
  // transaction and therefore invisible — that is the whole defect. The
  // INVITATION, by contrast, was committed before the user ever clicked: in the
  // measured case, 21:40:45 against a profile at 21:41:04, nineteen seconds
  // earlier. So an invited signup that falls through to sending — exactly the
  // case we most want a record of, because it means P3 declined to suppress —
  // now logs against a real tenant.
  //
  // Falls back to the sender's company for every already-committed action
  // (recovery, magic link, email change, reauthentication), which is where it
  // has always come from.
  const logCompanyId =
    sender?.companyId ?? (action === 'signup' ? await invitedCompanyFor(admin, payload.user) : null);
  // The platform fallback exists only for the case with no resolvable company.
  // It is a real, verified address on the same domain, so alignment holds even
  // here; what is lost is the tenant's name on the From line.
  //
  // ⚠️ ON SIGNUP THIS IS NOT A FALLBACK, IT IS THE ONLY PATH [measured
  // 2026-09-10]. `sender` gates BOTH this line and the logEmail() call below,
  // so a null here produces a `no-reply@` From AND no `email_logs` row, from one
  // cause. Production had 37 `invite` rows, 1 `auth_recovery` row and ZERO
  // `auth_signup_confirmation` rows while confirmations were demonstrably
  // delivering. See `docs/specs/email-deliverability-diagnosis.md` §7.
  const from = sender?.from ?? `${brand.name} <no-reply@${SENDING_DOMAIN}>`;
  const subject = subjectFor(kind);

  let messageId: string | null = null;
  let error: string | null = null;
  let rateRefusal: string | null = null;

  // The cap runs AFTER the sender and subject are resolved, so a refused send
  // still writes a log row that looks like every other one — same type, same
  // From, same subject, status 'failed'. A throttled email that logged a
  // different shape would be invisible to whoever is looking for it.
  const counts = await authRateCounts(admin, payload.user.email);
  if (counts) {
    const decision = authRateDecision(emailType, counts.address, counts.global);
    if (!decision.allowed) rateRefusal = decision.reason;
  }

  if (rateRefusal) {
    error = rateRefusal;
    console.error('auth email hook: REFUSED by the rate cap', {
      route: 'POST /api/auth/send-email',
      user_id: payload.user.id,
      email_action_type: actionRaw,
      reason: rateRefusal,
    });
  } else try {
    const result = await sendEmail({
      from,
      to: payload.user.email,
      subject,
      // ⚠️ NO `replyToCompanyId`. The S97 reply-to rule is for CLIENT-FACING
      // mail, so a client's reply reaches the contractor. These are
      // account-security messages to the account holder; pointing a reply at the
      // company owner's inbox would invite "I didn't request this" reports to
      // land somewhere that cannot act on them.
      react: AuthEmail({ kind, actionUrl: verifyUrl, token: payload.email_data.token }),
    });
    messageId = result.messageId;
    error = result.error;
  } catch (err: unknown) {
    error = err instanceof Error ? err.message : 'Failed to send';
  }

  // ── P2 ────────────────────────────────────────────────────────────────────
  //
  // ⚠️ ALWAYS LOGGED SINCE 2026-09-10. This was `if (sender) { … } else {
  // console.error(…) }`, and on SIGNUP the else branch ran every single time —
  // production held ZERO `auth_signup_confirmation` rows while confirmations
  // were demonstrably delivering. `email_logs.company_id` was NOT NULL and there
  // was nothing to put in it, so the audit trail was skipped rather than the
  // send.
  //
  // `company_id` has been nullable since `20261054000000` (deletion sweep §3,
  // 2026-08-30) — the FK is `ON DELETE SET NULL` so a mail record outlives its
  // tenant. NOTHING had to change in the schema for this fix; the skip was a
  // CODE branch, not a constraint. A public signup confirmation genuinely has no
  // company: `handle_new_user()` is creating it inside the same uncommitted
  // transaction, so there is no id to resolve rather than one that is hidden.
  // Writing null says that; writing a sentinel would have lied in a tenancy
  // column.
  //
  // A null-company row is invisible to every tenant — `email_logs_select_manager`
  // is `company_id = get_my_company_id()`, and `NULL = <uuid>` is NULL, not true
  // — and reachable only by the service role. That is the intended visibility
  // for platform auth mail, not a hole, and it is the same visibility a deleted
  // tenant's surviving rows already have.
  const logId = await logEmail(admin, {
    company_id: logCompanyId,
    estimate_id: null,
    signing_session_id: null,
    resend_message_id: messageId,
    email_type: emailType,
    recipient_email: payload.user.email,
    sender_email: from,
    subject,
    status: error ? 'failed' : 'sent',
    metadata: {
      email_action_type: actionRaw,
      user_id: payload.user.id,
      // Why the row carries no tenant, in the row itself — so the question is
      // answerable from the table without reading this file.
      ...(logCompanyId ? {} : { company_unresolved: senderReason }),
    },
  });
  const logged = logId !== null;

  if (!logCompanyId) {
    console.error('auth email hook: logged WITHOUT a company', {
      route: 'POST /api/auth/send-email',
      user_id: payload.user.id,
      email_action_type: actionRaw,
      reason: senderReason,
    });
  }

  const diagnosis =
    [
      p3Diagnosis,
      rateRefusal ? `NOT SENT — ${rateRefusal}` : null,
      logCompanyId ? null : `logged WITHOUT a company — ${senderReason}`,
      sender ? null : `From fell back to no-reply@ — ${senderReason}`,
    ]
      .filter(Boolean)
      .join('; ') || null;

  return { action, autoConfirmedInvite: false, sent: error === null, logged, error, diagnosis };
}

/** Subjects, ours rather than GoTrue's — see `mailer_subjects_*` in §4.1. */
export function subjectFor(kind: AuthEmailKind): string {
  switch (kind) {
    case 'confirm_signup':
      return `Confirm your ${brand.name} account`;
    case 'recover_password':
      return `Reset your ${brand.name} password`;
    case 'magic_link':
      return `Your ${brand.name} sign-in link`;
    case 'change_email':
      return `Confirm your new ${brand.name} email address`;
    case 'reauthenticate':
      return `Your ${brand.name} verification code`;
    case 'auth_invite':
      return `You have been invited to ${brand.name}`;
  }
}
