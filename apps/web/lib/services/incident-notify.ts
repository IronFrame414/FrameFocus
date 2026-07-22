import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import { ROLE_HIERARCHY, type CompanyRole } from '@framefocus/shared';
import {
  buildSenderAddress,
  logEmail,
  sendEmail,
} from '@/lib/services/email-service';
import { NotificationEmail } from '@/lib/email/templates/notification-email';
import type { IncidentDetail } from '@/lib/services/safety';

// 6C §4 as amended [S87 correction]: HIERARCHY notification, not a flat role
// list. Every incident emails every member whose role is STRICTLY ABOVE the
// submitter's, within the supervisory set (Owner/Admin/PM/Foreman) — a
// crew-filed incident reaches Foreman+PM+Admin+Owner; a PM-filed one reaches
// Admin+Owner. FLOOR: an Owner-filed incident notifies Admin(s), so no
// incident is ever silent. Assignment-independent (§4 — notification, not
// the log listing, is what reaches leadership about an off-project injury).
// Send failure NEVER rolls back; every attempt is logged (email_type
// 'safety_incident', metadata.incident_id) to power the Owner/Admin retry
// banner.

const SUPERVISORY_ROLES: CompanyRole[] = ['owner', 'admin', 'project_manager', 'foreman'];

export interface IncidentRecipient {
  email: string;
  first_name: string;
}

/** Strictly-above-the-submitter recipients, with the Owner→Admin floor. */
export async function computeIncidentRecipients(
  admin: SupabaseClient<Database>,
  companyId: string,
  submitterRole: CompanyRole,
  submitterEmail: string | null
): Promise<IncidentRecipient[]> {
  const submitterRank = ROLE_HIERARCHY[submitterRole] ?? 0;
  const above = SUPERVISORY_ROLES.filter((r) => ROLE_HIERARCHY[r] > submitterRank);
  // Floor: an Owner outranks everyone — notify Admin so nothing is silent.
  const targetRoles = above.length > 0 ? above : (['admin'] as CompanyRole[]);

  const { data } = await admin
    .from('profiles')
    .select('email, first_name, role')
    .eq('company_id', companyId)
    .eq('is_deleted', false)
    .in('role', targetRoles);

  return (data ?? [])
    .filter((p) => p.email && p.email !== submitterEmail)
    .map((p) => ({ email: p.email, first_name: p.first_name }));
}

/**
 * Send the incident notification to the given recipients. Returns per-
 * recipient failures (never throws for send errors).
 */
export async function sendIncidentNotifications(params: {
  admin: SupabaseClient<Database>;
  recipients: IncidentRecipient[];
  incident: IncidentDetail;
  company: { name: string; slug: string; brand_color: string | null };
  origin: string;
}): Promise<string[]> {
  const { admin, recipients, incident, company, origin } = params;
  const emailErrors: string[] = [];

  const typeLabel =
    incident.incident_type === 'injury'
      ? 'INJURY'
      : incident.incident_type === 'property_damage'
        ? 'Property damage'
        : 'Near miss';
  const projectName = incident.project?.name ?? 'No project (shop/yard)';
  const subject = `[${typeLabel}] Safety incident — ${projectName} · ${incident.incident_date}`;

  const injuredLines = incident.injuries.map(
    (p) =>
      `• ${p.member?.display_name ?? p.injured_name ?? 'Unknown'}${
        p.treatment_sought
          ? ` — treatment sought${p.treatment_notes ? `: ${p.treatment_notes}` : ''}`
          : ''
      }`
  );
  const message = [
    `${typeLabel} reported by ${incident.reporter?.display_name ?? 'a team member'} at ${projectName}, ${incident.incident_date}.`,
    '',
    incident.description,
    ...(injuredLines.length > 0 ? ['', 'Injured:', ...injuredLines] : []),
  ].join('\n');

  const sender = buildSenderAddress(company);
  const url = `${origin}/dashboard/field-ops/safety/${incident.id}`;

  for (const recipient of recipients) {
    let messageId: string | null = null;
    let sendError: string | null = null;
    try {
      const sent = await sendEmail({
        from: sender,
        to: recipient.email,
        subject,
        react: NotificationEmail({
          brandColor: company.brand_color || '#1a56db',
          heading: subject,
          message,
          estimateUrl: url,
          ctaLabel: 'Open Incident',
        }),
      });
      messageId = sent.messageId;
      sendError = sent.error;
    } catch (err) {
      sendError = err instanceof Error ? err.message : 'Email send failed';
    }
    if (sendError) emailErrors.push(`${recipient.email}: ${sendError}`);
    await logEmail(admin, {
      company_id: incident.company_id,
      estimate_id: null,
      signing_session_id: null,
      resend_message_id: messageId,
      email_type: 'safety_incident',
      recipient_email: recipient.email,
      sender_email: sender,
      subject,
      status: sendError ? 'failed' : 'sent',
      metadata: {
        incident_id: incident.id,
        project_id: incident.project_id,
        ...(sendError ? { error: sendError } : {}),
      },
    });
  }
  return emailErrors;
}
