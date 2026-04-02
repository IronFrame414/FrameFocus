import { createClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import InviteForm from './invite-form';

export default async function InvitePage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/sign-in');
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, company_id')
    .eq('user_id', user.id)
    .single();

  if (!profile || profile.role !== 'owner') {
    redirect('/dashboard');
  }

  return (
    <div className="p-6 max-w-lg mx-auto">
      <InviteForm companyId={profile.company_id} invitedBy={user.id} />
    </div>
  );
}
