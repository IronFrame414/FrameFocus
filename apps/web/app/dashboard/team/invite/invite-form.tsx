'use client';

import { useState } from 'react';
// `createInvitation()` is no longer called from here — the route creates AND
// sends (D2). It stays exported from lib/services/team.ts because the seat-usage
// read below still uses this client, and because deleting a service function is
// a wider change than this defect warrants.
import { createClient } from '@/lib/supabase-browser';

const INVITABLE_ROLES = [
  {
    value: 'admin',
    label: 'Admin',
    description: 'Full access except billing and promoting to Admin',
  },
  {
    value: 'project_manager',
    label: 'Project Manager',
    description: 'Estimates, projects, finances, and team coordination',
  },
  {
    value: 'foreman',
    label: 'Foreman',
    description: 'Field crew management, daily logs, and punch lists',
  },
  {
    value: 'crew_member',
    label: 'Crew Member',
    description: 'Clock in/out, daily logs, photos, and task updates',
  },
  {
    value: 'client',
    label: 'Client',
    description: 'Portal access to project timeline, payments, and documents',
  },
];

interface SeatUsage {
  used: number;
  limit: number;
  remaining: number;
  canInvite: boolean;
}

interface InviteFormProps {
  companyId: string;
  invitedBy: string;
  seatUsage: SeatUsage | null;
  currentUserRole: string;
}

export default function InviteForm({ companyId, invitedBy, seatUsage, currentUserRole }: InviteFormProps) {
  const supabase = createClient();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  // D2 — whether the email actually went, and why not. Both drive the panel.
  const [emailed, setEmailed] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);

  // Client invites don't count toward seat limits
  const isClientRole = role === 'client';
  const seatsBlocked = seatUsage && !seatUsage.canInvite && !isClientRole;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInviteLink(null);

    if (!email || !role) {
      setError('Please enter an email and select a role.');
      return;
    }

    // Block if seats are full (except for client invites)
    if (seatsBlocked) {
      setError(
        `Your plan allows ${seatUsage!.limit} team members. You're using ${seatUsage!.used}. Upgrade your plan to invite more.`
      );
      return;
    }

    try {
      setLoading(true);
      // D2 [S135] — POSTs to a route that CREATES AND SENDS.
      //
      // _Superseded, quoted rather than rewritten:_
      // ```
      // const invitation = await createInvitation(supabase, {...});
      // setInviteLink(`${baseUrl}/invite/accept?token=${invitation.token}`);
      // ```
      //
      // That inserted a row and rendered a link under "Share this link with
      // {email}" — no email was ever sent by this product. Josh invited two
      // employees and neither received anything. The insert still runs under
      // the caller's session inside the route, so RLS is still the gate.
      const res = await fetch('/api/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, role }),
      });
      const payload = await res.json();

      if (!res.ok) {
        setError(payload.error ?? 'Failed to create invitation');
        return;
      }

      setInviteLink(payload.link as string);
      setEmailed(payload.emailed === true);
      setEmailError((payload.emailError as string | null) ?? null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create invitation');
    } finally {
      setLoading(false);
    }
  }

  function handleCopyLink() {
    if (inviteLink) {
      navigator.clipboard.writeText(inviteLink);
    }
  }

  function handleReset() {
    setEmail('');
    setRole('');
    setInviteLink(null);
    setError(null);
    setEmailed(false);
    setEmailError(null);
  }

  return (
    <div>
      <div className="mb-6">
        <a href="/dashboard/team" className="text-sm text-blue-600 hover:text-blue-800">
          &larr; Back to Team
        </a>
        <h1 className="text-2xl font-bold text-gray-900 mt-2">Invite Team Member</h1>
        <p className="text-sm text-gray-500 mt-1">Send an invitation to join your company.</p>
      </div>

      {/* Seat usage banner */}
      {seatUsage && (
        <div
          className={`mb-4 rounded-lg border p-3 text-sm ${
            seatUsage.canInvite
              ? 'bg-gray-50 border-gray-200 text-gray-600'
              : 'bg-yellow-50 border-yellow-200 text-yellow-800'
          }`}
        >
          <span className="font-medium">
            {seatUsage.used} of {seatUsage.limit} team seats used.
          </span>
          {seatUsage.remaining > 0
            ? ` ${seatUsage.remaining} seat${seatUsage.remaining === 1 ? '' : 's'} remaining.`
            : ' Upgrade your plan to add more team members. Client invites are always unlimited.'}
        </div>
      )}

      {/* ⚠️ D2 [S135] — THE SCREEN MUST NOT IMPLY A SEND THAT DID NOT HAPPEN.
          The old copy said "Share this link with {email}" whether or not
          anything was delivered, because nothing ever was. Now the heading and
          the body follow `emailed`, and a failed send says so in its own words
          and keeps the link visible — the invitation is valid either way, and
          hiding the failure would be the same defect wearing a different coat. */}
      {inviteLink ? (
        <div
          className={`rounded-lg border p-6 ${
            emailed ? 'bg-green-50 border-green-200' : 'bg-yellow-50 border-yellow-200'
          }`}
        >
          <h2
            className={`text-lg font-semibold mb-2 ${
              emailed ? 'text-green-800' : 'text-yellow-800'
            }`}
          >
            {emailed ? 'Invitation sent' : 'Invitation created — but the email did not send'}
          </h2>
          {emailed ? (
            <p className="text-sm text-green-700 mb-4">
              We emailed <strong>{email}</strong> an invitation to join as{' '}
              <strong>{INVITABLE_ROLES.find((r) => r.value === role)?.label}</strong>. You can also
              share this link directly:
            </p>
          ) : (
            <p className="text-sm text-yellow-800 mb-4">
              The invitation for <strong>{email}</strong> to join as{' '}
              <strong>{INVITABLE_ROLES.find((r) => r.value === role)?.label}</strong> is valid, but
              we could not email it{emailError ? ` (${emailError})` : ''}. Send them this link
              yourself, or try Resend from the Team page:
            </p>
          )}
          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={inviteLink}
              className="flex-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700"
            />
            <button
              onClick={handleCopyLink}
              className={`rounded-md px-4 py-2 text-sm font-medium text-white ${
                emailed ? 'bg-green-600 hover:bg-green-700' : 'bg-yellow-600 hover:bg-yellow-700'
              }`}
            >
              Copy
            </button>
          </div>
          <p className={`text-xs mt-3 ${emailed ? 'text-green-600' : 'text-yellow-700'}`}>
            This link expires in 7 days.
          </p>
          <button
            onClick={handleReset}
            className={`mt-4 text-sm underline ${
              emailed ? 'text-green-700 hover:text-green-900' : 'text-yellow-800 hover:text-yellow-900'
            }`}
          >
            Invite another team member
          </button>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                Email address
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Role</label>
              <div className="space-y-2">
                {INVITABLE_ROLES.filter(
                  (r) => currentUserRole === 'owner' || r.value !== 'admin'
                ).map((r) => (
                  <label
                    key={r.value}
                    className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                      role === r.value
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="role"
                      value={r.value}
                      checked={role === r.value}
                      onChange={() => setRole(r.value)}
                      className="mt-0.5"
                    />
                    <div>
                      <p className="text-sm font-medium text-gray-900">{r.label}</p>
                      <p className="text-xs text-gray-500">{r.description}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {error && (
              <div className="rounded-md bg-red-50 p-3">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <button
              onClick={handleSubmit}
              disabled={loading || (!!seatsBlocked && !isClientRole)}
              className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Creating invitation...' : 'Send Invitation'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
