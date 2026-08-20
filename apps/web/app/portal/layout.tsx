import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase-server';
import { dashboardDeniedRedirect } from '@/lib/dashboard-access';
import { RegisterPortalSw } from './register-portal-sw';

/**
 * Module 9 stage 4 — the client portal, and the gate on it.
 *
 * ===========================================================================
 * THIS REPLACES `/client-placeholder`, WHICH IS DELETED IN THE SAME COMMIT
 * ===========================================================================
 * That page's own header said so: *"⚠️ A HOLDING PAGE. MODULE 9 DELETES THIS
 * FILE."* It also refused to claim `/portal` because the Pre-Module 9 gate —
 * hosted portal vs. email plus magic links — was open. **It is closed: R1,
 * Josh, S164 — WE host the portal, with accounts.** So `/portal` is
 * now the right name and `CLIENT_PLACEHOLDER_PATH` points here.
 *
 * ===========================================================================
 * ⚠️ THE GUARD IS SYMMETRICAL, AND THE SECOND HALF IS THE EASY ONE TO FORGET
 * ===========================================================================
 * `dashboard-access.ts` keeps a client OUT of `/dashboard`. That is one
 * direction. This layout keeps everyone else OUT of `/portal` — because the
 * portal is a client-facing white-label surface (R20 swaps the company's
 * identity in for the product's), and a staff member wandering into it would
 * see a page written for a counterparty and read it as their own view of the
 * job. `dashboardDeniedRedirect()` is reused rather than a role list retyped:
 * a role it does NOT deny is by definition a dashboard role, and belongs there.
 *
 * ⚠️ AND THE GUARD PROTECTS NO DATA. Same warning as `dashboard-access.ts`, and
 * it is not boilerplate: a redirect changes what is REACHED, never what is
 * READABLE. Every row this tree renders comes back through the client read arms
 * (`20261019000000`, `20261020000000`), which is what a raw PostgREST call hits
 * too. If this file were deleted the data would still be correctly floored.
 *
 * ===========================================================================
 * A DEACTIVATED CLIENT IS LET IN, AND SEES NOTHING. DELIBERATE.
 * ===========================================================================
 * R17's `deactivated` state makes `my_client_access_level()` return `'none'`,
 * which closes every arm. The tempting alternative — bounce her to `/sign-in`
 * — produces a loop (she has a valid session) and tells her she is not signed
 * in, which is false and unhelpful. She reaches the portal and is told plainly
 * that her access has ended. The rows are gone either way; only the sentence
 * differs, and one of the two sentences is true.
 */

export const metadata: Metadata = {
  // ⚠️ NOT `brand.name`. R20: the product does not name itself to a client.
  // A tab title is the one piece of chrome that survives a screenshot.
  title: 'Project portal',

  // ⚠️ Q5 [S164] — THE PORTAL'S OWN MANIFEST, AND THE CREW'S IS UNTOUCHED.
  //
  // `app/manifest.ts` keeps `start_url: '/m'`; changing it would redirect every
  // field user's home-screen icon, which the brief for this work rules out.
  // Metadata merges shallowly and a nested segment REPLACES the parent's value
  // for a field, so this emits exactly one `<link rel="manifest">` under
  // `/portal` and nothing under `/m` or `/dashboard` is affected.
  //
  // It must be a URL rather than a `manifest.ts` beside this file: Next collects
  // the manifest FILE convention only at the app root, and a nested one is
  // silently never detected — the portal would go on serving the crew manifest
  // and an installed portal would open the field shell.
  manifest: '/portal.webmanifest',
};

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // `?next=/portal` for the same reason `/m` carries one: without it a lapsed
  // session lands the client in the desktop dashboard after signing in, which
  // then bounces them back here — two extra redirects and a flash of an app
  // they are not allowed in.
  if (!user) redirect('/sign-in?next=%2Fportal');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('user_id', user.id)
    .eq('is_deleted', false)
    .maybeSingle();

  if (!profile) redirect('/sign-in?next=%2Fportal');

  // Not a client → not here. `dashboardDeniedRedirect()` returns null for every
  // role that belongs on the dashboard, including an unknown one, which is the
  // correct fail-open for the same reason it is there: this guard's job is the
  // one role the ruling names.
  if (dashboardDeniedRedirect((profile as { role: string }).role) === null) {
    redirect('/dashboard');
  }
  // A subcontractor is dashboard-denied but is not a client either.
  if ((profile as { role: string }).role !== 'client') {
    redirect('/m/projects');
  }

  return (
    <>
      <RegisterPortalSw />
      {children}
    </>
  );
}
