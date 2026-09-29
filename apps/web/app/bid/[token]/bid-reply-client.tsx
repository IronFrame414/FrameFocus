'use client';

// The sub's reply form (19c "a link they fill in"). No auth — the token in the
// URL is the credential, and get/submit are SECURITY DEFINER RPCs keyed on it,
// so a sub only ever reaches their own request. Amount, labor/material split,
// exclusions and how long the bid holds go straight to submit_sub_bid_reply,
// which lands them as a comparable estimate_sub_bids row with no retyping.

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase-browser';
import { font } from '@/lib/theme';

export interface BidRequestView {
  token: string;
  status: string;
  reply_mode: string;
  expires_at: string;
  is_expired: boolean;
  scope_text: string | null;
  message: string | null;
  allowance_amount: number | null;
  bids_due_date: string | null;
  work_starts_date: string | null;
  site_visit_date: string | null;
  company_name: string | null;
  subcontractor_name: string | null;
  line_item_name: string | null;
  estimate_name: string | null;
  estimate_number: string | null;
  submitted_at: string | null;
  reply_bid_amount: number | null;
  reply_labor_amount: number | null;
  reply_material_amount: number | null;
  reply_scope_coverage_percent: number | null;
  reply_exclusions: string | null;
  reply_holds_until: string | null;
}

const money = (n: number | null) =>
  n == null ? '—' : n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

const card: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e4e8ef',
  borderRadius: '14px',
  padding: '22px 24px',
  maxWidth: '560px',
  width: '100%',
  boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
};
const label: React.CSSProperties = { display: 'block', fontSize: '0.78rem', color: '#5b6472', marginBottom: '0.25rem', fontWeight: 600 };
const input: React.CSSProperties = { width: '100%', padding: '0.55rem 0.7rem', border: '1px solid #d5dae4', borderRadius: '8px', fontSize: '0.9rem', fontFamily: font.mono };

// [S118 item 5, #169] THE SCOPE DOCUMENTS STAFF SHARED WITH BIDDERS. The route
// (GET /api/bid/[token]/files) serves ONLY files tagged bid-scope and staff-
// uploaded, and refuses a closed or expired token (bid_token_state) — the list
// here is whatever it returns, nothing more. Its URLs live 300 s, so a click
// re-fetches the list and opens a fresh one rather than a stale link.
interface BidDoc {
  id: string;
  file_name: string;
  file_size: number | null;
  mime_type: string | null;
  url: string | null;
}

