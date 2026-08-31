import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';
import { OnboardingClient } from './onboarding-client';

// Card-at-signup onboarding [spec §S3]. Owner-only. A confirmed owner whose
// company has no card on file is routed here by the middleware gate and stays
// until the card lands. Non-owners and already-carded owners have no business
// here, so they are sent to the app.
export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');

  const { data: profile } = await supabase
    .from('profiles')
    .select('company_id, role, first_name')
    .eq('user_id', user.id)
    .single();
  if (!profile) redirect('/sign-in');
  if (profile.role !== 'owner') redirect('/dashboard');

  const { data: company } = await supabase
    .from('companies')
    .select('name, payment_method_on_file')
    .eq('id', profile.company_id)
    .single();
  // Card already on file → onboarding is done; the gate would not have sent them.
  if (company?.payment_method_on_file) redirect('/dashboard');

  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('plan_tier')
    .eq('company_id', profile.company_id)
    .single();

  return (
    <OnboardingClient
      firstName={profile.first_name ?? ''}
      companyName={company?.name ?? ''}
      currentPlan={subscription?.plan_tier ?? 'starter'}
    />
  );
}
