'use client';

import { useEffect, useState } from 'react';
import {
  EmailLog,
  SigningSession,
  getSignedProposalUrl,
  listEmailLogs,
  listSigningSessions,
} from '@/lib/services/signing-activity-client';
import { updateReminderSchedule } from '@/lib/services/estimates-client';
import { getProposalEmailDefaults } from '@/lib/services/company-client';
import {
  DEFAULT_PROPOSAL_BODY,
  DEFAULT_PROPOSAL_SUBJECT,
} from '@/lib/proposal/proposal-defaults';
import { SendProposalModal } from '../send-proposal-modal';
import type { TabProps } from './estimate-builder';

// Spec 2 — Details-tab extensions: signing activity (sessions +
// email delivery from email_logs, read-only), signed PDF download,
// Resend Proposal (F10), and the per-estimate reminder opt-out
// (J5). Owner/Admin only — RLS returns nothing for other roles, and
// the component is only rendered for managers.

const SESSION_STATUS_LABELS: Record<SigningSession['status'], string> = {
  pending: 'Awaiting signature',
  completed: 'Signed',
  declined: 'Declined',
  expired: 'Expired',
  invalidated: 'Link replaced',
};

export function SigningActivity({ data, reload }: Pick<TabProps, 'data' | 'reload'>) {
  const { estimate } = data;
  const [sessions, setSessions] = useState<SigningSession[]>([]);
  const [emails, setEmails] = useState<EmailLog[]>([]);
  const [resendOpen, setResendOpen] = useState(false);
  const [emailDefaults, setEmailDefaults] = useState<{ subject: string | null; body: string | null }>(
    { subject: null, body: null }
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    listSigningSessions(estimate.id).then(setSessions);
    listEmailLogs(estimate.id).then(setEmails);
    getProposalEmailDefaults().then(setEmailDefaults);
  }, [estimate.id]);

  async function refreshActivity() {
    setSessions(await listSigningSessions(estimate.id));
    setEmails(await listEmailLogs(estimate.id));
    await reload();
  }

  async function handleSignedDownload() {
    if (!estimate.signed_proposal_file_id) return;
    setBusy(true);
    const { url, error: urlError } = await getSignedProposalUrl(
      estimate.signed_proposal_file_id
    );
    setBusy(false);
    if (!url) {
      setError(urlError || 'Could not create the download link');
      return;
    }
    window.location.href = url;
  }

  const remindersOff =
    Array.isArray(estimate.reminder_schedule) &&
    (estimate.reminder_schedule as number[]).length === 0;

  async function toggleReminders() {
    setBusy(true);
    setError(null);
    const result = await updateReminderSchedule(estimate.id, remindersOff ? null : []);
    setBusy(false);
    if (!result.success) {
      setError(result.error || 'Could not update reminders');
      return;
    }
    await reload();
  }

  const sectionTitle: React.CSSProperties = {
    fontSize: '1rem',
    fontWeight: 600,
    marginBottom: '0.75rem',
    paddingBottom: '0.375rem',
    borderBottom: '1px solid #e5e7eb',
  };
  const cellStyle: React.CSSProperties = {
    padding: '0.375rem 0.5rem',
    fontSize: '0.8125rem',
    borderBottom: '1px solid #f3f4f6',
    textAlign: 'left',
  };
  const smallButton: React.CSSProperties = {
    padding: '0.375rem 0.875rem',
    fontSize: '0.8125rem',
    backgroundColor: '#f3f4f6',
    border: '1px solid #d1d5db',
    borderRadius: '0.375rem',
    cursor: 'pointer',
  };

  const showSection =
    ['sent', 'accepted', 'declined', 'expired'].includes(estimate.status) ||
    sessions.length > 0 ||
    emails.length > 0;

  if (!showSection) return null;

  return (
    <div style={{ marginTop: '2rem', maxWidth: '720px' }}>
      <div style={sectionTitle}>Proposal Activity</div>

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

      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        {estimate.status === 'sent' && (
          <button
            type="button"
            onClick={() => setResendOpen(true)}
            disabled={busy}
            style={{ ...smallButton, backgroundColor: '#2563eb', borderColor: '#2563eb', color: '#fff' }}
          >
            Resend Proposal
          </button>
        )}
        {estimate.signed_proposal_file_id && (
          <button type="button" onClick={handleSignedDownload} disabled={busy} style={smallButton}>
            Download Signed Proposal
          </button>
        )}
        {(estimate.status === 'sent' || remindersOff) && (
          <button type="button" onClick={toggleReminders} disabled={busy} style={smallButton}>
            {remindersOff ? 'Re-enable reminders' : 'Turn off reminders for this estimate'}
          </button>
        )}
      </div>

      {sessions.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '1rem' }}>
          <thead>
            <tr style={{ fontSize: '0.6875rem', color: '#6b7280' }}>
              <th style={cellStyle}>Signing link</th>
              <th style={cellStyle}>Recipient</th>
              <th style={cellStyle}>Created</th>
              <th style={cellStyle}>Outcome</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((s) => (
              <tr key={s.id}>
                <td style={cellStyle}>{SESSION_STATUS_LABELS[s.status]}</td>
                <td style={cellStyle}>{s.recipient_email}</td>
                <td style={cellStyle}>{new Date(s.created_at).toLocaleString()}</td>
                <td style={cellStyle}>
                  {s.status === 'completed' && s.signed_at
                    ? `Signed by ${s.signer_name ?? s.recipient_name ?? '—'} on ${new Date(s.signed_at).toLocaleString()}`
                    : s.status === 'declined' && s.declined_at
                      ? `Declined (${s.decline_reason?.replace(/_/g, ' ') ?? '—'})`
                      : `Expires ${new Date(s.expires_at).toLocaleDateString()}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {emails.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ fontSize: '0.6875rem', color: '#6b7280' }}>
              <th style={cellStyle}>Email</th>
              <th style={cellStyle}>To</th>
              <th style={cellStyle}>Sent</th>
              <th style={cellStyle}>Delivery</th>
            </tr>
          </thead>
          <tbody>
            {emails.map((e) => (
              <tr key={e.id}>
                <td style={cellStyle}>{e.email_type.replace(/_/g, ' ')}</td>
                <td style={cellStyle}>{e.recipient_email}</td>
                <td style={cellStyle}>{new Date(e.sent_at).toLocaleString()}</td>
                <td style={cellStyle}>{e.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {resendOpen && (
        <SendProposalModal
          estimateId={estimate.id}
          mode="resend"
          recipientEmail={sessions[0]?.recipient_email ?? null}
          defaultSubject={emailDefaults.subject || DEFAULT_PROPOSAL_SUBJECT}
          defaultBody={emailDefaults.body || DEFAULT_PROPOSAL_BODY}
          onClose={() => setResendOpen(false)}
          onSent={async () => {
            setResendOpen(false);
            await refreshActivity();
          }}
        />
      )}
    </div>
  );
}
