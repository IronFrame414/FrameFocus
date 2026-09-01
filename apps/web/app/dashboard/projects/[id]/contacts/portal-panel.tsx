'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { cardStyle, color, font } from '@/lib/theme';
import {
  CLIENT_ACCESS_STATE_LABELS,
  CLIENT_ACCESS_STATES,
  type ClientAccessState,
  type PortalAccountRow,
} from '@/lib/services/client-portal-shared';

/**
 * M9 stage 4 — the dashboard side of the client portal.
 *
 * ⚠️ THIS IS THE FIRST CALLER OF EITHER SERVICE. `inviteClientToPortal()` and
 * `setClientAccessState()` shipped at stage 2 with a live harness and no user
 * interface at all, which means R1 and R17 were TRUE IN THE DATABASE and
 * unreachable in the product. A ruling nobody can act on is not shipped.
 *
 * ⚠️ AND THE THREE STATES ARE OFFERED BY NAME, not as an on/off switch.
 * Josh's reason for R17 having three states rather than two is that *"it
 * survives a lawyer asking what she had access to"*. A toggle would collapse
 * `signed_documents_only` and `documents_for_signature` into "off", and the
 * distinction between them — which documents she could still see, and when —
 * is the entire reason they exist. `CLIENT_ACCESS_STATE_LABELS` is imported
 * rather than retyped so the words on screen are the words in the service.
 */
export function PortalPanel({
  projectId,
  rows,
  canManage,
}: {
  projectId: string;
  rows: PortalAccountRow[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function invite(row: PortalAccountRow) {
    setBusy(row.contactId);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch('/api/portal/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactId: row.contactId, projectId }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? 'Could not send the invitation.');
        return;
      }
      // ⚠️ A FAILED SEND IS NOT A FAILED INVITATION, and the screen says both
      // things. This is the same contract `invite-email.ts` states: the row is
      // committed and the link works either way, so hiding a delivery failure
      // would recreate the defect that function exists to fix.
      setNotice(
        body.emailed
          ? `Invitation emailed to ${row.email}.`
          : `Invitation created, but the email did not send (${body.emailError ?? 'unknown error'}). Send them this link: ${body.link}`
      );
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function setState(row: PortalAccountRow, state: ClientAccessState) {
    if (!row.profileId) return;
    setBusy(row.contactId);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch('/api/portal/access-state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileId: row.profileId, state }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? 'Could not change their access.');
        return;
      }
      setNotice(`Access set to “${CLIENT_ACCESS_STATE_LABELS[state]}”.`);
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <section style={{ ...cardStyle, padding: '18px 20px', marginTop: '16px' }}>
      <h2 style={{ fontSize: '16px', fontWeight: 700, color: color.navy, margin: '0 0 4px' }}>
        Client portal
      </h2>
      <p style={{ fontSize: '13px', color: color.muted, margin: '0 0 14px' }}>
        Give this project&rsquo;s client a sign-in so they can follow the job, review documents and
        see what they have been billed.
      </p>

      {error && (
        <p style={{ fontSize: '13px', color: color.danger, margin: '0 0 12px' }}>{error}</p>
      )}
      {notice && (
        <p style={{ fontSize: '13px', color: color.successOnBg, margin: '0 0 12px' }}>{notice}</p>
      )}

      {rows.length === 0 ? (
        <p style={{ fontSize: '13px', color: color.muted, margin: 0 }}>
          No client contact is attached to this project yet. Add one above first — a portal account
          is created against a contact, not against an email address on its own.
        </p>
      ) : (
        rows.map((row) => (
          <div
            key={row.contactId}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              flexWrap: 'wrap',
              padding: '11px 0',
              borderTop: `1px solid ${color.rowDivider}`,
            }}
          >
            <span>
              <span style={{ fontWeight: 600, color: color.navy, display: 'block' }}>
                {row.contactName}
              </span>
              <span style={{ fontSize: '12.5px', color: row.email ? color.muted : color.warning }}>
                {/* R1 makes the email the username, so a contact without one
                    cannot have an account. Saying so HERE, before the click,
                    rather than only in the refusal. */}
                {row.email ?? 'No email address — add one before inviting them'}
              </span>
            </span>

            {row.profileId ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span
                  style={{
                    fontFamily: font.mono,
                    fontSize: '11px',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.03em',
                    color: row.state === 'active' ? color.successOnBg : color.warning,
                  }}
                >
                  {row.state ? CLIENT_ACCESS_STATE_LABELS[row.state] : 'Account'}
                </span>
                {canManage && (
                  <select
                    value={row.state ?? 'active'}
                    disabled={busy === row.contactId}
                    onChange={(e) => setState(row, e.target.value as ClientAccessState)}
                    style={{
                      fontSize: '12.5px',
                      padding: '5px 8px',
                      borderRadius: '8px',
                      border: `1px solid ${color.inputBorder}`,
                      backgroundColor: color.cardBg,
                      color: color.body,
                    }}
                  >
                    {CLIENT_ACCESS_STATES.map((s) => (
                      <option key={s} value={s}>
                        {CLIENT_ACCESS_STATE_LABELS[s]}
                      </option>
                    ))}
                  </select>
                )}
              </span>
            ) : (
              canManage && (
                <button
                  type="button"
                  onClick={() => invite(row)}
                  disabled={busy === row.contactId || !row.email}
                  style={{
                    fontSize: '13px',
                    fontWeight: 600,
                    padding: '7px 13px',
                    borderRadius: '9px',
                    border: 'none',
                    cursor: row.email ? 'pointer' : 'not-allowed',
                    backgroundColor: row.email ? color.primary : color.faintAlt,
                    color: '#ffffff',
                  }}
                >
                  {busy === row.contactId ? 'Sending…' : 'Invite to portal'}
                </button>
              )
            )}
          </div>
        ))
      )}
    </section>
  );
}
