import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import type { CompanyRole } from '@framefocus/shared';
import { notify, type NotifyRecipient } from '@/lib/notify/notify';
import { getManagerNotifyRecipients } from '@/lib/notify/recipients';

// S108 Spec A, ASK-A4 → A, AMENDED [Josh, 2026-09-23, ruling 1] — a site
// visit tells the OFFICE when it is FINISHED ("ready to price"), not when it
// is created. Superseded: the notification fired at creation, before anything
// had been captured, and told the office nothing. The TYPE is unchanged
// (`site_visit_recorded` — no new type, no CHECK widening); only the moment
// and the wording moved. A visit that is never finished notifies nobody —
// accepted by the ruling. Called by /api/site-visits/[id]/finish, once, on the
// FIRST finish only.
//
// Recipients: Owner, Admin and every Project Manager in the company. In-app +
// push, NOT emailed (no email_types row; the selection_approved /
// po_item_missing precedent).
//
// Every PM, not an assigned one: a visit has no project, so there is no
// assignment to scope by — and any PM may be the one who prices it.
// The person who tapped Finish is excluded: telling someone about their own
// action is noise.
// The body carries no money (a visit has none) — only who, what and where.

async function companyPmRecipients(
  admin: SupabaseClient<Database>,
  companyId: string
): Promise<NotifyRecipient[]> {
  const { data } = await admin
    .from('profiles')
    .select('id, email, first_name, role')
    .eq('company_id', companyId)
    .eq('is_deleted', false)
    .eq('role', 'project_manager');
  return (data ?? []).map((p) => ({
    profileId: p.id,
    role: p.role as CompanyRole,
    email: p.email,
    firstName: p.first_name,
  }));
}

export async function notifySiteVisitReadyToPrice(
  admin: SupabaseClient<Database>,
  estimateId: string,
  finisherUserId: string
): Promise<void> {
  const { data: visit } = await admin
    .from('site_visits')
    .select('company_id, title, contact:contacts(first_name, last_name), address:contact_addresses(address_line1, city)')
    .eq('estimate_id', estimateId)
    .single();
  if (!visit) return;

  const { data: recorder } = await admin
    .from('profiles')
    .select('id, first_name, last_name')
    .eq('user_id', finisherUserId)
    .eq('is_deleted', false)
    .maybeSingle();

  const [managers, pms] = await Promise.all([
    getManagerNotifyRecipients(admin, visit.company_id),
    companyPmRecipients(admin, visit.company_id),
  ]);
  const recipients = [...managers, ...pms].filter((r) => r.profileId !== recorder?.id);

  const contact = Array.isArray(visit.contact) ? visit.contact[0] : visit.contact;
  const address = Array.isArray(visit.address) ? visit.address[0] : visit.address;
  const who = [recorder?.first_name, recorder?.last_name].filter(Boolean).join(' ') || 'A team member';
  const where = address ? `${address.address_line1}, ${address.city}` : null;
  const client = contact ? `${contact.first_name} ${contact.last_name}`.trim() : null;

  await notify({
    admin,
    companyId: visit.company_id,
    type: 'site_visit_recorded',
    recipients,
    linkKey: 'site_visit',
    linkParams: { id: estimateId },
    source: { table: 'site_visits', id: estimateId },
    render: () => ({
      title: `Site visit ready to price: ${visit.title}`,
      body: [`${who} finished a site visit`, client ? `for ${client}` : null, where ? `at ${where}` : null]
        .filter(Boolean)
        .join(' ') + '.',
    }),
  });
}
