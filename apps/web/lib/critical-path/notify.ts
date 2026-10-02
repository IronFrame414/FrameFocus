import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import { getDeadline } from '@vercel/functions';
import { notify, type NotifyRecipient } from '@/lib/notify/notify';
import { resolveMemberReachability } from '@/lib/notify/assignment-notify';
import { buildSenderAddress, logEmail, sendEmail } from '@/lib/services/email-service';
import { NotificationEmail } from '@/lib/email/templates/notification-email';
import {
  assigneeLines,
  assigneeTitle,
  clientFinishEmail,
  unreachableReport,
  UNTOLD_WORDS_EN,
  type ChangedTaskLine,
} from './notify-text';
import { untoldFrom, untoldList } from './untold';

// S122 Part 6 — WHO IS TOLD WHEN A CRITICAL PATH CHANGE MOVES DATES.
//
// [Josh, ruling 11 revised] Notification is chosen PER LINE, PER ASSIGNEE (the
// sheet's "notify of changes", off by default). For each assignee who chose it,
// on a task whose dates this change moved:
//   · an account (a live profile)  → IN-APP (+ push), through notify()
//   · no account, an email on file → EMAIL
//   · neither                      → REPORTED to whoever saved the change (an
//                                    in-app row to the saver), never dropped
// resolveMemberReachability is THE resolver (spec: "Use it. Do not build a
// second resolver."). The saver is not told about their own change.
//
// [Ruling 12 / 6-A] The CLIENT is emailed when the projected finish moves, if
// the box was ticked when Critical Path was turned on — the finish and the
// disclaimer only (notify-text.ts).
//
// ⚠️ A recompute caused only by TIME PASSING notifies nobody: no person changed
// anything, and an open task with stale "days left" would otherwise email the
// same people every day it slides. Flagged to Josh (report, Part 6).
//
// ── [S123 D-3, Josh RULED] THREE STEPS, SO THE SAVE NEVER WAITS FOR MAIL ──────
// "push in background and add popup of anyone who cant be reached. 95% of subs
// will be email only." ⚠️ SUPERSEDED: "keep notifications inside the save
// request" — one Resend round-trip per email-only sub kept the sheet waiting.
//   1. planScheduleNotify   — DB reads only: who chose it, how each one can be
//                             reached, the client's email. WHO IS UNREACHABLE
//                             (no login AND no email) is known HERE, before
//                             anything is sent — it is a fact about the
//                             people, not the result of a send.
//   2. reportUnreachable    — the saver's in-app row naming them. Written INSIDE
//                             the save, so it exists even if the saver has left
//                             the screen before the response arrives (D-3a: the
//                             popup is the fast path, NEVER the only path).
//   3. deliverScheduleNotify — the in-app rows and the emails. Runs AFTER the
//                             response (lib/critical-path/background.ts). Every
//                             email recipient gets an email_logs row: sent,
//                             failed, or NOT SENT because the function's time
//                             limit was near — never nothing.
// Never throws into the save: a failed send is logged and the change stays saved.

/** What a change WILL do: decided inside the save, before anything is sent. */
export interface ScheduleNotifyPlan {
  companyId: string;
  projectId: string;
  projectName: string;
  savedByMemberId: string | null;
  sender: string;
  brand: string;
  origin: string;
  inApp: { memberId: string; recipient: NotifyRecipient; lines: string[] }[];
  email: { memberId: string; email: string; lines: string[] }[];
  /** The client, when the box is ticked, the finish moved, and an email is on file. */
  client: { email: string; previousFinish: string; newFinish: string } | null;
  /** Assignees who chose to be told and cannot be reached: no login, no email. */
  unreachable: string[];
  /** The client box is ticked, the finish moved, but the client contact has no email. */
  clientUnreachable: boolean;
}

/** What the save can say at once (it rides on the recompute outcome). */
export interface ScheduleNotifyPlanned {
  inApp: number;
  email: number;
  client: boolean;
  unreachable: string[];
  clientUnreachable: boolean;
}

