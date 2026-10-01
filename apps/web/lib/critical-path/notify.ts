import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import { notify } from '@/lib/notify/notify';
import { resolveMemberReachability } from '@/lib/notify/assignment-notify';
import { buildSenderAddress, logEmail, sendEmail } from '@/lib/services/email-service';
import { NotificationEmail } from '@/lib/email/templates/notification-email';
import {
  assigneeLines,
  assigneeTitle,
  clientFinishEmail,
  unreachableReport,
  untoldFrom,
  untoldList,
  type ChangedTaskLine,
} from './notify-text';

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
// Never throws into the save: a failed send is logged (email_logs records the
// failure) and the change stays saved.

export interface ScheduleNotifyOutcome {
  inApp: number;
  emailed: number;
  /** Assignees who chose to be told and cannot be reached: no login, no email. */
  unreachable: string[];
  clientEmailed: boolean;
  /** The client box is ticked but the client contact has no email. */
  clientUnreachable: boolean;
}

export const NOTHING_SENT: ScheduleNotifyOutcome = {
  inApp: 0,
  emailed: 0,
  unreachable: [],
  clientEmailed: false,
  clientUnreachable: false,
};

export async function notifyScheduleChange(
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
): Promise<ScheduleNotifyOutcome> {
  if (p.causeKind === 'time') return NOTHING_SENT;
  const out: ScheduleNotifyOutcome = { ...NOTHING_SENT, unreachable: [] };
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? '';

  const [project, company, settings] = await Promise.all([
    admin.from('projects').select('name, contact_id').eq('id', p.projectId).single(),
    admin.from('companies').select('name, slug, brand_color').eq('id', p.companyId).single(),
    admin.from('project_schedule_settings').select('notify_client').eq('project_id', p.projectId).eq('is_deleted', false).maybeSingle(),
  ]);
  if (project.error || company.error) {
    console.error(`[cp notify] ${p.projectId}: ${project.error?.message ?? company.error?.message}`);
    return out;
  }
  const projectName = project.data.name as string;
  const sender = buildSenderAddress(company.data);
  const brand = company.data.brand_color || '#1a56db';

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

    for (const [memberId, tasks] of [...byMember.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      const reach = await resolveMemberReachability(admin, memberId);
      const lines = assigneeLines(tasks);
      if (reach.state === 'profile') {
        await notify({
          admin,
          companyId: p.companyId,
          type: 'schedule_changed',
          recipients: [reach.recipient],
          render: () => ({ title: assigneeTitle(projectName), body: lines.join('\n') }),
          linkKey: 'project',
          linkParams: { projectId: p.projectId },
          projectId: p.projectId,
          source: { table: 'projects', id: p.projectId },
          tag: `schedule-changed-${p.projectId}-${memberId}`,
        });
        out.inApp += 1;
      } else if (reach.state === 'email-only') {
        const subject = assigneeTitle(projectName);
        let messageId: string | null = null;
        let sendError: string | null = null;
        try {
          const r = await sendEmail({
            from: sender,
            to: reach.email,
            subject,
            replyToCompanyId: p.companyId,
            react: NotificationEmail({
              brandColor: brand,
              heading: subject,
              message: lines.join('\n'),
              // A person with no login has no dashboard; /m is the surface a sub can open.
              estimateUrl: `${origin}/m/p/${p.projectId}`,
              ctaLabel: 'Open the job',
            }),
          });
          messageId = r.messageId;
          sendError = r.error;
        } catch (err) {
          sendError = err instanceof Error ? err.message : 'Email send failed';
        }
        await logEmail(admin, {
          company_id: p.companyId,
          estimate_id: null,
          signing_session_id: null,
          resend_message_id: messageId,
          email_type: 'schedule_change',
          recipient_email: reach.email,
          sender_email: sender,
          subject,
          status: sendError ? 'failed' : 'sent',
          metadata: { project_id: p.projectId, member_id: memberId, ...(sendError ? { error: sendError } : {}) },
        });
        if (!sendError) out.emailed += 1;
      } else {
        out.unreachable.push(reach.displayName);
      }
    }
  }

  // ── The client (6-A) ──
  if (settings.data?.notify_client && p.previousFinish && p.newFinish && p.previousFinish !== p.newFinish) {
    const contact = project.data.contact_id
      ? await admin.from('contacts').select('email').eq('id', project.data.contact_id).maybeSingle()
      : null;
    const email = contact?.data?.email ?? null;
    if (!email) {
      out.clientUnreachable = true;
    } else {
      const { subject, message } = clientFinishEmail(projectName, p.previousFinish, p.newFinish);
      let messageId: string | null = null;
      let sendError: string | null = null;
      try {
        const r = await sendEmail({
          from: sender,
          to: email,
          subject,
          replyToCompanyId: p.companyId,
          react: NotificationEmail({
            brandColor: brand,
            heading: subject,
            message,
            estimateUrl: `${origin}/portal`,
            ctaLabel: 'View your project',
          }),
        });
        messageId = r.messageId;
        sendError = r.error;
      } catch (err) {
        sendError = err instanceof Error ? err.message : 'Email send failed';
      }
      await logEmail(admin, {
        company_id: p.companyId,
        estimate_id: null,
        signing_session_id: null,
        resend_message_id: messageId,
        email_type: 'schedule_change_client',
        recipient_email: email,
        sender_email: sender,
        subject,
        status: sendError ? 'failed' : 'sent',
        metadata: { project_id: p.projectId, ...(sendError ? { error: sendError } : {}) },
      });
      out.clientEmailed = !sendError;
    }
  }

  // ── The saver is told who could not be reached (never silently dropped) ──
  const missing = untoldList(untoldFrom(out));
  if (missing.length > 0 && p.savedByMemberId) {
    const saver = await resolveMemberReachability(admin, p.savedByMemberId);
    if (saver.state === 'profile') {
      const r = unreachableReport(missing);
      await notify({
        admin,
        companyId: p.companyId,
        type: 'schedule_changed',
        recipients: [saver.recipient],
        render: () => r,
        linkKey: 'project',
        linkParams: { projectId: p.projectId },
        projectId: p.projectId,
        source: { table: 'projects', id: p.projectId },
        tag: `schedule-unreachable-${p.projectId}`,
      });
    }
  }
  if (missing.length > 0) console.warn(`[cp notify] ${p.projectId} unreachable: ${missing.join(', ')}`);
  return out;
}
