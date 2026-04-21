import { createClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import { getTeamMember } from '@/lib/services/team';
import EditForm from './edit-form';

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

  const target = await getTeamMember(supabase, params.id).catch(() => null);
  if (!target) redirect('/dashboard/team');
  if (target.is_deleted) redirect('/dashboard/team');

  const isSelf = caller.id === target.id;

  if (caller.role === 'admin' && !isSelf && (target.role === 'owner' || target.role === 'admin')) {
    redirect('/dashboard');
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Edit Team Member</h1>
      {isSelf ? (
        <p style={{ color: '#b45309', background: '#fef3c7', padding: 12, borderRadius: 4 }}>
          You can't edit your own profile from this page. Contact your account owner to make
          changes.
        </p>
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
    </div>
  );
}
