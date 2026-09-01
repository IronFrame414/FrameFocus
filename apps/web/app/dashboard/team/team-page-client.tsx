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
import { useConfirm, useAlert } from '@/components/confirm/confirm-provider';
import { ListPageHeader } from '@/components/list-screen/list-screen';
import { badgeStyle, cardStyle, color, font, microLabelStyle, primaryButtonStyle } from '@/lib/theme';

export default function TeamPageClient({
  userRole,
  hours,
  burden,
}: {
  userRole: string;
  /** §8.5 — per-PROFILE weekly paid hours + OT, server-grouped (one
   *  getSessionsForReview for the week, weeklyHoursSummary per member). */
  hours: Record<string, { paid: number; overtime: number }>;
  /** §8.5 — derived burden $/hr per profile (rate × multiplier or rate +
   *  company fixed). Empty for roles whose RLS cannot read pay rates —
   *  the column reflows to em-dashes. */
  burden: Record<string, number>;
}) {
  // ⚠️ MEMOISED [S163]. `createClient()` returns a NEW object on every call —
  // `@supabase/ssr`'s `createBrowserClient` does not memoise the instance — so a
  // client created in render cannot go in a dependency array without re-running
  // the effect forever. Stabilising it here is what lets `loadData` list its
  // real dependencies instead of silencing the rule.
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const confirm = useConfirm();
  const alert = useAlert();
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
    if (!(await confirm('Cancel this invitation?'))) return;
    try {
      await cancelInvitation(supabase, invitationId);
      setInvitations((prev) => prev.filter((inv) => inv.id !== invitationId));
    } catch (err: unknown) {
      void alert(err instanceof Error ? err.message : 'Failed to cancel invitation');
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

  const th: React.CSSProperties = { ...microLabelStyle, padding: '10px 12px', textAlign: 'left' };
  const td: React.CSSProperties = { padding: '11px 12px', fontSize: '13px', color: color.bodyAlt };
  const monoCell: React.CSSProperties = { ...td, fontFamily: font.mono, fontSize: '12.5px' };

  // §8.5 — pending invites render AS ROWS of the one table (presentation
  // only: invitations.role and .email were always there). The three D4
  // controls ride along in the trailing cell.
  return (
    <div>
      <ListPageHeader
        title="Team"
        subtitle={`${members.length} member${members.length === 1 ? '' : 's'}${
          canManageTeam && invitations.length > 0
            ? ` · ${invitations.length} invited`
            : ''
        }`}
      >
        {canManageTeam && (
          <a href="/dashboard/team/invite" style={primaryButtonStyle}>
            + Invite Team Member
          </a>
        )}
      </ListPageHeader>

      <div style={{ ...cardStyle, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr
              style={{
                backgroundColor: color.tableHeadBg,
                borderBottom: `1px solid ${color.neutralBadgeBg}`,
                textAlign: 'left',
              }}
            >
              <th style={{ ...th, paddingLeft: '20px' }}>Name</th>
              <th style={th}>Role</th>
              <th style={th}>Burden / hr</th>
              <th style={th}>This week</th>
              <th style={th}>Joined</th>
              {canManageTeam && <th style={{ ...th, paddingRight: '20px' }}>Invite</th>}
            </tr>
          </thead>
          <tbody>
            {members.map((member) => {
              const b = burden[member.id];
              const h = hours[member.id];
              return (
                <tr
                  key={member.id}
                  onClick={() => router.push(`/dashboard/team/${member.id}`)}
                  style={{ borderBottom: `1px solid ${color.rowDivider}`, cursor: 'pointer' }}
                >
                  <td style={{ ...td, paddingLeft: '20px', fontWeight: 600, color: color.navy }}>
                    {member.first_name} {member.last_name}
                  </td>
                  <td style={td}>
                    <span
                      style={{
                        ...badgeStyle,
                        backgroundColor: color.neutralBadgeBg,
                        color: color.neutralBadgeText,
                      }}
                    >
                      {ROLE_LABELS[member.role as CompanyRole] || member.role}
                    </span>
                  </td>
                  {/* Burden — derived, never stored; em-dash for roles whose
                      RLS cannot read pay rates (the reflow, not a broken page). */}
                  <td style={monoCell}>
                    {b !== undefined
                      ? `$${b.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                      : '—'}
                  </td>
                  <td style={monoCell}>
                    {h
                      ? `${h.paid.toFixed(1)}h${h.overtime > 0 ? ` · ${h.overtime.toFixed(1)}h OT` : ''}`
                      : '—'}
                  </td>
                  <td style={monoCell}>
                    {member.created_at ? new Date(member.created_at).toLocaleDateString() : '—'}
                  </td>
                  {canManageTeam && <td style={{ ...td, paddingRight: '20px' }} />}
                </tr>
              );
            })}
            {canManageTeam &&
              invitations.map((inv) => (
                <tr key={inv.id} style={{ borderBottom: `1px solid ${color.rowDivider}` }}>
                  <td style={{ ...td, paddingLeft: '20px' }}>
                    <span style={{ fontWeight: 600, color: color.bodyAlt }}>{inv.email}</span>
                    <span
                      style={{
                        ...badgeStyle,
                        marginLeft: '8px',
                        backgroundColor: color.warningBg,
                        color: color.warning,
                      }}
                    >
                      Invited
                    </span>
                  </td>
                  <td style={td}>
                    <span
                      style={{
                        ...badgeStyle,
                        backgroundColor: color.warningBg,
                        color: color.warning,
                      }}
                    >
                      {ROLE_LABELS[inv.role as CompanyRole] || inv.role}
                    </span>
                  </td>
                  <td style={monoCell}>—</td>
                  <td style={monoCell}>—</td>
                  <td style={monoCell}>
                    {inv.expires_at
                      ? `expires ${new Date(inv.expires_at).toLocaleDateString()}`
                      : '—'}
                  </td>
                  {/* D4 [S135] — Cancel used to be the ONLY control here, so a
                      lost link (or, before D2, a link that was never delivered
                      because no invite email existed) left cancel-and-re-invite
                      as the only path. */}
                  <td style={{ ...td, paddingRight: '20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <button
                        onClick={() => handleCopyLink(inv)}
                        style={{
                          border: 'none',
                          background: 'none',
                          padding: 0,
                          cursor: 'pointer',
                          fontSize: '13px',
                          fontFamily: font.sans,
                          color: color.bodyAlt,
                          fontWeight: 600,
                        }}
                      >
                        {copiedId === inv.id ? 'Copied' : 'Copy link'}
                      </button>
                      <button
                        onClick={() => handleResend(inv.id)}
                        disabled={resendingId === inv.id}
                        style={{
                          border: 'none',
                          background: 'none',
                          padding: 0,
                          cursor: 'pointer',
                          fontSize: '13px',
                          fontFamily: font.sans,
                          color: color.primary,
                          fontWeight: 600,
                          opacity: resendingId === inv.id ? 0.5 : 1,
                        }}
                      >
                        {resendingId === inv.id ? 'Resending…' : 'Resend'}
                      </button>
                      <button
                        onClick={() => handleCancelInvite(inv.id)}
                        style={{
                          border: 'none',
                          background: 'none',
                          padding: 0,
                          cursor: 'pointer',
                          fontSize: '13px',
                          fontFamily: font.sans,
                          color: color.danger,
                          fontWeight: 600,
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                    {resendNote[inv.id] && (
                      <p
                        style={{
                          margin: '4px 0 0',
                          fontSize: '11.5px',
                          color: resendNote[inv.id].ok ? color.successOnBg : color.warning,
                        }}
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
  );
}
