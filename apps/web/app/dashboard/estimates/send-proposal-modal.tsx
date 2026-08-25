'use client';

import { useState } from 'react';
import { TEMPLATE_VARIABLES } from '@/lib/proposal/proposal-defaults';

// Spec 2 (4E E5/E6, 4F F10) — email editor modal used by "Send
// Proposal" (preview page), "Send to Client" / "Approve & Send"
// (builder, S173 Job 1), and "Resend Proposal" (builder, status =
// sent). Pre-filled from company defaults (or hardcoded fallbacks);
// {{variables}} are replaced server-side at send time. The
// recipient is the contact's email and is shown, not editable.

interface SendProposalModalProps {
  estimateId: string;
  mode: 'send' | 'resend';
  recipientEmail: string | null;
  defaultSubject: string;
  defaultBody: string;
  onClose: () => void;
  onSent: () => void;
}

export function SendProposalModal({
  estimateId,
  mode,
  recipientEmail,
  defaultSubject,
  defaultBody,
  onClose,
  onSent,
}: SendProposalModalProps) {
  const [subject, setSubject] = useState(defaultSubject);
  const [body, setBody] = useState(defaultBody);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSend() {
    setError(null);
    if (!subject.trim() || !body.trim()) {
      setError('Subject and body are required.');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/proposals/${mode === 'send' ? 'send' : 'resend'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          estimate_id: estimateId,
          subject: subject.trim(),
          body: body.trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || 'Send failed');
      } else {
        onSent();
      }
    } catch {
      setError('Network error — please try again.');
    } finally {
      setBusy(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '0.5rem 0.75rem',
    border: '1px solid #d1d5db',
    borderRadius: '0.375rem',
    fontSize: '0.875rem',
    boxSizing: 'border-box',
  };
  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '0.875rem',
    fontWeight: 500,
    marginBottom: '0.25rem',
    color: '#374151',
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 50,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: '#fff',
          borderRadius: '0.5rem',
          padding: '1.5rem',
          width: '100%',
          maxWidth: '560px',
          maxHeight: '90vh',
          overflowY: 'auto',
        }}
      >
        <h2 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '0.25rem' }}>
          {mode === 'send' ? 'Send Proposal' : 'Resend Proposal'}
        </h2>
        <p style={{ fontSize: '0.8125rem', color: '#6b7280', marginBottom: '1rem' }}>
          To: <strong>{recipientEmail ?? 'No email on the contact record'}</strong>
          {mode === 'resend' && ' — the previous signing link will stop working.'}
        </p>

        <div style={{ marginBottom: '1rem' }}>
          <label style={labelStyle}>Subject</label>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            maxLength={200}
            style={inputStyle}
          />
        </div>

        <div style={{ marginBottom: '0.5rem' }}>
          <label style={labelStyle}>Message</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={10}
            maxLength={5000}
            style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
          />
        </div>

        <div style={{ marginBottom: '1.25rem' }}>
          <span style={{ fontSize: '0.6875rem', color: '#6b7280' }}>Available variables: </span>
          {TEMPLATE_VARIABLES.map((v) => (
            <code
              key={v}
              style={{
                display: 'inline-block',
                fontSize: '0.6875rem',
                backgroundColor: '#f3f4f6',
                borderRadius: '0.25rem',
                padding: '0.0625rem 0.375rem',
                margin: '0.125rem 0.25rem 0 0',
              }}
            >
              {v}
            </code>
          ))}
        </div>

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

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            style={{
              padding: '0.5rem 1rem',
              fontSize: '0.875rem',
              backgroundColor: '#f3f4f6',
              border: '1px solid #d1d5db',
              borderRadius: '0.375rem',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSend}
            disabled={busy || !recipientEmail}
            style={{
              padding: '0.5rem 1.25rem',
              fontSize: '0.875rem',
              fontWeight: 600,
              color: '#fff',
              backgroundColor: busy || !recipientEmail ? '#9ca3af' : '#2563eb',
              border: 'none',
              borderRadius: '0.375rem',
              cursor: busy || !recipientEmail ? 'not-allowed' : 'pointer',
            }}
          >
            {busy ? 'Sending…' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );
}
