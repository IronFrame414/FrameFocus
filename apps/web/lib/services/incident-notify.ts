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
import { notify } from '@/lib/notify/notify';

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
//
// ===========================================================================
// [S123 slice 3] THIS FILE IS THE FIRST notify() CONSUMER
// ===========================================================================
// It now drives TWO channels off ONE recipient computation:
//
//   email     — unchanged, still logged to email_logs, still powers the retry
//               banner via getFailedIncidentEmails().
//   in-app +  — new. notifyIncident() calls notify(), which writes the rows and
//   push        pushes IMMEDIATELY, at any hour, because ND-5 makes every
//               incident type an override (§3c).
//
// The recipient rule was NOT re-derived for the new channel; both read the same
// computeIncidentRecipients(). The spec picked this consumer first precisely
// because its recipient rule and its override behaviour were both already
// settled, so slice 3 wires a decided rule rather than making one.
//
// ---------------------------------------------------------------------------
// WHY THE RETRY ROUTE DOES NOT CALL notifyIncident(), AND MUST NOT
// ---------------------------------------------------------------------------
// `/api/safety-incidents/[id]/notify` retries EMAILS that failed. The in-app
// rows were written when the incident was created and are still sitting unread
// in the recipients' lists — an email failure says nothing about them. Calling
// notify() there would write a SECOND row per recipient, double the badge, and
// re-push an incident that everyone has already been told about. Retrying a
// failed channel must not replay a channel that succeeded.

const SUPERVISORY_ROLES: CompanyRole[] = ['owner', 'admin', 'project_manager', 'foreman'];

/**
 * `incident_type` → display label. Extracted from the email subject builder so
 * the email and the notification cannot drift into describing the same incident
 * with two different words.
 *
 * CHECK-constrained to exactly these three (`safety_incidents_incident_type_check`),
 * so the fallback is unreachable — it exists because the alternative shape, a
 * ternary chain ending in `: 'Near miss'`, LABELS AN UNKNOWN TYPE AS A NEAR MISS.
 * That is the one wrong answer available: a mislabelled near miss is the reading
 * that under-alarms.
 */
export const INCIDENT_TYPE_LABEL: Record<string, string> = {
  injury: 'INJURY',
  property_damage: 'Property damage',
  near_miss: 'Near miss',
};

export function incidentTypeLabel(incidentType: string): string {
  return INCIDENT_TYPE_LABEL[incidentType] ?? 'Incident';
}

export interface IncidentRecipient {
  /** profiles.id — ND-2's recipient identity. Never a company_members.id. */
  profileId: string;
  role: CompanyRole;
  email: string;
  first_name: string;
}

/**
 * Strictly-above-the-submitter recipients, with the Owner→Admin floor.
 *
 * `submitterProfileId` supersedes email as the exclusion key. Email was the only
 * identifier this function had while it served email alone, and it silently
 * fails open: the create route passed `profile.email`, but the RETRY route reads
 * the reporter through a `company_members` join whose profile may come back
 * null, in which case it passed `null` and the reporter was mailed their own
 * incident. An id compare cannot half-work in that way. The email compare is
 * kept as a fallback for a caller that genuinely has no id.
 */
export async function computeIncidentRecipients(
  admin: SupabaseClient<Database>,
  companyId: string,
  submitterRole: CompanyRole,
  submitterEmail: string | null,
  submitterProfileId?: string | null
): Promise<IncidentRecipient[]> {
  const submitterRank = ROLE_HIERARCHY[submitterRole] ?? 0;
  const above = SUPERVISORY_ROLES.filter((r) => ROLE_HIERARCHY[r] > submitterRank);
  // Floor: an Owner outranks everyone — notify Admin so nothing is silent.
  const targetRoles = above.length > 0 ? above : (['admin'] as CompanyRole[]);

  const { data } = await admin
    .from('profiles')
    .select('id, email, first_name, role')
    .eq('company_id', companyId)
    .eq('is_deleted', false)
    .in('role', targetRoles);

  return (data ?? [])
    .filter((p) =>
      submitterProfileId ? p.id !== submitterProfileId : p.email !== submitterEmail
    )
    .map((p) => ({
      profileId: p.id,
      role: p.role as CompanyRole,
      email: p.email,
      first_name: p.first_name,
    }));
}

/**
 * In-app rows + immediate push for one incident (§3c, ND-5).
 *
 * Best-effort by construction: notify() never throws for a delivery failure, and
 * this returns an outcome rather than signalling one. The incident is already
 * recorded — failing to announce it must not roll it back.
 */
export async function notifyIncident(params: {
  admin: SupabaseClient<Database>;
  recipients: IncidentRecipient[];
  incident: IncidentDetail;
}) {
  const { admin, recipients, incident } = params;

  const typeLabel = incidentTypeLabel(incident.incident_type);
  const reporter = incident.reporter?.display_name ?? 'a team member';
  // The email says 'No project (shop/yard)'; a notification title cannot afford
  // "Incident (No project (shop/yard)): …", so the short form is used HERE only.
  // Same fact, two lengths — the title is a headline, the email body is a record.
  const where = incident.project?.name ?? 'shop/yard';

  return notify({
    admin,
    companyId: incident.company_id,
    type: 'incident',
    recipients: recipients.map((r) => ({
      profileId: r.profileId,
      role: r.role,
      email: r.email,
      firstName: r.first_name,
    })),
    // R7 demands render() be a function; an incident carries no money, so every
    // recipient legitimately gets the same bytes. The function is not ceremony
    // here — it is what makes the per-recipient case the DEFAULT shape, so §3e's
    // Owner-vs-PM split is a change of body, not a change of call.
    render: () => ({
      title: `Incident (${where}): ${reporter} — ${typeLabel}`,
      body: incident.description,
    }),
    linkKey: 'incident',
    linkParams: {
      id: incident.id,
      // Undefined for a shop/yard incident: the mobile resolver has no
      // destination without it and correctly returns null (links.ts).
      projectId: incident.project_id ?? undefined,
    },
    projectId: incident.project_id,
    source: { table: 'safety_incidents', id: incident.id },
    // Collapses an OS-level repeat of the SAME incident. Deliberately keyed on
    // the incident, not the type — two separate injuries are two notifications.
    tag: `incident-${incident.id}`,
  });
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

  const typeLabel = incidentTypeLabel(incident.incident_type);
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
    // The recipient set is now shared with the in-app channel, which does not
    // need an email address. `profiles.email` is NOT NULL so this is unreachable
    // today; it is here so that if it ever becomes nullable, the emailless
    // recipient loses EMAIL — not their notification row.
    if (!recipient.email) continue;

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