/** What the background delivery did (counts of attempts that succeeded). */
export interface ScheduleNotifyOutcome {
  inApp: number;
  emailed: number;
  /** Not attempted because the function's time limit was near; each one has a 'failed' email_logs row saying so. */
  notSent: number;
  clientEmailed: boolean;
}

export const NOTHING_PLANNED: ScheduleNotifyPlanned = { inApp: 0, email: 0, client: false, unreachable: [], clientUnreachable: false };

export function plannedOf(plan: ScheduleNotifyPlan | null): ScheduleNotifyPlanned {
  if (!plan) return NOTHING_PLANNED;
  return {
    inApp: plan.inApp.length,
    email: plan.email.length,
    client: plan.client !== null,
    unreachable: [...plan.unreachable],
    clientUnreachable: plan.clientUnreachable,
  };
}

/** Step 1 — DB reads only. Null when there is nothing to tell anyone. */
export async function planScheduleNotify(
  admin: SupabaseClient<Database>,
  p: {
    companyId: string;
    projectId: string;
    changedTaskIds: string[];
    savedByMemberId: string | null;
    previousFinish: string | null;
    newFinish: string | null;
    causeKind: string;
  }
): Promise<ScheduleNotifyPlan | null> {
  if (p.causeKind === 'time') return null;

  const [project, company, settings] = await Promise.all([
    admin.from('projects').select('name, contact_id').eq('id', p.projectId).single(),
    admin.from('companies').select('name, slug, brand_color').eq('id', p.companyId).single(),
    admin.from('project_schedule_settings').select('notify_client').eq('project_id', p.projectId).eq('is_deleted', false).maybeSingle(),
  ]);
  if (project.error || company.error) {
    console.error(`[cp notify] ${p.projectId}: ${project.error?.message ?? company.error?.message}`);
    return null;
  }
  const plan: ScheduleNotifyPlan = {
    companyId: p.companyId,
    projectId: p.projectId,
    projectName: project.data.name as string,
    savedByMemberId: p.savedByMemberId,
    sender: buildSenderAddress(company.data),
    brand: company.data.brand_color || '#1a56db',
    origin: process.env.NEXT_PUBLIC_APP_URL ?? '',
    inApp: [],
    email: [],
    client: null,
    unreachable: [],
    clientUnreachable: false,
  };

  // ── The assignees who chose to be told, on the tasks this change moved ──
  if (p.changedTaskIds.length > 0) {
    const rows = await admin
      .from('task_assignees')
      .select('member_id, task:tasks(id, title, start_date, due_date)')
      .in('task_id', p.changedTaskIds)
      .eq('notify_changes', true)
      .eq('is_deleted', false);
    if (rows.error) console.error(`[cp notify] assignees ${p.projectId}: ${rows.error.message}`);
    const byMember = new Map<string, ChangedTaskLine[]>();
    for (const r of rows.data ?? []) {
      if (r.member_id === p.savedByMemberId) continue; // not about your own change
      const t = (Array.isArray(r.task) ? r.task[0] : r.task) as { title: string; start_date: string | null; due_date: string | null } | null;
      if (!t) continue;
      const list = byMember.get(r.member_id) ?? [];
      list.push({ title: t.title, start: t.start_date, due: t.due_date });
      byMember.set(r.member_id, list);
    }
    // Resolved together (reads only), kept in member order so the names read the same every time.
    const members = [...byMember.entries()].sort(([a], [b]) => a.localeCompare(b));
    const reaches = await Promise.all(members.map(([memberId]) => resolveMemberReachability(admin, memberId)));
    members.forEach(([memberId, tasks], i) => {
      const reach = reaches[i];
      const lines = assigneeLines(tasks);
      if (reach.state === 'profile') plan.inApp.push({ memberId, recipient: reach.recipient, lines });
      else if (reach.state === 'email-only') plan.email.push({ memberId, email: reach.email, lines });
      else plan.unreachable.push(reach.displayName);
    });
  }

  // ── The client (6-A) ──
  if (settings.data?.notify_client && p.previousFinish && p.newFinish && p.previousFinish !== p.newFinish) {
    const contact = project.data.contact_id
      ? await admin.from('contacts').select('email').eq('id', project.data.contact_id).maybeSingle()
      : null;
    const email = contact?.data?.email ?? null;
    if (!email) plan.clientUnreachable = true;
    else plan.client = { email, previousFinish: p.previousFinish, newFinish: p.newFinish };
  }

  const anything = plan.inApp.length + plan.email.length + plan.unreachable.length > 0 || plan.client !== null || plan.clientUnreachable;
  return anything ? plan : null;
}

