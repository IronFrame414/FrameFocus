'use client';

/**
 * 7G M-J — the two account pickers, fed from QuickBooks' own chart of accounts.
 *
 * ⚠️ RULED [Josh, S103]: stop typing account names. Josh hit the typo failure
 * THREE times in one session — `Cost of goods sold:Subcontractor expenses`
 * against the real `Cost of Goods Sold:Subcontractor Expense`. Wrong plural,
 * wrong capitals, parked expense. **A picker cannot be mistyped**, and storing
 * the id means a rename in QuickBooks no longer breaks the mapping.
 *
 * ⚠️ ONE COMPONENT, TWO MOUNT POINTS, per the PARITY ruling [Josh, S122] — the
 * Settings → Accounting tab and `/dashboard/settings/accounting`, Intuit's
 * registered launch URL. It lives in `components/` because neither owns it.
 *
 * ⚠️ THE LIST IS NEVER FETCHED ON RENDER. `GET /api/quickbooks/accounts` reads
 * the CACHE and costs nothing; only the visible **Refresh** button spends a
 * metered read. A settings screen is not worth `qb_read_budget`.
 */

import { useEffect, useState } from 'react';
import {
  cardStyle,
  color,
  h2Style,
  secondaryButtonStyle,
} from '@/lib/theme';

interface Account {
  id: string;
  name: string;
  path: string;
  type: string;
  suggestedPaymentType?: string;
}

export interface PaymentAccountRow {
  id: string;
  qbAccountId: string;
  name: string;
  accountType: string;
  paymentType: string;
}

export interface MemberRow {
  memberId: string;
  displayName: string;
  defaultPaymentAccountId: string | null;
}

export interface AccountSettingsProps {
  /** ⚠️ WHEN FALSE, THE WHOLE THING RENDERS NOTHING. See the ruling below. */
  connected: boolean;
  glIds: { labor: string | null; material: string | null; subcontractor: string | null; other: string | null };
  glNames: { labor: string | null; material: string | null; subcontractor: string | null; other: string | null };
  paymentAccounts: PaymentAccountRow[];
  members: MemberRow[];
  canEdit: boolean;
}

const CATEGORIES = [
  { key: 'material', label: 'Material' },
  { key: 'subcontractor', label: 'Subcontractor' },
  { key: 'other', label: 'Other' },
  { key: 'labor', label: 'Labor' },
] as const;

const selectStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  border: `1px solid ${color.inputBorder}`,
  borderRadius: 6,
  fontSize: 14,
  background: '#fff',
};

