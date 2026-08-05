import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';
import { getMembers } from '@/lib/services/members';
import { MobileShell } from './mobile-shell';

// M6M §1 — the mobile shell layout. Hosts §3.1's app bar, §3.2's tab bar,
// §3.3's sheet and §4.4's app-wide offline strip. Nothing under app/dashboard/**
// is touched (A-28).
//
// ---------------------------------------------------------------------------
// THIS LAYOUT IS THE ONLY AUTH GATE ON /m. middleware.ts matches
// ['/dashboard/:path*', '/sign-in', '/sign-up'] and NOT /m, so an unsigned
// request reaches this file rather than being bounced earlier. Hence the
// explicit redirect below, mirroring app/dashboard/layout.tsx.
//
// Two consequences worth stating rather than discovering:
//   - Adding /m to the middleware matcher would also subject the field app to
//     the billing-enforcement redirect to /dashboard/billing/plans, which is a
//     desktop, Owner-only page. Nothing in M6M rules on what an expired
//     subscription should do to a phone. Left alone; flagged.
//   - §1: "A desktop browser opening /m gets the mobile shell; that is intended
//     and is how it gets tested." There is no viewport or user-agent check here,
//     deliberately — "a viewport or user-agent check is NOT the router."
// ---------------------------------------------------------------------------

export default async function MobileLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/sign-in');
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('first_name, last_name, company_id')
    .eq('user_id', user.id)
    .single();

  if (!profile) {
    redirect('/sign-in');
  }

  const [companyResult, members] = await Promise.all([
    supabase.from('companies').select('name').eq('id', profile.company_id).single(),
    // §3.3's Team tile carries "(count)". Through the service layer, never a
    // direct query from a component.
    getMembers().catch(() => null),
  ]);

  return (
    <MobileShell
      userName={`${profile.first_name} ${profile.last_name}`}
      companyName={companyResult.data?.name ?? 'My Company'}
      teamCount={members?.length ?? null}
    >
      {children}
    </MobileShell>
  );
}
