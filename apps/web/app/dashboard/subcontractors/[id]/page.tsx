import { createClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSubcontractor } from '@/lib/services/subcontractors';
import { getComplianceStatus } from '@/lib/services/payables';
import { cardStyle, color, font, h2Style, microLabelStyle, secondaryButtonStyle } from '@/lib/theme';
import { ComplianceSection } from './compliance-section';

// 7C §4 screen 6 — the read-only sub/vendor profile.
//
// [S140, ruling A1] This route did not exist. `/dashboard/subcontractors/[id]`
// had exactly one child, `edit/`, so the ONLY way to look at a sub was to open
// the form that changes them — TECH_DEBT #13, and #108(c) which asked for this
// page by name. 7C's compliance section was specced to "land on the edit page
// when unblocked" purely because there was nowhere else to put it; a document
// list inside a form is not a home, it is an absence of one.
//
// Both debts close here.

export default async function SubcontractorProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('user_id', user.id)
    .eq('is_deleted', false)
    .single();

  // Same gate as the edit page. The roster floor (20260911000000) already
  // stops `subcontractor` and `client` reading the subcontractors table at
  // all, so this check is about the five dashboard roles.
  if (!profile || !['owner', 'admin', 'project_manager'].includes(profile.role)) {
    redirect('/dashboard/subcontractors');
  }

  const sub = await getSubcontractor(id);
  if (!sub) redirect('/dashboard/subcontractors');

  // Compliance is Owner/Admin ONLY [S140 ruling A2, migration 20260921000000].
  // The read is skipped rather than attempted for a PM: RLS would return an
  // empty list, and an empty list renders identically to "this sub has no
  // documents" — a false statement. Not asking means the section is absent,
  // which is true.
  const canSeeCompliance = ['owner', 'admin'].includes(profile.role);
  const docs = canSeeCompliance && sub.member_id ? await getComplianceStatus(sub.member_id) : [];

  const contactName = [sub.contact_first_name, sub.contact_last_name].filter(Boolean).join(' ');
  const address = [sub.address_line1, sub.address_line2, [sub.city, sub.state].filter(Boolean).join(', '), sub.zip]
    .filter(Boolean)
    .join('\n');

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: '16px',
          marginBottom: '6px',
        }}
      >
        <div>
          <h1 style={h2Style}>{sub.company_name}</h1>
          <p style={{ color: color.muted, fontSize: '13px', margin: '4px 0 0' }}>
            {sub.sub_type === 'subcontractor' ? 'Subcontractor' : 'Vendor'}
            {sub.trade_type ? ` · ${sub.trade_type}` : ''}
            {sub.status ? ` · ${sub.status}` : ''}
          </p>
        </div>
        <Link href={`/dashboard/subcontractors/${id}/edit`} style={secondaryButtonStyle}>
          Edit
        </Link>
      </div>

      <div style={{ ...cardStyle, padding: '18px 20px', marginTop: '18px', maxWidth: '640px' }}>
        <p style={{ ...microLabelStyle, marginBottom: '12px' }}>Contact</p>
        <Field label="Contact" value={contactName || null} />
        <Field label="Email" value={sub.email} />
        <Field label="Phone" value={sub.phone} />
        <Field label="Mobile" value={sub.mobile} />
        <Field label="Address" value={address || null} />
        <Field label="License #" value={sub.license_number} />
      </div>

      {canSeeCompliance ? (
        sub.member_id ? (
          <ComplianceSection memberId={sub.member_id} initialDocs={docs} />
        ) : (
          <div style={{ ...cardStyle, padding: '18px 20px', marginTop: '18px', maxWidth: '640px' }}>
            <p style={{ ...microLabelStyle, marginBottom: '8px' }}>Compliance</p>
            <p style={{ fontSize: '13px', color: color.muted, margin: 0 }}>
              This sub has no member record, so compliance documents cannot be attached.
              Compliance is keyed on the member (<code style={{ fontFamily: font.mono }}>member_id</code>),
              which is set when a sub is created or awarded work.
            </p>
          </div>
        )
      ) : null}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div style={{ display: 'flex', gap: '12px', padding: '7px 0', fontSize: '13.5px' }}>
      <span style={{ color: color.faint, width: '90px', flexShrink: 0 }}>{label}</span>
      <span style={{ color: value ? color.body : color.faint, whiteSpace: 'pre-line' }}>
        {value || '—'}
      </span>
    </div>
  );
}
