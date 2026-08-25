"use client";
import { useState } from 'react';
import type { Selection } from '@/lib/services/selections-client';
import type { SheetSession } from './selection-sheet';

// §6.1 controls, company side. The client's two acts (sign / decline) happen
// in the portal — stage 7's page calls /api/portal/sign-selection and
// /api/portal/decline-selection; nothing here signs on her behalf.
const MANAGER = ['owner', 'admin', 'project_manager'];
const money = (n: number | string | null) => (n == null ? '—' : Number(n).toLocaleString('en-US', { style: 'currency', currency: 'USD' }));
const card: React.CSSProperties = { backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '0.5rem', padding: '1rem', marginBottom: '1rem' };
const btn: React.CSSProperties = { padding: '0.45rem 0.875rem', borderRadius: '0.375rem', border: '1px solid #1f2937', backgroundColor: '#1f2937', color: '#fff', fontSize: '0.8125rem', fontWeight: 600, cursor: 'pointer' };
const btnGhost: React.CSSProperties = { ...btn, backgroundColor: '#fff', color: '#1f2937' };

export function SelectionLifecycle({ selection, role, sessions, onDone }: { selection: Selection; role: string; sessions: SheetSession[]; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const canManage = MANAGER.includes(role);

  async function call(path: string) {
    setBusy(true);
    setErr(null);
    const res = await fetch(`/api/selections/${selection.id}/${path}`, { method: 'POST' });
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!res.ok) setErr(body.error ?? 'That did not go through.');
    else onDone();
  }

  // [S173, Josh] The offer gate is "at least one PRICED option exists", not
  // "one has been chosen" — choosing is the client's act, in the portal.
  // _Superseded gate, quoted not deleted: `chosen > 0` over company-ticked
  // checkboxes, hinted as "Choose at least one priced option to send for
  // approval."_ The `mode === 'discussion'` arm is dropped too: the service
  // has always refused a discussion selection with no options, so the button
  // it enabled was a lie — the hint now says what to do instead.
  const hasPricedOption = selection.options.some((o) => o.amounts !== null);
  const canOffer = canManage && (selection.status === 'draft' || selection.status === 'in_discussion') && (selection.client_supplied || hasPricedOption);

  // Price figures exist only once the client has signed (`signed_*`); the
  // `offered_*` fallback renders rows stamped before S173, which remain legal.
  const sell = selection.signed_sell_amount ?? selection.offered_sell_amount;
  const deduction = selection.signed_allowance_deduction ?? selection.offered_allowance_deduction;
  const variance = selection.signed_variance ?? selection.offered_variance;

  return (
    <section style={card} data-testid="sel-lifecycle">
      <h3 style={{ fontSize: '0.6875rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', margin: '0 0 0.5rem' }}>Approval</h3>
      {err && <p data-testid="sel-lifecycle-error" style={{ color: '#b91c1c', fontSize: '0.8125rem' }}>{err}</p>}

      {(selection.status === 'awaiting_approval' || selection.status === 'approved' || selection.status === 'denied') && !selection.client_supplied && sell != null && (
        <div data-testid="sel-price-block" style={{ fontFamily: 'ui-monospace, monospace', fontSize: '0.875rem', display: 'grid', gridTemplateColumns: 'auto auto', gap: '0.125rem 1.5rem', marginBottom: '0.75rem', maxWidth: 360 }}>
          <span>Selections Price</span><span style={{ textAlign: 'right' }}>{money(sell)}</span>
          <span>Allowance Deduction</span><span style={{ textAlign: 'right' }}>-{money(deduction)}</span>
          <span style={{ fontWeight: 700 }}>{Number(variance) >= 0 ? 'Added Price' : 'Credit Owed'}</span>
          <span style={{ textAlign: 'right', fontWeight: 700 }} data-testid="sel-variance">{money(Math.abs(Number(variance)))}</span>
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
        {canOffer && <button type="button" style={btn} disabled={busy} onClick={() => call('offer')} data-testid="sel-offer">Send to client for approval</button>}
        {canManage && (selection.status === 'draft' || selection.status === 'in_discussion') && !canOffer && (
          <span style={{ fontSize: '0.8125rem', color: '#6b7280' }}>Add at least one priced option to send to the client.</span>
        )}
        {canManage && selection.status === 'awaiting_approval' && (
          <>
            <span style={{ fontSize: '0.8125rem', color: '#1e40af' }}>Released to the client — waiting for them to choose and sign in the portal.</span>
            <button type="button" style={btnGhost} disabled={busy} onClick={() => window.confirm('Withdraw this offer and return it to draft?') && call('withdraw')} data-testid="sel-withdraw">Withdraw</button>
          </>
        )}
        {canManage && selection.status === 'denied' && (
          <>
            <span style={{ fontSize: '0.8125rem', color: '#991b1b' }} data-testid="sel-denied-note">Denied by the client. Reopen to revise and resend.</span>
            <button type="button" style={btn} disabled={busy} onClick={() => call('reopen')} data-testid="sel-reopen">Reopen</button>
          </>
        )}
        {canManage && selection.status === 'approved' && (
          <>
            <span style={{ fontSize: '0.8125rem', color: '#166534' }}>Signed {selection.signed_at ? new Date(selection.signed_at).toLocaleDateString() : ''}. The signature is binding.</span>
            <button type="button" style={btnGhost} disabled={busy} onClick={() => window.confirm('Revise this approved selection? The client will need to sign again; the prior signature is kept on file.') && call('revise')} data-testid="sel-revise">Revise</button>
          </>
        )}
        {!canManage && <span style={{ fontSize: '0.8125rem', color: '#6b7280' }}>{selection.status === 'approved' ? 'Approved and signed by the client.' : selection.status === 'awaiting_approval' ? 'Awaiting the client’s signature.' : selection.status === 'denied' ? 'Denied by the client.' : 'Not yet sent to the client.'}</span>}
      </div>

      {sessions.length > 0 && canManage && (
        <ul data-testid="sel-sessions" style={{ marginTop: '0.75rem', fontSize: '0.75rem', color: '#6b7280', paddingLeft: '1rem' }}>
          {sessions.map((s) => (
            <li key={s.id}>
              {s.status === 'completed' ? `Signed${s.signer_name ? ` by ${s.signer_name}` : ''}${s.signed_at ? ` on ${new Date(s.signed_at).toLocaleString()}` : ''}${s.superseded_at ? ' — superseded by a revision (kept on file)' : ' — current'}`
                : s.status === 'declined' ? `Declined${s.declined_at ? ` on ${new Date(s.declined_at).toLocaleString()}` : ''}${s.decline_notes ? ` — "${s.decline_notes}"` : ''}`
                : s.status === 'pending' ? 'Awaiting signature' : s.status}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
