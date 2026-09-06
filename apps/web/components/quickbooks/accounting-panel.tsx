'use client';

/**
 * 7G §5.1 / §5.2 / §5.3 — the QuickBooks connection surface.
 *
 * ⚠️ ONE COMPONENT, TWO MOUNT POINTS, BY THE PARITY RULING [Josh, S122].
 * This renders both at `/dashboard/settings/accounting` (the URL registered
 * with Intuit as the launch URL) and inside the Settings → Accounting tab.
 * "Share the mechanism, not just the intent … A second implementation that
 * 'does the same thing' is the divergence, written in a form that looks like
 * agreement." It lives in `components/` rather than under either route,
 * because location is a claim about ownership and neither surface owns this.
 *
 * ⚠️ `isOwner` DOES NOT HIDE DATA, IT HIDES CONTROLS — and that is not a
 * Financial-Visibility-Floor gate. Everything shown here is Owner/Admin by RLS
 * already (`companies_select_own`, `qb_sync_queue_select_owner_admin`), so a PM
 * receives nothing to render in the first place. The Owner/Admin split is about
 * WHO MAY ACT: connecting and disconnecting are Owner-only (CLAUDE.md owner-only
 * #4) and enforced in the route AND by `enforce_companies_qb_scope`. Removing
 * the buttons is the third layer, not the floor.
 */

import { useState } from 'react';
import { brand } from '@/lib/brand';
import type { QueueItem, QueueSummary, QuickBooksConnection } from '@/lib/services/quickbooks';
import {
  badgeStyle,
  cardStyle,
  color,
  font,
  h2Style,
  microLabelStyle,
  primaryButtonStyle,
  secondaryButtonStyle,
} from '@/lib/theme';

export interface AccountingPanelProps {
  connection: QuickBooksConnection | null;
  queue: QueueSummary;
  isOwner: boolean;
  /** From `?qb_error=` / `?qb_connected=` on the OAuth round trip. */
  notice?: { kind: 'ok' | 'error'; message: string } | null;
}

/** Numbers are IBM Plex Mono — `font.mono`, never a `--font-mono` variable
 *  (there isn't one). */
const monoStyle: React.CSSProperties = { fontFamily: font.mono, fontVariantNumeric: 'tabular-nums' };