export function AccountSettings(props: AccountSettingsProps) {
  const { connected } = props;
  const [gl, setGl] = useState<Account[]>([]);
  const [pay, setPay] = useState<Account[]>([]);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!connected) return;
    let cancelled = false;
    void (async () => {
      try {
        const r = await fetch('/api/quickbooks/accounts');
        const b = (await r.json()) as {
          gl?: Account[];
          payment?: Account[];
          fetchedAt?: string | null;
          error?: string;
        };
        if (cancelled) return;
        if (!r.ok) setError(b.error ?? 'Could not read your accounts.');
        else {
          setGl(b.gl ?? []);
          setPay(b.payment ?? []);
          setFetchedAt(b.fetchedAt ?? null);
        }
      } catch {
        if (!cancelled) setError('Could not reach the server.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [connected]);

  // ⚠️ RULED [Josh, S103]: "if QuickBooks is not connected, the GL account
  // fields are NOT VISIBLE AT ALL — they do nothing, and showing an empty
  // dropdown invites a user to configure something inert. Hide the section, do
  // not disable it."
  //
  // ⚠️ NOTE WHAT IS *NOT* HIDDEN: the company fixed burden ($/hr) that shares
  // the old GL form. It is a payroll figure with no QuickBooks involvement, and
  // hiding it would take a working setting away from every disconnected
  // company. Only the four QuickBooks mappings live here.
  if (!connected) return null;

  async function post(body: Record<string, unknown>, onOk?: () => void) {
    setBusy(true);
    setError(null);
    const r = await fetch('/api/quickbooks/accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    setBusy(false);
    if (r.ok) {
      onOk ? onOk() : window.location.reload();
      return;
    }
    const b = (await r.json().catch(() => ({}))) as { error?: string };
    setError(b.error ?? 'Could not save.');
  }

  return (
    <div style={{ display: 'grid', gap: '1.5rem' }}>
      <section style={{ ...cardStyle, padding: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
          <h2 style={h2Style}>Cost accounts</h2>
          {props.canEdit && (
            <button
              type="button"
              disabled={busy}
              style={{ ...secondaryButtonStyle, padding: '5px 12px', fontSize: 12 }}
              onClick={() => void post({ action: 'refresh' })}
            >
              {busy ? 'Refreshing…' : 'Refresh from QuickBooks'}
            </button>
          )}
        </div>

        <p style={{ color: color.body, fontSize: '0.875rem', margin: '0.5rem 0 1rem' }}>
          Which QuickBooks account each kind of cost is posted <em>to</em>. Chosen from your chart of
          accounts, so it cannot be mistyped — and it keeps working if you rename the account in
          QuickBooks.
        </p>

        {gl.length === 0 ? (
          <p style={{ color: color.warning, fontSize: '0.875rem', margin: 0 }}>
            No accounts loaded yet. Press <strong>Refresh from QuickBooks</strong> to pull your chart
            of accounts.
          </p>
        ) : (
          <div style={{ display: 'grid', gap: '0.75rem' }}>
            {CATEGORIES.map((c) => (
              <label key={c.key} style={{ display: 'grid', gap: 4 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: color.body }}>{c.label}</span>
                <select
                  style={selectStyle}
                  disabled={!props.canEdit || busy}
                  value={props.glIds[c.key] ?? ''}
                  onChange={(e) => {
                    const chosen = gl.find((a) => a.id === e.target.value);
                    if (!chosen) return;
                    void post({
                      action: 'gl',
                      category: c.key,
                      accountId: chosen.id,
                      accountName: chosen.path,
                    });
                  }}
                >
                  <option value="">
                    {/* The legacy free-text name, if one was typed before M-J. */}
                    {props.glNames[c.key]
                      ? `${props.glNames[c.key]} (typed — re-pick to lock it)`
                      : 'Choose an account…'}
                  </option>
                  {gl.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.path} · {a.type}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        )}

        {fetchedAt && (
          <p style={{ color: color.muted, fontSize: 12, marginTop: '0.75rem' }}>
            Account list last read from QuickBooks{' '}
            {new Date(fetchedAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}.
          </p>
        )}
      </section>

      <section style={{ ...cardStyle, padding: '1.25rem' }}>
        <h2 style={h2Style}>Payment accounts</h2>
        <p style={{ color: color.body, fontSize: '0.875rem', margin: '0.5rem 0 1rem' }}>
          The accounts and cards you spend <em>from</em>. Every expense says which one paid for it.
          {/* ⚠️ THE COPY THAT STOPS THE ONE MISTAKE THAT MATTERS: two fields
              QuickBooks both calls AccountRef, one level apart in the same
              request. Swapping them posts the spend to the bank. */}
          <br />
          <span style={{ color: color.muted }}>
            This is money <em>out of</em> these accounts. The accounts above are what it was spent{' '}
            <em>on</em>.
          </span>
        </p>

        {props.paymentAccounts.length === 0 ? (
          <p style={{ color: color.warning, fontSize: '0.875rem', margin: '0 0 1rem' }}>
            None yet. Add at least one — <strong>an expense cannot be approved without saying which
            account paid for it.</strong>
          </p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 1rem', display: 'grid', gap: 8 }}>
            {props.paymentAccounts.map((a) => (
              <li
                key={a.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 12,
                  border: `1px solid ${color.cardBorder}`,
                  borderRadius: 6,
                  padding: '8px 10px',
                }}
              >
                <span style={{ fontSize: 14 }}>
                  {a.name}
                  <span style={{ color: color.muted }}>
                    {' '}
                    — {a.accountType} · posts as {a.paymentType}
                  </span>
                </span>
                {props.canEdit && (
                  <button
                    type="button"
                    disabled={busy}
                    style={{
                      border: 'none',
                      background: 'none',
                      color: color.danger,
                      fontWeight: 600,
                      fontSize: 13,
                      cursor: 'pointer',
                    }}
                    onClick={() => void post({ action: 'remove', rowId: a.id })}
                  >
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        {props.canEdit && pay.length > 0 && (
          <label style={{ display: 'grid', gap: 4, maxWidth: 420 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: color.body }}>Add an account</span>
            <select
              style={selectStyle}
              disabled={busy}
              value=""
              onChange={(e) => {
                const chosen = pay.find((a) => a.id === e.target.value);
                if (!chosen) return;
                void post({
                  action: 'payment',
                  accountId: chosen.id,
                  accountName: chosen.name,
                  accountType: chosen.type,
                  paymentType: chosen.suggestedPaymentType,
                });
              }}
            >
              <option value="">Choose an account…</option>
              {pay
                .filter((a) => !props.paymentAccounts.some((p) => p.qbAccountId === a.id))
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} · {a.type}
                  </option>
                ))}
            </select>
            <span style={{ color: color.muted, fontSize: 12 }}>
              Only bank, credit card and current-liability accounts appear — QuickBooks refuses
              anything else as the payer of an expense.
            </span>
          </label>
        )}
      </section>

      {props.paymentAccounts.length > 0 && (
        <section style={{ ...cardStyle, padding: '1.25rem' }}>
          <h2 style={h2Style}>Who spends from what</h2>
          <p style={{ color: color.body, fontSize: '0.875rem', margin: '0.5rem 0 1rem' }}>
            Each person&rsquo;s usual account. It pre-fills their expenses; they can change it on any
            one. {/* ⚠️ Josh: set by Owner/Admin, "never by the user: it
                       determines where money posts." Enforced in RLS and by
                       enforce_company_members_payment_default. */}
            <br />
            <span style={{ color: color.muted }}>
              Leaving someone without one is fine — they just pick an account each time.
            </span>
          </p>

          <div style={{ display: 'grid', gap: 8 }}>
            {props.members.map((m) => (
              <label
                key={m.memberId}
                style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, alignItems: 'center' }}
              >
                <span style={{ fontSize: 14 }}>{m.displayName}</span>
                <select
                  style={selectStyle}
                  disabled={!props.canEdit || busy}
                  defaultValue={m.defaultPaymentAccountId ?? ''}
                  onChange={(e) =>
                    void post({
                      action: 'default',
                      memberId: m.memberId,
                      rowId: e.target.value || null,
                    })
                  }
                >
                  <option value="">No default — ask every time</option>
                  {props.paymentAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        </section>
      )}

      {error && (
        <p style={{ color: color.danger, fontSize: '0.875rem', margin: 0 }}>{error}</p>
      )}
    </div>
  );
}