/** Step 2 — INSIDE the save: the saver is told who could not be reached (never silently dropped). */
export async function reportUnreachable(admin: SupabaseClient<Database>, plan: ScheduleNotifyPlan): Promise<void> {
  const missing = untoldList(untoldFrom(plan), UNTOLD_WORDS_EN.client);
  if (missing.length === 0) return;
  console.warn(`[cp notify] ${plan.projectId} unreachable: ${missing.join(', ')}`);
  if (!plan.savedByMemberId) return;
  const saver = await resolveMemberReachability(admin, plan.savedByMemberId);
  if (saver.state !== 'profile') return;
  const r = unreachableReport(missing);
  await notify({
    admin,
    companyId: plan.companyId,
    type: 'schedule_changed',
    recipients: [saver.recipient],
    render: () => r,
    linkKey: 'project',
    linkParams: { projectId: plan.projectId },
    projectId: plan.projectId,
    source: { table: 'projects', id: plan.projectId },
    tag: `schedule-unreachable-${plan.projectId}`,
  });
}

/** Stop starting sends this close to the function's time limit. */
export const DEADLINE_MARGIN_MS = 5_000;

/**
 * [S124 Part 0, Josh RULED Q-D3 B] The gap between the STARTS of two emails.
 * Resend's default limit is 2 requests per second; unpaced, a job with many
 * email-only assignees takes a 429 and logs 'failed' — evidence written, message
 * never delivered. ⚠️ 600, NOT 500: starts at 0, 500 and 1000 ms are THREE inside
 * one closed second; 600 keeps any one-second window at two. The sends already
 * run after the response (S123 D-3), so the wait costs the user nothing.
 * ⚠️ Residual: Resend counts per ACCOUNT, so another send path in the same
 * second (the warming cron, an invoice) can still collide. This paces only this
 * path.
 */
export const SEND_INTERVAL_MS = 600;

/** The pacer's clock. Injectable so a unit test can prove the gaps without waiting. */
export interface SendPacer {
  now: () => number;
  sleep: (ms: number) => Promise<void>;
}

const realPacer: SendPacer = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((res) => setTimeout(res, ms)),
};

/**
 * Step 3 — AFTER the response. The in-app rows first (fast, DB only), then the
 * emails one at a time. ⚠️ THE TIME LIMIT: before each email, if the invocation's
 * deadline is within DEADLINE_MARGIN_MS, the email is NOT started and a 'failed'
 * email_logs row says why; a started send that has not answered by 2 s before
 * the deadline is logged 'failed' too (it may still have gone). So no recipient
 * is ever left without a row. `deadline` is injectable for tests; on Vercel it
 * is the invocation's real deadline, off Vercel there is none.
 */
