'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase-browser';
import { brand } from '@/lib/brand';
import { dashboardDeniedRedirect } from '@/lib/dashboard-access';
import { PASSWORD_MIN_LENGTH, passwordTooShortMessage } from '@/lib/auth/password-policy';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < PASSWORD_MIN_LENGTH) {
      setError(passwordTooShortMessage());
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { data: updated, error: updateError } = await supabase.auth.updateUser({ password });

    if (updateError) {
      setLoading(false);
      setError(updateError.message);
      return;
    }
    // S109 #162 — land where this role LIVES. This used to push every role to
    // /dashboard, which middleware then bounced for a subcontractor (→ /m/projects)
    // or a client (→ /portal). Same destinations, from the same helper
    // middleware uses, so the two cannot disagree.
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('user_id', updated.user.id)
      .maybeSingle();
    setLoading(false);
    router.push(dashboardDeniedRedirect(profile?.role) ?? '/dashboard');
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
          <p className="mt-2 text-gray-600">Set a new password</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
              New password
            </label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 placeholder-gray-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              placeholder="At least 8 characters"
            />
          </div>
          <div>
            <label htmlFor="confirm" className="block text-sm font-medium text-gray-700 mb-1">
              Confirm password
            </label>
            <input
              id="confirm"
              type="password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 placeholder-gray-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              placeholder="Re-enter the same password"
            />
          </div>
          {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-brand-600 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Updating…' : 'Update password'}
          </button>
        </form>
      </div>
    </main>
  );
}