function formatDate(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function AccountingPanel({ connection, queue, isOwner, notice }: AccountingPanelProps) {
  const state = connection?.state ?? 'disconnected';
  const isConnected = state === 'connected';
  const needsReauth = state === 'needs_reauth' || state === 'revoked';

  return (
    <div style={{ display: 'grid', gap: '1.5rem' }}>
      {notice ? <Notice kind={notice.kind} message={notice.message} /> : null}

      {needsReauth ? <ReauthBanner isOwner={isOwner} /> : null}

      <section style={{ ...cardStyle, padding: '1.25rem' }}>
        <h2 style={h2Style}>QuickBooks Online</h2>
        <p style={{ color: color.body, fontSize: '0.875rem', margin: '0.5rem 0 1rem' }}>
          {brand.name} runs your operations; QuickBooks runs your books. Invoices and approved
          expenses are sent to QuickBooks automatically, and payments taken through QuickBooks come
          back here.
        </p>

        {isConnected || needsReauth ? (
          <ConnectionCard connection={connection!} isOwner={isOwner} />
        ) : (
          <NotConnected isOwner={isOwner} />
        )}
      </section>

      {isConnected || needsReauth ? (
        <>
          <IncomeItemCard connection={connection!} isOwner={isOwner} />
          <PaymentAccountCard connection={connection!} isOwner={isOwner} />
          <PaymentsCard connection={connection!} />
          <SyncStatusCard queue={queue} />
        </>
      ) : null}
    </div>
  );
}

function Notice({ kind, message }: { kind: 'ok' | 'error'; message: string }) {
  return (
    <div
      role="status"
      style={{
        ...cardStyle,
        padding: '0.75rem 1rem',
        backgroundColor: kind === 'ok' ? color.successBg : color.warningBg,
        borderColor: kind === 'ok' ? color.successOnBg : color.warning,
        color: kind === 'ok' ? color.successOnBg : color.warning,
        fontSize: '0.875rem',
      }}
    >
      {message}
    </div>
  );
}

/** §6 / §5.1 — the persistent amber banner. Work KEEPS QUEUEING behind it
 *  [Josh, S148], and the copy says so: nothing is lost, nothing needs redoing. */
function ReauthBanner({ isOwner }: { isOwner: boolean }) {
  return (
    <div
      role="alert"
      style={{
        ...cardStyle,
        padding: '1rem',
        backgroundColor: color.warningBg,
        borderColor: color.warning,
      }}
    >
      <strong style={{ color: color.warning }}>QuickBooks needs to be reconnected.</strong>
      <p style={{ color: color.body, fontSize: '0.875rem', margin: '0.5rem 0 0' }}>
        Your invoices and expenses are still being recorded and are waiting in the queue — nothing has
        been lost and nothing needs to be re-entered. They will sync as soon as the connection is
        restored.
        {!isOwner ? ' Ask the account Owner to reconnect.' : ''}
      </p>
      {isOwner ? (
        <a href="/api/quickbooks/connect" style={{ ...primaryButtonStyle, display: 'inline-block', marginTop: '0.75rem', textDecoration: 'none' }}>
          Reconnect QuickBooks
        </a>
      ) : null}
    </div>
  );
}

function NotConnected({ isOwner }: { isOwner: boolean }) {
  if (!isOwner) {
    return (
      <p style={{ color: color.muted, fontSize: '0.875rem', margin: 0 }}>
        QuickBooks is not connected. Only the account Owner can connect it.
      </p>
    );
  }
  return (
    <div>
      {/* A plain link, not a fetch: the OAuth handshake is a TOP-LEVEL browser
          navigation to Intuit's consent screen. An XHR cannot show it, and the
          state cookie is SameSite=Lax, which requires exactly this. */}
      <a href="/api/quickbooks/connect" style={{ ...primaryButtonStyle, display: 'inline-block', textDecoration: 'none' }}>
        Connect to QuickBooks
      </a>
      <p style={{ color: color.muted, fontSize: '0.8125rem', margin: '0.75rem 0 0' }}>
        You will be sent to Intuit to approve the connection, then returned here.
      </p>
    </div>
  );
}

function ConnectionCard({
  connection,
  isOwner,
}: {
  connection: QuickBooksConnection;
  isOwner: boolean;
}) {
  return (
    <div>
      <dl
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '1rem',
          margin: 0,
        }}
      >
        <Field label="Status">
          <span
            style={{
              ...badgeStyle,
              backgroundColor: connection.state === 'connected' ? color.successBg : color.warningBg,
              color: connection.state === 'connected' ? color.successOnBg : color.warning,
            }}
          >
            {connection.state === 'connected' ? 'Connected' : 'Needs reconnecting'}
          </span>
        </Field>
        <Field label="QuickBooks company ID">
          <span style={monoStyle}>{connection.realmId ?? '—'}</span>
        </Field>
        <Field label="Connected since">{formatDate(connection.connectedAt)}</Field>
        <Field label="Last refreshed">{formatDate(connection.refreshRotatedAt)}</Field>
        <Field label="Reconnect required by">{formatDate(connection.reauthRequiredAfter)}</Field>
      </dl>

      {isOwner ? <DisconnectControl /> : null}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt style={microLabelStyle}>{label}</dt>
      <dd style={{ margin: '0.25rem 0 0', color: color.navy, fontSize: '0.875rem' }}>{children}</dd>
    </div>
  );
}

/**
 * §5.3 — disconnect OFFERS BOTH, and never picks for the user.
 *
 * ⚠️ THE TWO CHOICES ARE NOT COSMETIC. "Keep" leaves every `qb_*_id` in place so
 * reconnecting to the SAME QuickBooks company resumes exactly where it stopped.
 * "Clear" nulls those links so a connection to a DIFFERENT company starts clean.
 * Choosing wrongly for the user would either strand their history or silently
 * point new work at stale ids.
 */
