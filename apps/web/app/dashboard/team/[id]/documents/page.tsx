import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient, getRequestUser } from '@/lib/supabase-server';
import { getTeamMember } from '@/lib/services/team';
import { getEmployeeDocuments } from '@/lib/services/employee-documents';
import { EmployeeDocumentsPanel } from '@/components/employee-documents/employee-documents-panel';

// S118 item 16 — a person's documents (Owner/Admin). Keyed by profile id like
// the rest of Team.
//
// ⚠️ UNLIKE `team/[id]`, A REMOVED PERSON STILL OPENS HERE. "Files survive the
// person" [Josh]: a signed handbook is kept for retention after someone leaves,
// so their documents must stay reachable by the office. The edit page's
// `is_deleted` redirect is the S175 gate for EDITING; nothing here edits the
// person. The database still decides every read and write (20262060000000).
export default async function EmployeeDocumentsPage({ params }: { params: { id: string } }) {
  const supabase = await createClient();
  const user = await getRequestUser();
  if (!user) redirect('/sign-in');

  const { data: caller } = await supabase
    .from('profiles')
    .select('id, role, company_id')
    .eq('user_id', user.id)
    .single();
  if (!caller) redirect('/sign-in');
  if (caller.role !== 'owner' && caller.role !== 'admin') redirect('/dashboard');

  const target = await getTeamMember(supabase, params.id).catch(() => null);
  if (!target) redirect('/dashboard/team');

  // The member row even if deactivated (retention). Crew only: the trigger
  // refuses documents on any other member type.
  const { data: member } = await supabase
    .from('company_members')
    .select('id, member_type')
    .eq('profile_id', target.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  const name = [target.first_name, target.last_name].filter(Boolean).join(' ') || target.email;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-2 text-sm">
        <Link href={`/dashboard/team/${target.id}`} className="text-blue-700 hover:underline">
          ← {name}
        </Link>
      </div>
      <h1 className="text-2xl font-bold">Documents — {name}</h1>
      {target.is_deleted ? (
        <p className="mt-2 text-sm text-gray-600" data-testid="employee-docs-former">
          {name} no longer has access. Their documents are kept.
        </p>
      ) : null}
      {member && member.member_type === 'crew' ? (
        <EmployeeDocumentsPanel
          companyId={caller.company_id as string}
          memberId={member.id as string}
          personName={name}
          documents={await getEmployeeDocuments(member.id as string)}
        />
      ) : (
        <p className="mt-4 text-sm text-gray-600" data-testid="employee-docs-not-crew">
          Documents are kept for employees (crew members) only.
        </p>
      )}
    </div>
  );
}
