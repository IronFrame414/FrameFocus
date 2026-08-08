'use client';
import { useState } from 'react';
import { createClient } from '@/lib/supabase-browser';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { brand } from '@/lib/brand';
import { safeNextPath } from '@/lib/safe-next';

export function SignInForm({ defaultPath }: { defaultPath: string }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const supabase = createClient();
    setError('');
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (signInError) {
      setError(signInError.message);
      setLoading(false);
      return;
    }
    // WHERE THIS LANDS IS `?next=`, DEFAULTING TO '/dashboard' [S121].
    //
    // Hard-coding '/dashboard' here was the last link in the chain that made
    // the field app unreachable from a phone: a lapsed session on /m redirects
    // here, and this line then dropped the user into the DESKTOP app — inside
    // an installed PWA, with no address bar to escape it. lib/safe-next.ts has
    // the whole chain written out.
    //
    // READ FROM window.location, NOT useSearchParams(). The hook would force
    // this page under a Suspense boundary (Next bails out of prerendering
    // without one) for a value that is only needed at click time anyway. This
    // handler only ever runs in the browser.
    // `defaultPath` is D-12's landing, decided SERVER-SIDE from the
    // user-agent (lib/device.ts) and handed down as a prop — so a phone lands
    // on /m with no dashboard render and no bounce. `?next=` still wins, which
    // is why this reuses safeNextPath's FALLBACK parameter rather than adding a
    // second mechanism beside it.
    router.push(
      safeNextPath(new URLSearchParams(window.location.search).get('next'), defaultPath)
    );
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md rounded-xl bg-white p-8 shadow-lg">
        <div className="mb-8 text-center">
          {/* "full-LIGHT" means the variant FOR light backgrounds — not a
              light-coloured logo. This card is bg-white, so the kicker must be
              dark: navy #17213C at 15.92:1, vs full-dark's slate #7B849A at
              3.74:1. Those two files differ in that one fill and nothing else.
              Navy surfaces (sidebar, landing) use logo-full-ice.svg. */}
          <h1>
            <img
              src="/logo-full-light.svg"
              alt={brand.name}
              width={168}
              height={64}
              className="mx-auto block h-16 w-auto"
            />
          </h1>
          <p className="mt-2 text-gray-600">Sign in to your account</p>
        </div>
        <form onSubmit={handleSignIn} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 placeholder-gray-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              placeholder="you@company.com"
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 placeholder-gray-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              placeholder="Your password"
            />
            <div className="mt-1 text-right">
              <Link
                href="/forgot-password"
                className="text-sm font-medium text-brand-600 hover:text-brand-500"
              >
                Forgot password?
              </Link>
            </div>
          </div>
          {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-brand-600 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
        <p className="mt-6 text-center text-sm text-gray-600">
          Don&apos;t have an account?{' '}
          <Link href="/sign-up" className="font-medium text-brand-600 hover:text-brand-500">
            Create one
          </Link>
        </p>
      </div>
    </main>
  );
}
