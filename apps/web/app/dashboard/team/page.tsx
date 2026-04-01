import { createClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import TeamPageClient from './team-page-client';

export default async function TeamPage() {
  const supabase = await createClient();

  // Get current user
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/sign-in');
  }

  // Get user's profile to check role
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile) {
    redirect('/sign-in');
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <TeamPageClient userRole={profile.role} />
    </div>
  );
}