export async function deliverScheduleNotify(
  admin: SupabaseClient<Database>,
  plan: ScheduleNotifyPlan,
  opts: { deadline?: () => Date | undefined; pacer?: SendPacer } = {}
): Promise<ScheduleNotifyOutcome> {
  const deadlineOf = opts.deadline ?? getDeadline;
  const pacer = opts.pacer ?? realPacer;
  /** When the last email STARTED. Only a started send counts; a 'not_sent' does not. */
  let lastStart: number | null = null;
  const out: ScheduleNotifyOutcome = { inApp: 0, emailed: 0, notSent: 0, clientEmailed: false };

  for (const a of plan.inApp) {
    await notify({
      admin,
      companyId: plan.companyId,
      type: 'schedule_changed',
      recipients: [a.recipient],
      render: () => ({ title: assigneeTitle(plan.projectName), body: a.lines.join('\n') }),
      linkKey: 'project',
      linkParams: { projectId: plan.projectId },
      projectId: plan.projectId,
      source: { table: 'projects', id: plan.projectId },
      tag: `schedule-changed-${plan.projectId}-${a.memberId}`,
    });
    out.inApp += 1;
  }

  const send = async (
    to: string,
    subject: string,
    message: string,
    cta: { url: string; label: string },
    log: { email_type: 'schedule_change' | 'schedule_change_client'; metadata: Record<string, unknown> }
  ): Promise<'sent' | 'failed' | 'not_sent'> => {
    // Pace FIRST, then read the deadline: a wait that carries a send too close to
    // the time limit must end as a logged 'not_sent', never as a started send.
    if (lastStart !== null) {
      const wait = lastStart + SEND_INTERVAL_MS - pacer.now();
      if (wait > 0) await pacer.sleep(wait);
    }
    const deadline = deadlineOf();
    const left = deadline ? deadline.getTime() - Date.now() : Infinity;
    let messageId: string | null = null;
    let sendError: string | null = null;
    let outcome: 'sent' | 'failed' | 'not_sent';
    if (left < DEADLINE_MARGIN_MS) {
      sendError = `not sent: the function time limit was ${Math.max(0, Math.round(left / 1000))}s away`;
      outcome = 'not_sent';
    } else {
      lastStart = pacer.now();
      try {
        const attempt = sendEmail({
          from: plan.sender,
          to,
          subject,
          replyToCompanyId: plan.companyId,
          react: NotificationEmail({ brandColor: plan.brand, heading: subject, message, estimateUrl: cta.url, ctaLabel: cta.label }),
        });
        let timer: ReturnType<typeof setTimeout> | undefined;
        const r = Number.isFinite(left)
          ? await Promise.race([
              attempt,
              new Promise<'timeout'>((res) => {
                timer = setTimeout(() => res('timeout'), Math.max(0, left - 2_000));
              }),
            ]).finally(() => clearTimeout(timer))
          : await attempt;
        if (r === 'timeout') {
          sendError = 'no answer from the mail service before the function time limit; it may still have been sent';
        } else {
          messageId = r.messageId;
          sendError = r.error;
        }
      } catch (err) {
        sendError = err instanceof Error ? err.message : 'Email send failed';
      }
      outcome = sendError ? 'failed' : 'sent';
    }
    await logEmail(admin, {
      company_id: plan.companyId,
      estimate_id: null,
      signing_session_id: null,
      resend_message_id: messageId,
      email_type: log.email_type,
      recipient_email: to,
      sender_email: plan.sender,
      subject,
      status: sendError ? 'failed' : 'sent',
      metadata: { project_id: plan.projectId, ...log.metadata, ...(sendError ? { error: sendError } : {}) },
    });
    return outcome;
  };

  for (const e of plan.email) {
    const subject = assigneeTitle(plan.projectName);
    // A person with no login has no dashboard; /m is the surface a sub can open.
    const r = await send(e.email, subject, e.lines.join('\n'), { url: `${plan.origin}/m/p/${plan.projectId}`, label: 'Open the job' }, {
      email_type: 'schedule_change',
      metadata: { member_id: e.memberId },
    });
    if (r === 'sent') out.emailed += 1;
    if (r === 'not_sent') out.notSent += 1;
  }

  if (plan.client) {
    const { subject, message } = clientFinishEmail(plan.projectName, plan.client.previousFinish, plan.client.newFinish);
    const r = await send(plan.client.email, subject, message, { url: `${plan.origin}/portal`, label: 'View your project' }, {
      email_type: 'schedule_change_client',
      metadata: {},
    });
    out.clientEmailed = r === 'sent';
    if (r === 'not_sent') out.notSent += 1;
  }

  if (out.notSent > 0) console.error(`[cp notify] ${plan.projectId}: ${out.notSent} email(s) NOT SENT, the function time limit was near`);
  return out;
}
