import Link from 'next/link';
import { createClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import { getTeamMember, getCompanyAdmins } from '@/lib/services/team';
import { getMemberBurden, getMemberRates } from '@/lib/services/pay-rates';
import { getGLMappingSettings } from '@/lib/services/company';
import EditForm from './edit-form';
import TransferForm from './transfer-form';
import PayRateSection from './pay-rate-section';

export default async function TeamMemberEditPage({ params }: { params: { id: string } }) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');

  const { data: caller } = await supabase
    .from('profiles')
    .select('id, role, company_id')
    .eq('user_id', user.id)
    .single();
  if (!caller) redirect('/sign-in');

  if (caller.role !== 'owner' && caller.role !== 'admin') {
    redirect('/dashboard');
  }

  // ⚠️ THIS `redirect` IS NOW THE #1-s168 GATE AS WELL AS THE NOT-FOUND PATH,
  // AND IT DID NOT HAVE TO CHANGE TO BECOME ONE. [S175 item 6]
  //
  // `getTeamMember()` returns NULL for a role the Team side does not represent
  // (`NON_TEAM_ROLES` — today, `client`), off the SAME constant
  // `getTeamMembers()` filters the list by. TECH_DEBT #1-s168's fifth limb is
  // that this route is *"reachable by URL for a client's profile id whether or
  // not the list shows it"*, and that dropping the row from the list is
  // *"cosmetic on its own"* — an Owner who pasted a client's profile id got the
  // staff editor for them, with a role dropdown.
  //
  // The gate is in the service rather than here because this page is one door of
  // five: `actions.ts` carries four server actions that take a `targetId` off
  // the wire and never render this file.
  const target = await getTeamMember(supabase, params.id).catch(() => null);
  if (!target) redirect('/dashboard/team');
  if (target.is_deleted) redirect('/dashboard/team');

  const isSelf = caller.id === target.id;

  if (caller.role === 'admin' && !isSelf && (target.role === 'owner' || target.role === 'admin')) {
    redirect('/dashboard');
  }

  const admins =
    isSelf && caller.role === 'owner'
      ? await getCompanyAdmins(supabase, caller.company_id, caller.id)
      : [];

  // Pay rates (S85): keyed by the member row, not the profile.
  //
  // ⚠️ THE ACCOMMODATION IS GONE; THE CONDITIONAL IS NOT, AND THE DIFFERENCE
  // MATTERS. [#1-s168 limb 5, S175 item 6]
  //
  // _Superseded, quoted rather than deleted:_ *"Client-role profiles have no
  // member row — no rate section for them."* That sentence is why #1-s168 was
  // ruled STRUCTURAL rather than cosmetic: this page did not merely fail to
  // exclude clients, it was **written to accommodate them**. A client can no
  // longer reach this file at all, so that reason is retired.
  //
  // **The `memberRow ? … : …` branch stays, because a second role reaches this
  // page without one.** `create_member_for_new_profile()` skips
  // `('client','subcontractor')` at INSERT, so a subcontractor-role profile is
  // not guaranteed a `company_members` row either — and subcontractors stay on
  // the Team side by ruling [Josh, S175 Q6.1]. Measured on rebuild-test: the
  // seeded sub DOES have one, created by `create_member_for_new_subcontractor()`
  // from the `subcontractors` table rather than by the profile trigger. So the
  // branch is not dead code on today's data by accident — it is load-bearing for
  // any sub profile that arrives by the other path, and deleting it would crash
  // this page for them.
  const { data: memberRow } = await supabase
    .from('company_members')
    .select('id')
    .eq('profile_id', target.id)
    .eq('is_deleted', false)
    .maybeSingle();
  // Burden rides the same Owner/Admin surface as pay rates (7A §5.9); the
  // company fixed $/hr feeds the '+' arm of the preview line.
  const [rates, burden, glSettings] = memberRow
    ? await Promise.all([
        getMemberRates(memberRow.id),
        getMemberBurden(memberRow.id),
        getGLMappingSettings(),
      ])
    : [[], null, null];

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Edit Team Member</h1>
      {isSelf ? (
        // Team → Edit is for editing OTHERS; your own name lives on the Account
        // page — the ONE self-edit path (S177). Keeping the block (rather than
        // adding an editor here) is deliberate: two save paths for your own name
        // is the exact divergence the parity ruling (S122) exists to prevent.
        // The Owner still gets the ownership-transfer control they had; everyone,
        // Owner included, gets a pointer to where the name is actually edited.
        <div className="space-y-4">
          {caller.role === 'owner' ? <TransferForm admins={admins} /> : null}
          <p style={{ color: '#b45309', background: '#fef3c7', padding: 12, borderRadius: 4 }}>
            To change your own name, go to your{' '}
            <Link href="/dashboard/account" style={{ textDecoration: 'underline', fontWeight: 600 }}>
              Account page
            </Link>
            . This page is for editing other team members.
          </p>
        </div>
      ) : (
        <EditForm
          target={{
            id: target.id,
            first_name: target.first_name,
            last_name: target.last_name,
            email: target.email,
            phone: target.phone,
            role: target.role,
            notes: target.notes,
            created_at: target.created_at,
          }}
          callerRole={caller.role as 'owner' | 'admin'}
        />
      )}
      {memberRow && (
        <PayRateSection
          memberId={memberRow.id}
          rates={rates}
          burden={burden}
          companyFixedBurden={glSettings?.fixed_burden_per_hour ?? null}
        />
      )}
    </div>
  );
}