function DisconnectControl() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function disconnect(mode: 'keep' | 'clear') {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/quickbooks/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? 'Could not disconnect.');
        setBusy(false);
        return;
      }
      window.location.reload();
    } catch {
      setError('Could not reach the server.');
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} style={{ ...secondaryButtonStyle, marginTop: '1.25rem' }}>
        Disconnect QuickBooks
      </button>
    );
  }

  return (
    <div style={{ ...cardStyle, padding: '1rem', marginTop: '1.25rem', backgroundColor: color.pageBg }}>
      <strong style={{ color: color.navy, fontSize: '0.9375rem' }}>
        Disconnect QuickBooks — what should happen to the links?
      </strong>
      <p style={{ color: color.body, fontSize: '0.875rem', margin: '0.5rem 0 1rem' }}>
        Nothing is deleted either way. Your invoices, payments and expenses stay exactly as they are,
        in both systems.
      </p>

      <div style={{ display: 'grid', gap: '0.75rem' }}>
        <button type="button" disabled={busy} onClick={() => disconnect('keep')} style={{ ...secondaryButtonStyle, textAlign: 'left' }}>
          <strong>Keep the QuickBooks links</strong>
          <span style={{ display: 'block', color: color.muted, fontSize: '0.8125rem', marginTop: '0.25rem' }}>
            Reconnecting to the same QuickBooks company picks up where you left off. Choose this if you
            are reconnecting later.
          </span>
        </button>
        <button type="button" disabled={busy} onClick={() => disconnect('clear')} style={{ ...secondaryButtonStyle, textAlign: 'left' }}>
          <strong>Clear the QuickBooks links</strong>
          <span style={{ display: 'block', color: color.muted, fontSize: '0.8125rem', marginTop: '0.25rem' }}>
            Forget which QuickBooks record each invoice, expense and client matches. Choose this if you
            are moving to a different QuickBooks company.
          </span>
        </button>
        <button type="button" disabled={busy} onClick={() => setOpen(false)} style={{ ...secondaryButtonStyle, opacity: 0.7 }}>
          Cancel
        </button>
      </div>

      {error ? (
        <p style={{ color: color.danger, fontSize: '0.875rem', marginTop: '0.75rem' }}>{error}</p>
      ) : null}
    </div>
  );
}

/** §5.1 onboarding copy — "no income Item" [RULED S103 Q10]. */
/**
 * M-G — the account a Purchase posts against.
 *
 * ⚠️ THIS IS NOT THE GL MAPPING, AND THE COPY HAS TO SAY SO. The `gl_account_*`
 * fields on this same settings page are the accounts an expense is spent ON.
 * This is the account the money came FROM. The QuickBooks API calls both
 * `AccountRef`, one level apart in the same request, and swapping them posts
 * the spend to the bank.
 */
