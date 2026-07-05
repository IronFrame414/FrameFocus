'use client';

import { useRef, useState } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import { CONSENT_TEXT } from '@/lib/proposal/proposal-defaults';

// 5D §6 — review + sign (draw or type) or decline (notes only) a change
// order. Adapted from the M4 signing client (locked D-4: same in-house
// capture); the CO summary renders inline instead of a proposal PDF.
// Credits show as negative row totals (D-2).

export interface CoSigningData {
  companyName: string;
  brandColor: string;
  projectName: string;
  projectNumber: string;
  coNumber: string;
  title: string;
  description: string | null;
  netDelta: number;
  lineItems: Array<{
    id: string;
    name: string;
    description: string | null;
    total: number;
    rows: Array<{ id: string; name: string; row_type: string; total: number }>;
  }>;
}

interface CoSigningClientProps {
  token: string;
  data: CoSigningData;
  recipientName: string | null;
}

type Outcome = 'signed' | 'declined' | null;

function money(value: number): string {
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

export function CoSigningClient({ token, data, recipientName }: CoSigningClientProps) {
  const accent = data.brandColor;
  const [signerName, setSignerName] = useState(recipientName ?? '');
  const [method, setMethod] = useState<'draw' | 'type'>('draw');
  const [typedSignature, setTypedSignature] = useState('');
  const [consent, setConsent] = useState(false);
  const [declineOpen, setDeclineOpen] = useState(false);
  const [declineNotes, setDeclineNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome>(null);
  const [drawDirty, setDrawDirty] = useState(false);
  const padRef = useRef<SignatureCanvas | null>(null);

  const signReady =
    signerName.trim().length > 0 &&
    consent &&
    (method === 'draw' ? drawDirty : typedSignature.trim().length > 0);

  function typedToDataUrl(name: string): string {
    const canvas = document.createElement('canvas');
    canvas.width = 600;
    canvas.height = 160;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#111827';
      ctx.font = '56px "Brush Script MT", "Segoe Script", "Snell Roundhand", cursive';
      ctx.textBaseline = 'middle';
      ctx.fillText(name, 24, 80);
    }
    return canvas.toDataURL('image/png');
  }

  async function handleSign() {
    setError(null);
    let signatureData: string;
    if (method === 'draw') {
      const pad = padRef.current;
      if (!pad || pad.isEmpty()) {
        setError('Please draw your signature first.');
        return;
      }
      signatureData = pad.getTrimmedCanvas().toDataURL('image/png');
    } else {
      signatureData = typedToDataUrl(typedSignature.trim());
    }

    setBusy(true);
    try {
      const res = await fetch(`/api/sign-co/${token}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signature_type: method,
          signature_data: signatureData,
          signer_name: signerName.trim(),
          consent_given: true,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || 'Something went wrong. Please try again.');
      } else {
        setOutcome('signed');
      }
    } catch {
      setError('Network error — please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function handleDecline() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/sign-co/${token}/decline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          decline_notes: declineNotes.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || 'Something went wrong. Please try again.');
      } else {
        setOutcome('declined');
      }
    } catch {
      setError('Network error — please try again.');
    } finally {
      setBusy(false);
    }
  }

  const pageStyle: React.CSSProperties = {
    minHeight: '100vh',
    backgroundColor: '#f3f4f6',
    fontFamily: 'Helvetica, Arial, sans-serif',
    padding: '1rem',
  };
  const cardStyle: React.CSSProperties = {
    backgroundColor: '#fff',
    borderRadius: '0.5rem',
    padding: 'clamp(1.25rem, 4vw, 2.5rem)',
    maxWidth: '760px',
    margin: '0 auto 1rem',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
  };
  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '0.625rem 0.75rem',
    border: '1px solid #d1d5db',
    borderRadius: '0.375rem',
    fontSize: '1rem',
    boxSizing: 'border-box',
  };

  if (outcome === 'signed') {
    return (
      <div style={pageStyle}>
        <div style={{ ...cardStyle, textAlign: 'center', marginTop: '10vh', maxWidth: '460px' }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>✓</div>
          <h1 style={{ fontSize: '1.25rem', margin: '0 0 0.75rem' }}>Thank you!</h1>
          <p style={{ fontSize: '0.9375rem', color: '#6b7280' }}>
            Change order {data.coNumber} is signed. {data.companyName} has your signed copy on
            file and will be in touch shortly.
          </p>
        </div>
      </div>
    );
  }

  if (outcome === 'declined') {
    return (
      <div style={pageStyle}>
        <div style={{ ...cardStyle, textAlign: 'center', marginTop: '10vh', maxWidth: '460px' }}>
          <h1 style={{ fontSize: '1.25rem', margin: '0 0 0.75rem' }}>Change order declined</h1>
          <p style={{ fontSize: '0.9375rem', color: '#6b7280' }}>
            {data.companyName} has been notified. Thank you for letting them know.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={pageStyle}>
      {/* Change order summary */}
      <div style={cardStyle}>
        <p style={{ fontSize: '0.8125rem', color: '#6b7280', margin: '0 0 0.25rem' }}>
          {data.companyName} · Project {data.projectNumber} — {data.projectName}
        </p>
        <h1 style={{ fontSize: '1.375rem', margin: '0 0 0.25rem', color: accent }}>
          Change Order {data.coNumber}
        </h1>
        <p style={{ fontSize: '1rem', fontWeight: 600, margin: '0 0 0.75rem' }}>{data.title}</p>
        {data.description && (
          <p style={{ fontSize: '0.875rem', color: '#374151', margin: '0 0 1rem' }}>
            {data.description}
          </p>
        )}

        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '0.5rem' }}>
          <tbody>
            {data.lineItems.map((item) => (
              <LineItemRows key={item.id} item={item} />
            ))}
            <tr style={{ borderTop: '2px solid #e5e7eb' }}>
              <td style={{ padding: '0.625rem 0.5rem', fontWeight: 700, fontSize: '0.9375rem' }}>
                Net change to contract
              </td>
              <td
                style={{
                  padding: '0.625rem 0.5rem',
                  textAlign: 'right',
                  fontWeight: 700,
                  fontSize: '0.9375rem',
                  color: data.netDelta < 0 ? '#166534' : undefined,
                }}
              >
                {money(data.netDelta)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Action area */}
      <div style={cardStyle}>
        <h2 style={{ fontSize: '1.125rem', margin: '0 0 1rem', color: accent }}>
          Accept &amp; Sign
        </h2>

        <label
          style={{
            display: 'block',
            fontSize: '0.875rem',
            fontWeight: 600,
            marginBottom: '0.25rem',
          }}
        >
          Your full name
        </label>
        <input
          value={signerName}
          onChange={(e) => setSignerName(e.target.value)}
          placeholder="Full name"
          style={{ ...inputStyle, marginBottom: '1rem', maxWidth: '360px' }}
        />

        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
          {(['draw', 'type'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMethod(m)}
              style={{
                padding: '0.5rem 1.25rem',
                fontSize: '0.875rem',
                fontWeight: 600,
                borderRadius: '0.375rem',
                border: `1px solid ${method === m ? accent : '#d1d5db'}`,
                backgroundColor: method === m ? accent : '#fff',
                color: method === m ? '#fff' : '#374151',
                cursor: 'pointer',
              }}
            >
              {m === 'draw' ? 'Draw' : 'Type'}
            </button>
          ))}
        </div>

        {method === 'draw' ? (
          <div style={{ marginBottom: '1rem' }}>
            <div
              style={{
                border: '1px dashed #9ca3af',
                borderRadius: '0.375rem',
                backgroundColor: '#fafafa',
                touchAction: 'none',
              }}
            >
              <SignatureCanvas
                ref={padRef}
                penColor="#111827"
                onEnd={() => setDrawDirty(true)}
                canvasProps={{
                  style: { width: '100%', height: '160px', display: 'block' },
                }}
              />
            </div>
            <button
              type="button"
              onClick={() => {
                padRef.current?.clear();
                setDrawDirty(false);
              }}
              style={{
                marginTop: '0.5rem',
                padding: '0.375rem 0.875rem',
                fontSize: '0.8125rem',
                backgroundColor: '#f3f4f6',
                border: '1px solid #d1d5db',
                borderRadius: '0.375rem',
                cursor: 'pointer',
              }}
            >
              Clear
            </button>
          </div>
        ) : (
          <div style={{ marginBottom: '1rem' }}>
            <input
              value={typedSignature}
              onChange={(e) => setTypedSignature(e.target.value)}
              placeholder="Type your name"
              style={{ ...inputStyle, maxWidth: '360px', marginBottom: '0.5rem' }}
            />
            {typedSignature.trim() && (
              <div
                style={{
                  fontFamily: '"Brush Script MT", "Segoe Script", "Snell Roundhand", cursive',
                  fontSize: '2.25rem',
                  padding: '0.5rem 1rem',
                  border: '1px dashed #9ca3af',
                  borderRadius: '0.375rem',
                  backgroundColor: '#fafafa',
                  display: 'inline-block',
                  minWidth: '240px',
                }}
              >
                {typedSignature.trim()}
              </div>
            )}
          </div>
        )}

        <label
          style={{
            display: 'flex',
            gap: '0.625rem',
            alignItems: 'flex-start',
            fontSize: '0.8125rem',
            color: '#374151',
            marginBottom: '1.25rem',
            cursor: 'pointer',
          }}
        >
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            style={{ marginTop: '0.125rem' }}
          />
          <span>{CONSENT_TEXT}</span>
        </label>

        {error && (
          <div
            style={{
              padding: '0.75rem 1rem',
              borderRadius: '0.375rem',
              marginBottom: '1rem',
              backgroundColor: '#fef2f2',
              color: '#991b1b',
              fontSize: '0.875rem',
            }}
          >
            {error}
          </div>
        )}

        <button
          type="button"
          onClick={handleSign}
          disabled={!signReady || busy}
          style={{
            padding: '0.75rem 2rem',
            fontSize: '1rem',
            fontWeight: 700,
            color: '#fff',
            backgroundColor: !signReady || busy ? '#9ca3af' : accent,
            border: 'none',
            borderRadius: '0.375rem',
            cursor: !signReady || busy ? 'not-allowed' : 'pointer',
            width: '100%',
            maxWidth: '360px',
          }}
        >
          {busy ? 'Submitting…' : 'Sign Change Order'}
        </button>

        {/* Decline */}
        <div style={{ marginTop: '1.5rem', borderTop: '1px solid #e5e7eb', paddingTop: '1rem' }}>
          {!declineOpen ? (
            <button
              type="button"
              onClick={() => setDeclineOpen(true)}
              style={{
                background: 'none',
                border: 'none',
                color: '#6b7280',
                fontSize: '0.875rem',
                textDecoration: 'underline',
                cursor: 'pointer',
                padding: 0,
              }}
            >
              Decline this change order
            </button>
          ) : (
            <div>
              <textarea
                value={declineNotes}
                onChange={(e) => setDeclineNotes(e.target.value)}
                rows={3}
                maxLength={2000}
                placeholder="Anything you'd like to add? (optional)"
                style={{ ...inputStyle, marginBottom: '0.75rem' }}
              />
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button
                  type="button"
                  onClick={handleDecline}
                  disabled={busy}
                  style={{
                    padding: '0.5rem 1.25rem',
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    color: '#fff',
                    backgroundColor: busy ? '#9ca3af' : '#dc2626',
                    border: 'none',
                    borderRadius: '0.375rem',
                    cursor: busy ? 'not-allowed' : 'pointer',
                  }}
                >
                  Confirm Decline
                </button>
                <button
                  type="button"
                  onClick={() => setDeclineOpen(false)}
                  style={{
                    padding: '0.5rem 1.25rem',
                    fontSize: '0.875rem',
                    backgroundColor: '#f3f4f6',
                    border: '1px solid #d1d5db',
                    borderRadius: '0.375rem',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const ROW_TYPE_LABELS: Record<string, string> = {
  labor: 'Labor',
  material: 'Material',
  subcontractor: 'Subcontractor',
  other: 'Other',
};

function LineItemRows({ item }: { item: CoSigningData['lineItems'][number] }) {
  return (
    <>
      <tr style={{ backgroundColor: '#f9fafb', borderTop: '1px solid #e5e7eb' }}>
        <td style={{ padding: '0.5rem', fontWeight: 600, fontSize: '0.875rem' }}>
          {item.name}
          {item.description && (
            <span style={{ fontWeight: 400, color: '#6b7280' }}> — {item.description}</span>
          )}
        </td>
        <td
          style={{
            padding: '0.5rem',
            textAlign: 'right',
            fontWeight: 600,
            fontSize: '0.875rem',
            color: item.total < 0 ? '#166534' : undefined,
          }}
        >
          {money(item.total)}
        </td>
      </tr>
      {item.rows.map((row) => (
        <tr key={row.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
          <td style={{ padding: '0.375rem 0.5rem 0.375rem 1.5rem', fontSize: '0.8125rem' }}>
            {row.name}
            <span style={{ color: '#9ca3af', fontSize: '0.75rem' }}>
              {' '}
              · {ROW_TYPE_LABELS[row.row_type] ?? row.row_type}
            </span>
          </td>
          <td
            style={{
              padding: '0.375rem 0.5rem',
              textAlign: 'right',
              fontSize: '0.8125rem',
              color: row.total < 0 ? '#166534' : '#374151',
            }}
          >
            {money(row.total)}
          </td>
        </tr>
      ))}
    </>
  );
}
