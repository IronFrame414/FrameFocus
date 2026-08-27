'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase-browser';

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  project_manager: 'Project Manager',
  foreman: 'Foreman',
  crew_member: 'Crew Member',
  client: 'Client',
};

interface InvitationDetails {
  id: string;
  company_name: string;
  email: string;
  role: string;
  expires_at: string;
}

export default function AcceptInviteContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  // Memoised so `lookupInvitation` can list it — see the note in
  // `team-page-client.tsx`: `createBrowserClient` returns a new object each call.
  const supabase = useMemo(() => createClient(), []);
  const token = searchParams.get('token');

  const [invitation, setInvitation] = useState<InvitationDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  /**
   * D1 [S135] — WHY, not just "no".
   *
   * _Superseded, quoted rather than rewritten:_
   * ```
   * setError('This invitation is invalid, expired, or has already been used.');
   * ```
   *
   * Three different problems with three different remedies, in one sentence
   * that told the reader to guess. `get_invitation_by_token()` returns zero rows
   * for all of them, so this screen could not have said more even if it wanted
   * to; `get_invitation_status()` (20260914000000 §1) is the RPC that can.
   *
   * ⚠️ AND THIS IS THE ONLY LAYER THAT CAN SAY IT. The trigger raises a
   * distinct exception per reason, but a RAISE inside a trigger on `auth.users`
   * is wrapped by GoTrue and reaches the browser as "Database error saving new
   * user". The trigger is the backstop; this is the explanation.
   */
  /**
   * ⚠️ `#2-s168` [S168 → resolved S175 item 6] — THE EXPIRED SENTENCE NAMED AN
   * INTERNAL SCREEN, AND PRESCRIBED AN ACTION THAT CANNOT WORK.
   *
   * _Superseded, quoted rather than rewritten:_
   * ```
   * 'This invitation has expired. Ask the company to resend it — they can do
   *  that from their Team page.'
   * ```
   *
   * TECH_DEBT filed two faults in that one sentence: it names an **internal**
   * screen to an external counterparty who cannot see it or act on it, and once
   * `#1-s168` landed it would be a **false statement** as well, because a client
   * invite is not created or resent from the Team page — it comes from the
   * project's Contacts tab.
   *
   * ⚠️ AND THERE IS A THIRD FAULT, WHICH IS THE ONE THAT DECIDES THE REMEDY.
   * `get_invitation_status()` (`20261017000000`) branches on role: for
   * `role = 'client'`, "expired" means **the project's window closed** — the
   * function does not look at `expires_at` at all. A resend
   * (`/api/invites/[id]/resend`) resets `expires_at` and reuses the token. So
   * telling a CLIENT to ask for a resend prescribes an action that resets a
   * clock their invitation does not read. It would not have worked from the
   * Team page, and it does not work from the Contacts tab either.
   *
   * ⚠️ SO THE ROLE-AWARE MESSAGE TECH_DEBT ANTICIPATED IS THE WRONG FIX, and
   * that is why this needed no new RPC. *"The message also needs to know whether
   * the expired invite was a staff invite or a client one"* — it does not: both
   * halves of the honest sentence are identical for both. Naming ANY screen
   * repeats fault one, and naming a mechanism repeats fault three. What is true
   * for both, and actionable by the person actually reading it, is that the
   * company has to send them a new one.
   *
   * The other three cases were already screen-free and stay untouched.
   */
  function messageFor(reason: string): string {
    switch (reason) {
      case 'expired':
        return 'This invitation has expired. Ask the company to send you a new one.';
      case 'already_used':
        return 'This invitation has already been used. If that was you, sign in instead.';
      case 'cancelled':
        return 'This invitation was cancelled. Ask the company to send a new one.';
      default:
        return 'This invitation link is not valid. Check you copied the whole link, or ask the company to resend it.';
    }
  }

  // `useCallback` so `lookupInvitation` can list it [S163]. Same two inputs.
  const reasonFor = useCallback(async (): Promise<string> => {
    const { data } = await supabase.rpc('get_invitation_status', { invite_token: token });
    return typeof data === 'string' ? data : 'unknown';
  }, [supabase, token]);

  const lookupInvitation = useCallback(async () => {
    try {
      const { data, error: rpcError } = await supabase.rpc('get_invitation_by_token', {
        invite_token: token,
      });

      if (rpcError) throw rpcError;

      if (!data || data.length === 0) {
        setError(messageFor(await reasonFor()));
        return;
      }

      setInvitation(data[0] as InvitationDetails);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load invitation.');
    } finally {
      setLoading(false);
    }
  }, [supabase, token, reasonFor]);

  useEffect(() => {
    if (!token) {
      setError('No invitation token provided.');
      setLoading(false);
      return;
    }
    void lookupInvitation();
    // ⚠️ `lookupInvitation` NOW LISTED [S163]. It was omitted while `token` was
    // listed, which happened to be correct — the token is the only input the
    // lookup has — but it was correct BY COINCIDENCE. Adding a second input to
    // the function would have made this effect silently stale, and the RPC it
    // calls decides whether somebody may create an account.
  }, [token, lookupInvitation]);


  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!firstName.trim() || !lastName.trim()) {
      setError('Please enter your first and last name.');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    try {
      setSubmitting(true);

      const { error: signUpError } = await supabase.auth.signUp({
        email: invitation!.email,
        password,
        options: {
          data: {
            first_name: firstName.trim(),
            last_name: lastName.trim(),
            invitation_token: token,
          },
          // P4 [S160] — matching `sign-up/page.tsx`, which has always passed
          // this. Without it GoTrue falls back to the project's `site_url`
          // (`https://EZContractorBinder.com`), so an invitee who accepted on
          // any other origin — the Vercel preview domain, localhost — is sent
          // somewhere they were never on. It also made the destination a
          // dashboard setting nothing in this repository pins.
          //
          // ⚠️ THE VALUE IS CHECKED AGAINST `uri_allow_list` BY GoTrue, not
          // trusted. That is why `auth-email.ts` passes `redirect_to` through
          // to the verify URL unchanged rather than composing its own — building
          // a destination there would route around this check.
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      // D1 [S135] — the invitation can lapse BETWEEN the page loading and the
      // form being submitted, and it is exactly the 7-day-expiry case that
      // would. The trigger now refuses rather than silently making this person
      // the owner of a new company, but GoTrue flattens its message to
      // "Database error saving new user" — so ask the RPC again and say which.
      if (signUpError) {
        const reason = await reasonFor();
        setError(reason === 'valid' ? signUpError.message : messageFor(reason));
        setInvitation(null);
        return;
      }

      setSuccess(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create account.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-500">Loading invitation...</p>
      </div>
    );
  }

  if (!invitation && error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full bg-white rounded-lg border border-gray-200 p-8 text-center">
          <h1 className="text-xl font-bold text-gray-900 mb-2">Invalid Invitation</h1>
          <p className="text-sm text-gray-500 mb-6">{error}</p>
          <a href="/sign-in" className="text-sm text-blue-600 hover:text-blue-800">
            Go to Sign In
          </a>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full bg-white rounded-lg border border-gray-200 p-8 text-center">
          <h1 className="text-xl font-bold text-green-800 mb-2">Account Created!</h1>
          <p className="text-sm text-gray-600 mb-2">
            Check your email (<strong>{invitation!.email}</strong>) for a confirmation link.
          </p>
          <p className="text-sm text-gray-500 mb-6">
            Once confirmed, you can sign in and access <strong>{invitation!.company_name}</strong>.
          </p>
          <a
            href="/sign-in"
            className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Go to Sign In
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full bg-white rounded-lg border border-gray-200 p-8">
        <div className="text-center mb-6">
          <h1 className="text-xl font-bold text-gray-900">Join {invitation!.company_name}</h1>
          <p className="text-sm text-gray-500 mt-1">
            You&apos;ve been invited as{' '}
            <strong>{ROLE_LABELS[invitation!.role] || invitation!.role}</strong>
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={invitation!.email}
              readOnly
              className="w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="firstName" className="block text-sm font-medium text-gray-700 mb-1">
                First name
              </label>
              <input
                id="firstName"
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label htmlFor="lastName" className="block text-sm font-medium text-gray-700 mb-1">
                Last name
              </label>
              <input
                id="lastName"
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 6 characters"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div>
            <label
              htmlFor="confirmPassword"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Confirm password
            </label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {error && (
            <div className="rounded-md bg-red-50 p-3">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? 'Creating account...' : 'Create Account & Join'}
          </button>
        </div>
      </div>
    </div>
  );
}