const kb = (n: number | null) => (n == null ? '' : n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

function BidDocuments({ token }: { token: string }) {
  const [docs, setDocs] = useState<BidDoc[] | null>(null);
  const [failed, setFailed] = useState(false);

  async function load(): Promise<BidDoc[] | null> {
    const res = await fetch(`/api/bid/${token}/files`, { cache: 'no-store' });
    if (!res.ok) return null;
    const body = (await res.json()) as { files?: BidDoc[] };
    return body.files ?? [];
  }

  useEffect(() => {
    let live = true;
    void load().then((d) => {
      if (!live) return;
      if (d === null) setFailed(true);
      else setDocs(d);
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function open(id: string) {
    const fresh = await load();
    const url = fresh?.find((d) => d.id === id)?.url;
    if (url) window.open(url, '_blank', 'noopener');
    else setFailed(true);
  }

  if (docs === null && !failed) return null;
  if (docs !== null && docs.length === 0) return null;
  return (
    <div data-testid="bid-docs" style={{ background: '#f8fafc', border: '1px solid #e4e8ef', borderRadius: '10px', padding: '12px 14px', marginBottom: '1rem' }}>
      <div style={label}>Scope documents</div>
      {failed && <div style={{ fontSize: '0.8rem', color: '#c0362c' }}>The documents could not be loaded. Refresh the page to try again.</div>}
      {(docs ?? []).map((d) => (
        <div key={d.id} data-testid="bid-doc" style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', fontSize: '0.85rem', padding: '3px 0' }}>
          <button type="button" onClick={() => void open(d.id)} style={{ background: 'none', border: 'none', padding: 0, color: '#2f49d1', cursor: 'pointer', textAlign: 'left', fontSize: '0.85rem' }}>
            {d.file_name}
          </button>
          <span style={{ color: '#5b6472', whiteSpace: 'nowrap' }}>{kb(d.file_size)}</span>
        </div>
      ))}
    </div>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', background: '#f3f4f6', padding: '2.5rem 1rem' }}>
      {children}
    </div>
  );
}

export function BidReplyClient({ request }: { request: BidRequestView }) {
  const expired = request.is_expired || request.status === 'expired';
  const closed = request.status === 'cancelled' || request.status === 'declined';
  const [done, setDone] = useState(request.status === 'submitted');

  const [bid, setBid] = useState('');
  const [labor, setLabor] = useState('');
  const [material, setMaterial] = useState('');
  const [coverage, setCoverage] = useState('');
  const [exclusions, setExclusions] = useState('');
  const [holds, setHolds] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // S106 Part C — the sub can attach a file (plan, quote) to their bid; it lands on the
  // estimate's files via the anonymous token route.
  const [attaching, setAttaching] = useState(false);
  const [attached, setAttached] = useState<string[]>([]);

  async function submit() {
    if (bid === '' || Number(bid) < 0) {
      setError('Enter a bid amount of zero or more.');
      return;
    }
    setBusy(true);
    setError(null);
    const { error: rpcError } = await createClient().rpc('submit_sub_bid_reply', {
      p_token: request.token,
      p_bid_amount: Number(bid),
      p_labor_amount: labor === '' ? null : Number(labor),
      p_material_amount: material === '' ? null : Number(material),
      p_scope_coverage_percent: coverage === '' ? null : Number(coverage),
      p_exclusions: exclusions.trim() || null,
      p_holds_until: holds || null,
    });
    setBusy(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    setDone(true);
  }

  async function attachFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 25 * 1024 * 1024) {
      setError('File too large. Max size is 25 MB.');
      return;
    }
    setAttaching(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(`/api/bid/${request.token}/files`, { method: 'POST', body: form });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? 'Upload failed.');
        return;
      }
      setAttached((prev) => [...prev, file.name]);
    } catch {
      setError('Upload failed.');
    } finally {
      setAttaching(false);
    }
  }

  const header = (
    <div style={{ marginBottom: '1.25rem' }}>
      <div style={{ fontSize: '0.72rem', color: '#7b8699', textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: font.mono }}>
        Bid request{request.estimate_number ? ` · ${request.estimate_number}` : ''}
      </div>
      <h1 style={{ fontSize: '1.3rem', margin: '0.35rem 0 0.15rem' }}>
        {request.line_item_name || request.estimate_name || 'Scope of work'}
      </h1>
      <div style={{ fontSize: '0.85rem', color: '#5b6472' }}>
        {request.company_name ? `From ${request.company_name}` : ''}
        {request.subcontractor_name ? ` · for ${request.subcontractor_name}` : ''}
      </div>
    </div>
  );

  if (done) {
    return (
      <Frame>
        <div style={{ ...card, textAlign: 'center' }}>
          <div style={{ fontSize: '2rem' }}>✓</div>
          <h1 style={{ fontSize: '1.2rem', margin: '0.5rem 0' }}>Bid submitted</h1>
          <p style={{ fontSize: '0.9rem', color: '#5b6472', margin: 0 }}>
            Thanks — {request.company_name || 'the contractor'} has your bid. You can close this page.
          </p>
        </div>
      </Frame>
    );
  }

  if (expired || closed) {
    return (
      <Frame>
        <div style={{ ...card, textAlign: 'center' }}>
          <h1 style={{ fontSize: '1.2rem', margin: '0 0 0.5rem' }}>
            {expired ? 'This bid link has expired' : 'This request is no longer open'}
          </h1>
          <p style={{ fontSize: '0.9rem', color: '#5b6472', margin: 0 }}>
            Please contact {request.company_name || 'the contractor'} for a new link.
          </p>
        </div>
      </Frame>
    );
  }

  return (
    <Frame>
      <div style={card}>
        {header}

        {request.scope_text && (
          <div style={{ background: '#f8fafc', border: '1px solid #e4e8ef', borderRadius: '10px', padding: '12px 14px', marginBottom: '1rem' }}>
            <div style={label}>Scope</div>
            <div style={{ fontSize: '0.85rem', color: '#3f4a60', whiteSpace: 'pre-wrap' }}>{request.scope_text}</div>
          </div>
        )}
        {request.message && (
          <p style={{ fontSize: '0.85rem', color: '#5b6472', marginTop: 0 }}>{request.message}</p>
        )}
        {/* [S118 item 5] Only while open — the expired/closed card above returns first. */}
        <BidDocuments token={request.token} />
        <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap', fontSize: '0.8rem', color: '#5b6472', marginBottom: '1.25rem' }}>
          {request.allowance_amount != null && (
            <span>Allowance carried <strong style={{ fontFamily: font.mono, color: '#0f1729' }}>{money(request.allowance_amount)}</strong></span>
          )}
          {request.bids_due_date && <span>Bids due <strong>{request.bids_due_date}</strong></span>}
          {request.work_starts_date && <span>Work starts <strong>{request.work_starts_date}</strong></span>}
          {request.site_visit_date && <span>Site visit <strong>{request.site_visit_date}</strong></span>}
        </div>

        {error && (
          <div style={{ background: '#fdf1f0', color: '#c0362c', borderRadius: '8px', padding: '0.6rem 0.8rem', fontSize: '0.85rem', marginBottom: '1rem' }}>
            {error}
          </div>
        )}

        <div style={{ marginBottom: '0.9rem' }}>
          <label style={label}>Your bid *</label>
          <input style={input} type="number" min="0" step="0.01" value={bid} onChange={(e) => setBid(e.target.value)} placeholder="0.00" />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.9rem' }}>
          <div>
            <label style={label}>Labor portion</label>
            <input style={input} type="number" min="0" step="0.01" value={labor} onChange={(e) => setLabor(e.target.value)} placeholder="optional" />
          </div>
          <div>
            <label style={label}>Material portion</label>
            <input style={input} type="number" min="0" step="0.01" value={material} onChange={(e) => setMaterial(e.target.value)} placeholder="optional" />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.9rem' }}>
          <div>
            <label style={label}>Scope covered (%)</label>
            <input style={input} type="number" min="0" max="100" step="1" value={coverage} onChange={(e) => setCoverage(e.target.value)} placeholder="e.g. 100" />
          </div>
          <div>
            <label style={label}>Bid holds until</label>
            <input style={input} type="date" value={holds} onChange={(e) => setHolds(e.target.value)} />
          </div>
        </div>
        <div style={{ marginBottom: '1.25rem' }}>
          <label style={label}>Exclusions</label>
          <textarea
            style={{ ...input, fontFamily: 'inherit', resize: 'vertical' }}
            rows={3}
            value={exclusions}
            onChange={(e) => setExclusions(e.target.value)}
            placeholder="Anything your bid does not include"
          />
        </div>

        {/* S106 Part C — attach a plan or quote; it lands on the estimate's files. */}
        <div style={{ marginBottom: '0.75rem' }}>
          <label style={{ display: 'block', fontSize: '0.8rem', color: '#6b7280', marginBottom: '0.35rem' }}>
            Attach a file (optional — PDF or image, max 25 MB)
          </label>
          <input
            type="file"
            accept="application/pdf,image/jpeg,image/png,image/heic,image/heif"
            disabled={attaching}
            onChange={attachFile}
            style={{ fontSize: '0.85rem' }}
          />
          {attaching && <p style={{ fontSize: '0.8rem', color: '#6b7280', margin: '0.25rem 0 0' }}>Uploading…</p>}
          {attached.length > 0 && (
            <ul style={{ margin: '0.35rem 0 0', paddingLeft: '1.1rem', fontSize: '0.8rem', color: '#1f8f4e' }}>
              {attached.map((n, i) => (
                <li key={i}>{n} — attached</li>
              ))}
            </ul>
          )}
        </div>

        <button
          type="button"
          disabled={busy}
          onClick={submit}
          style={{
            width: '100%',
            padding: '0.7rem',
            borderRadius: '9px',
            border: 'none',
            background: busy ? '#9aa4b8' : '#3b4ae0',
            color: '#fff',
            fontSize: '0.95rem',
            fontWeight: 700,
            cursor: busy ? 'not-allowed' : 'pointer',
          }}
        >
          {busy ? 'Submitting…' : 'Submit bid'}
        </button>
      </div>
    </Frame>
  );
}
