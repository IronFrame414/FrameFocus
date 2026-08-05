'use client';

import { useState } from 'react';
import Link from 'next/link';
import { brand } from '@/lib/brand';
import { createClient } from '@/lib/supabase-browser';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const redirectTo = `${window.location.origin}/auth/callback?next=/reset-password`;
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo,
    });
    setLoading(false);

    if (resetError) {
      setError(resetError.message);
      return;
    }
    setSent(true);
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
          <p className="mt-2 text-gray-600">Reset your password</p>
        </div>
        {sent ? (
          <div className="rounded-lg bg-green-50 p-4 text-sm text-green-700">
            Check your email for a password reset link. The link expires shortly, so click it soon.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
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
            {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-brand-600 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Sending…' : 'Send reset link'}
            </button>
          </form>
        )}
        <p className="mt-6 text-center text-sm text-gray-600">
          Remembered it?{' '}
          <Link href="/sign-in" className="font-medium text-brand-600 hover:text-brand-500">
            Back to sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