function PaymentAccountCard({
  connection,
  isOwner,
}: {
  connection: QuickBooksConnection;
  isOwner: boolean;
}) {
  const [accounts, setAccounts] = useState<Array<{ id: string; name: string; type: string }> | null>(
    null
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/quickbooks/payment-account');
      const body = (await response.json()) as {
        accounts?: Array<{ id: string; name: string; type: string }>;
        error?: string;
      };
      if (!response.ok) {
        setError(body.error ?? 'Could not read your QuickBooks accounts.');
      } else {
        setAccounts(body.accounts ?? []);
      }
    } catch {
      setError('Could not reach the server.');
    }
    setBusy(false);
  }

  async function choose(account: { id: string; name: string; type: string }) {
    setBusy(true);
    const response = await fetch('/api/quickbooks/payment-account', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: account.id,
        name: account.name,
        // A card account pays by card; anything else defaults to Check, which
        // is what "paid from the business account" looks like in QuickBooks.
        paymentType: account.type === 'Credit Card' ? 'CreditCard' : 'Check',
      }),
    });
    if (response.ok) {
      window.location.reload();
      return;
    }
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    setError(body.error ?? 'Could not save.');
    setBusy(false);
  }

  return (
    <section style={{ ...cardStyle, padding: '1.25rem' }}>
      <h2 style={h2Style}>Expense payment account</h2>

      {connection.paymentAccountName ? (
        <p style={{ color: color.body, fontSize: '0.875rem', margin: '0.5rem 0 1rem' }}>
          Expenses are recorded in QuickBooks as paid from{' '}
          <strong>{connection.paymentAccountName}</strong>.
        </p>
      ) : (
        <p style={{ color: color.warning, fontSize: '0.875rem', margin: '0.5rem 0 1rem' }}>
          QuickBooks needs to know <strong>which account paid</strong> for an expense — a bank or
          credit card account. Nothing is lost until you choose: approved expenses wait, and sync as
          soon as this is set.
        </p>
      )}

      <p style={{ color: color.muted, fontSize: '0.8125rem', margin: '0 0 1rem' }}>
        This is the account money came <em>from</em>. The accounts an expense is spent{' '}
        <em>on</em> are the GL mappings further down this page.
      </p>

      {isOwner ? (
        <>
          <button type="button" onClick={load} disabled={busy} style={secondaryButtonStyle}>
            {busy ? 'Loading…' : connection.paymentAccountName ? 'Change account' : 'Choose an account'}
          </button>

          {accounts !== null ? (
            accounts.length === 0 ? (
              <p style={{ color: color.muted, fontSize: '0.875rem', marginTop: '0.75rem' }}>
                No bank or credit card accounts were found in QuickBooks.
              </p>
            ) : (
              <ul
                style={{
                  listStyle: 'none',
                  padding: 0,
                  margin: '0.75rem 0 0',
                  display: 'grid',
                  gap: '0.5rem',
                }}
              >
                {accounts.map((account) => (
                  <li key={account.id}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => choose(account)}
                      style={{ ...secondaryButtonStyle, width: '100%', textAlign: 'left' }}
                    >
                      {account.name}
                      <span style={{ color: color.muted }}> — {account.type}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )
          ) : null}
        </>
      ) : (
        <p style={{ color: color.muted, fontSize: '0.875rem', margin: 0 }}>
          Only the Owner can change this.
        </p>
      )}

      {error ? (
        <p style={{ color: color.danger, fontSize: '0.875rem', marginTop: '0.75rem' }}>{error}</p>
      ) : null}
    </section>
  );
}

function IncomeItemCard({
  connection,
  isOwner,
}: {
  connection: QuickBooksConnection;
  isOwner: boolean;
}) {
  const [items, setItems] = useState<Array<{ id: string; name: string }> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/quickbooks/income-item');
      const body = (await response.json()) as { items?: Array<{ id: string; name: string }>; error?: string };
      if (!response.ok) {
        setError(body.error ?? 'Could not read your QuickBooks items.');
      } else {
        setItems(body.items ?? []);
      }
    } catch {
      setError('Could not reach the server.');
    }
    setBusy(false);
  }

  async function choose(item: { id: string; name: string }) {
    setBusy(true);
    const response = await fetch('/api/quickbooks/income-item', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(item),
    });
    if (response.ok) {
      window.location.reload();
      return;
    }
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    setError(body.error ?? 'Could not save.');
    setBusy(false);
  }

  return (
    <section style={{ ...cardStyle, padding: '1.25rem' }}>
      <h2 style={h2Style}>Income item</h2>

      {connection.incomeItemName ? (
        <p style={{ color: color.body, fontSize: '0.875rem', margin: '0.5rem 0 1rem' }}>
          Invoices post against <strong>{connection.incomeItemName}</strong> in QuickBooks.
        </p>
      ) : (
        // ⚠️ The ruled copy: tell them to create it THERE. Never auto-create.
        <p style={{ color: color.warning, fontSize: '0.875rem', margin: '0.5rem 0 1rem' }}>
          QuickBooks needs a <strong>product or service</strong> to bill against, and none is chosen
          yet. Create one in QuickBooks (many contractors call it &ldquo;Construction Income&rdquo;),
          then pick it here. Invoices will wait until it is set — nothing is lost in the meantime.
        </p>
      )}

      {isOwner ? (
        <>
          <button type="button" onClick={load} disabled={busy} style={secondaryButtonStyle}>
            {busy ? 'Loading…' : connection.incomeItemName ? 'Change item' : 'Choose an item'}
          </button>

          {items !== null ? (
            items.length === 0 ? (
              <p style={{ color: color.muted, fontSize: '0.875rem', marginTop: '0.75rem' }}>
                No products or services were found in QuickBooks. Create one there, then try again.
              </p>
            ) : (
              <ul style={{ listStyle: 'none', padding: 0, margin: '0.75rem 0 0', display: 'grid', gap: '0.5rem' }}>
                {items.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => choose(item)}
                      style={{ ...secondaryButtonStyle, width: '100%', textAlign: 'left' }}
                    >
                      {item.name}
                    </button>
                  </li>
                ))}
              </ul>
            )
          ) : null}
        </>
      ) : null}

      {error ? <p style={{ color: color.danger, fontSize: '0.875rem', marginTop: '0.75rem' }}>{error}</p> : null}
    </section>
  );
}

/**
 * §5.1 onboarding copy — "no QuickBooks Payments" [RULED S103 Q10: NON-BLOCKING].
 *
 * ⚠️ THE COPY MUST NOT READ AS AN ERROR. Invoices still sync; there is simply
 * no pay-link. The ruling is explicit that this does not block anything.
 */
function PaymentsCard({ connection }: { connection: QuickBooksConnection }) {
  return (
    <section style={{ ...cardStyle, padding: '1.25rem' }}>
      <h2 style={h2Style}>Online payments</h2>
      {connection.paymentsEnabled ? (
        <p style={{ color: color.body, fontSize: '0.875rem', margin: '0.5rem 0 0' }}>
          QuickBooks Payments is active, so your invoices carry a <strong>Pay online</strong> link for
          your clients.
        </p>
      ) : (
        <p style={{ color: color.body, fontSize: '0.875rem', margin: '0.5rem 0 0' }}>
          Your QuickBooks company does not have QuickBooks Payments turned on, so invoices are sent
          without an online payment link. Everything else syncs normally. Turn Payments on in
          QuickBooks if you would like clients to pay online.
        </p>
      )}
      {/* THE DISCLOSURE — an Intuit commitment, not a nicety. §5.5 placement 2. */}
      <p style={{ color: color.muted, fontSize: '0.75rem', margin: '0.75rem 0 0' }}>
        Payment service provided by Intuit Payments Inc.
      </p>
    </section>
  );
}

