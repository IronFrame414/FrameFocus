import { headers, cookies } from 'next/headers';
import { landingPathFor, surfacePreferenceFrom, SURFACE_COOKIE } from '@/lib/device';
import { SignInForm } from './sign-in-form';

// D-12's SIGN-IN LANDING — a phone signs in to `/m`. [S121, Josh]
//
// THIS FILE EXISTS TO MAKE THE DECISION SERVER-SIDE. The form is a client
// component (it holds the credentials and calls supabase-js), and a client
// cannot know the user-agent before it renders. Splitting the page in two puts
// the choice in the request, so a phone never renders `/dashboard` on its way
// to `/m` — the flicker a viewport check would cost on every single sign-in.
//
// The decision itself, its two accepted wrong answers, and what survives of
// §1's "a viewport or user-agent check is NOT the router" are all in
// `lib/device.ts`. This page only reads the header and passes the answer down.
//
// ⚠️ `headers()` MAKES THIS ROUTE DYNAMIC, which it must be: a statically
// rendered sign-in page would bake one device's answer into the HTML for
// everyone. That is the intended cost, not a regression to optimise away.

export default function SignInPage() {
  const userAgent = headers().get('user-agent');
  // #101 — a saved surface preference wins over the UA guess. Same helper and
  // same cookie the middleware reads, so both entry points land identically.
  const surface = surfacePreferenceFrom(cookies().get(SURFACE_COOKIE)?.value);
  return <SignInForm defaultPath={landingPathFor(surface, userAgent)} />;
}
