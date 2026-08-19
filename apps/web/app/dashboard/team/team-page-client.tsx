'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase-browser';
import {
  getTeamMembers,
  getPendingInvitations,
  cancelInvitation,
  type TeamMember,
  type Invitation,
} from '@/lib/services/team';
import { ROLE_LABELS, type CompanyRole } from '@framefocus/shared';

export default function TeamPageClient({ userRole }: { userRole: string }) {
  // ⚠️ MEMOISED [S163]. `createClient()` returns a NEW object on every call —
  // `@supabase/ssr`'s `createBrowserClient` does not memoise the instance — so a
  // client created in render cannot go in a dependency array without re-running
  // the effect forever. Stabilising it here is what lets `loadData` list its
  // real dependencies instead of silencing the rule.
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  // D4 — per-row UI state for Copy link / Resend.
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [resendNote, setResendNote] = useState<Record<string, { ok: boolean; text: string }>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const canManageTeam = userRole === 'owner' || userRole === 'admin';

  // ⚠️ WAS `useEffect(() => { loadData(); }, [])` WITH AN EMPTY ARRAY [S163].
  // `loadData` closes over `canManageTeam`, which is derived from the `userRole`
  // PROP — so the empty array said "this data never depends on the role" and it
  // does: a page rendered for an owner and then for a non-owner would keep the
  // owner's invitation list. Mount-once was the intent; mount-once-per-role is
  // the truth, and that is what listing the dependency expresses.
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [membersData, invitationsData] = await Promise.all([
        getTeamMembers(supabase),
        canManageTeam ? getPendingInvitations(supabase) : Promise.resolve([]),
      ]);
      setMembers(membersData);
      setInvitations(invitationsData);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load team data');
    } finally {
      setLoading(false);
    }
  }, [supabase, canManageTeam]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // D4 — the link, retrievable again. `token` comes back on the row now
  // (getPendingInvitations); the policy always allowed it.
  function handleCopyLink(inv: Invitation) {
    if (!inv.token) return;
    navigator.clipboard.writeText(`${window.location.origin}/invite/accept?token=${inv.token}`);
    setCopiedId(inv.id);
    setTimeout(() => setCopiedId((cur) => (cur === inv.id ? null : cur)), 2000);
  }

  // D4 — resend REUSES the token and RESETS the expiry (Josh, S135 Q6), so a
  // copy already circulating keeps working. The note below reports whether the
  // email actually went: D2's whole point is not claiming a send that failed.
  async function handleResend(invitationId: string) {
    setResendingId(invitationId);
    try {
      const res = await fetch(`/api/invites/${invitationId}/resend`, { method: 'POST' });
      const payload = await res.json();
      if (!res.ok) {
        setResendNote((p) => ({
          ...p,
          [invitationId]: { ok: false, text: payload.error ?? 'Could not resend.' },
        }));
        return;
      }
      setResendNote((p) => ({
        ...p,
        [invitationId]: payload.emailed
          ? { ok: true, text: 'Invitation re-sent. The link is valid for another 7 days.' }
          : {
              ok: false,
              text: `Expiry extended, but the email did not send${
                payload.emailError ? ` (${payload.emailError})` : ''
              }. Use Copy link instead.`,
            },
      }));
      await loadData();
    } catch (err) {
      setResendNote((p) => ({
        ...p,
        [invitationId]: {
          ok: false,
          text: err instanceof Error ? err.message : 'Could not resend.',
        },
      }));
    } finally {
      setResendingId(null);
    }
  }

  async function handleCancelInvite(invitationId: string) {
    if (!confirm('Cancel this invitation?')) return;
    try {
      await cancelInvitation(supabase, invitationId);
      setInvitations((prev) => prev.filter((inv) => inv.id !== invitationId));
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to cancel invitation');
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-gray-500">Loading team...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md bg-red-50 p-4">
        <p className="text-red-700">{error}</p>
        <button
          onClick={loadData}
          className="mt-2 text-sm text-red-600 underline hover:text-red-800"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Team</h1>
          <p className="text-sm text-gray-500 mt-1">
            {members.length} member{members.length !== 1 ? 's' : ''}
          </p>
        </div>
        {canManageTeam && (
          <a
            href="/dashboard/team/invite"
            className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            + Invite Team Member
          </a>
        )}
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden mb-8">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Name
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Role
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Joined
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {members.map((member) => (
              <tr
                key={member.id}
                onClick={() => router.push(`/dashboard/team/${member.id}`)}
                className="hover:bg-gray-50 cursor-pointer"
              >
                <td className="px-6 py-4 whitespace-nowrap">
                  <p className="text-sm font-medium text-gray-900">
                    {member.first_name} {member.last_name}
                  </p>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700">
                    {ROLE_LABELS[member.role as CompanyRole] || member.role}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {member.created_at ? new Date(member.created_at).toLocaleDateString() : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {canManageTeam && invitations.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Pending Invitations</h2>
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Email
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Role
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Expires
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {invitations.map((inv) => (
                  <tr key={inv.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {inv.email}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="inline-flex items-center rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-medium text-yellow-700">
                        {ROLE_LABELS[inv.role as CompanyRole] || inv.role}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {inv.expires_at ? new Date(inv.expires_at).toLocaleDateString() : '—'}
                    </td>
                    {/* D4 [S135] — Cancel used to be the ONLY control here, so
                        a lost link (or, before D2, a link that was never
                        delivered because no invite email existed) left
                        cancel-and-re-invite as the only path. */}
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => handleCopyLink(inv)}
                          className="text-sm text-gray-700 hover:text-gray-900"
                        >
                          {copiedId === inv.id ? 'Copied' : 'Copy link'}
                        </button>
                        <button
                          onClick={() => handleResend(inv.id)}
                          disabled={resendingId === inv.id}
                          className="text-sm text-blue-600 hover:text-blue-800 disabled:opacity-50"
                        >
                          {resendingId === inv.id ? 'Resending…' : 'Resend'}
                        </button>
                        <button
                          onClick={() => handleCancelInvite(inv.id)}
                          className="text-sm text-red-600 hover:text-red-800"
                        >
                          Cancel
                        </button>
                      </div>
                      {resendNote[inv.id] && (
                        <p
                          className={`mt-1 text-xs ${
                            resendNote[inv.id].ok ? 'text-green-700' : 'text-yellow-800'
                          }`}
                        >
                          {resendNote[inv.id].text}
                        </p>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