/** §6 — what is waiting, what is stuck, and what needs an answer. */
function SyncStatusCard({ queue }: { queue: QueueSummary }) {
  return (
    <section style={{ ...cardStyle, padding: '1.25rem' }}>
      <h2 style={h2Style}>Sync status</h2>
      <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', margin: '0.75rem 0 0' }}>
        <Stat label="Waiting" value={queue.queued} />
        <Stat label="In progress" value={queue.inFlight} />
        <Stat label="Retrying" value={queue.failedTransient} />
        <Stat label="Needs attention" value={queue.failedTerminal} />
      </div>

      {queue.needsAttention.length === 0 ? (
        <p style={{ color: color.muted, fontSize: '0.875rem', margin: '1rem 0 0' }}>
          Nothing needs your attention.
        </p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: '1rem 0 0', display: 'grid', gap: '0.75rem' }}>
          {queue.needsAttention.map((item) => (
            <QueueRow key={item.id} item={item} />
          ))}
        </ul>
      )}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div style={{ ...monoStyle, fontSize: '1.5rem', color: color.navy }}>{value}</div>
      <div style={microLabelStyle}>{label}</div>
    </div>
  );
}

function QueueRow({ item }: { item: QueueItem }) {
  return (
    <li
      style={{
        ...cardStyle,
        padding: '0.875rem 1rem',
        backgroundColor: item.conflict ? color.rowTintAttention : color.rowTintProblem,
      }}
    >
      <div style={{ ...microLabelStyle, marginBottom: '0.25rem' }}>
        {item.entityType.replace(/_/g, ' ')} · {item.operation}
      </div>
      {item.conflict ? (
        <CustomerConflictPrompt item={item} />
      ) : (
        <p style={{ color: color.body, fontSize: '0.875rem', margin: 0 }}>{item.lastError}</p>
      )}
    </li>
  );
}

/**
 * §5.2 — the prompt itself. ASK, never auto-create a duplicate [S103].
 *
 * ⚠️ "CREATE A NEW ONE" REQUIRES A DIFFERENT NAME, and the field is not
 * optional politeness. QuickBooks enforces DisplayName uniqueness, so "create
 * another Acme Builders" is a request it cannot satisfy — a button without this
 * field would be a button that always fails.
 */
function CustomerConflictPrompt({ item }: { item: QueueItem }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState(`${item.conflict!.displayName} (2)`);
  const [showRename, setShowRename] = useState(false);

  async function answer(choice: 'link' | 'create_new') {
    setBusy(true);
    setError(null);
    const response = await fetch('/api/quickbooks/customer-conflict', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ queueRowId: item.id, choice, newDisplayName: newName }),
    });
    if (response.ok) {
      window.location.reload();
      return;
    }
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    setError(body.error ?? 'Could not save that choice.');
    setBusy(false);
  }

  return (
    <div>
      <p style={{ color: color.body, fontSize: '0.875rem', margin: '0 0 0.75rem' }}>
        {item.conflict!.sentence}
      </p>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <button type="button" disabled={busy} onClick={() => answer('link')} style={primaryButtonStyle}>
          Link to the existing customer
        </button>
        <button type="button" disabled={busy} onClick={() => setShowRename((v) => !v)} style={secondaryButtonStyle}>
          Create a new one
        </button>
      </div>

      {showRename ? (
        <div style={{ marginTop: '0.75rem' }}>
          <label style={microLabelStyle} htmlFor={`qb-newname-${item.id}`}>
            New QuickBooks name (must differ)
          </label>
          <input
            id={`qb-newname-${item.id}`}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            style={{
              width: '100%',
              maxWidth: '340px',
              padding: '0.5rem 0.75rem',
              border: `1px solid ${color.inputBorder}`,
              borderRadius: '8px',
              fontSize: '0.875rem',
              marginTop: '0.25rem',
            }}
          />
          <button
            type="button"
            disabled={busy || !newName.trim()}
            onClick={() => answer('create_new')}
            style={{ ...primaryButtonStyle, marginTop: '0.5rem' }}
          >
            Create in QuickBooks
          </button>
        </div>
      ) : null}

      {error ? <p style={{ color: color.danger, fontSize: '0.875rem', marginTop: '0.5rem' }}>{error}</p> : null}
    </div>
  );
}
