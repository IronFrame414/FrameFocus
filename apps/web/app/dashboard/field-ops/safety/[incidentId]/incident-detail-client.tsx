'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { INCIDENT_STATUSES, INCIDENT_STATUS_LABELS, type IncidentStatus } from '@framefocus/shared';
import {
  generateIncidentPdf,
  retryIncidentNotifications,
  setIncidentResolution,
  softDeleteIncident,
} from '@/lib/services/safety-client';
import { getFileSignedUrl } from '@/lib/services/daily-logs-client';

// 6C detail — client pieces: Owner/Admin resolution card (status/outcome,
// §2 [S87]), the Owner/Admin retry banner for failed notifications (§4 /
// Q6), PDF download/generate, and Owner/Admin delete.

export function ResolutionCard({
  incidentId,
  status,
  outcome,
  canEdit,
}: {
  incidentId: string;
  status: IncidentStatus;
  outcome: string | null;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [draftStatus, setDraftStatus] = useState<IncidentStatus>(status);
  const [draftOutcome, setDraftOutcome] = useState(outcome ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setBusy(true);
    setError(null);
    const result = await setIncidentResolution(
      incidentId,
      draftStatus,
      draftOutcome.trim() || null
    );
    if (!result.success) setError(result.error ?? 'Save failed');
    else {
      await generateIncidentPdf(incidentId); // resolution belongs on the record
      router.refresh();
    }
    setBusy(false);
  }

  if (!canEdit) {
    return (
      <div className="rounded-[13px] border border-[#e6e9ef] bg-white p-[18px]">
        <div className="mb-2 text-[13px] font-bold uppercase text-[#14213d]">Resolution</div>
        <div className="text-[13px] text-[#374151]">
          Status: <strong>{INCIDENT_STATUS_LABELS[status]}</strong>
        </div>
        <div className={outcome ? 'mt-1 text-[13px] text-[#374151]' : 'mt-1 text-[13px] text-[#9aa1ac]'}>
          {outcome || 'No outcome recorded yet.'}
        </div>
        <p className="mt-2 text-[11px] text-[#9aa1ac]">Owner/Admin close out incidents.</p>
      </div>
    );
  }

  return (
    <div className="rounded-[13px] border border-[#e6e9ef] bg-white p-[18px]">
      <div className="mb-2 text-[13px] font-bold uppercase text-[#14213d]">
        Resolution{' '}
        <span className="text-[11px] font-medium normal-case text-[#9aa1ac]">· Owner/Admin</span>
      </div>
      <select
        className="w-full rounded-[9px] border border-[#e0e4ea] px-3 py-[9px] text-[13px] text-[#14213d] outline-none focus:border-[#2f49d1]"
        value={draftStatus}
        onChange={(e) => setDraftStatus(e.target.value as IncidentStatus)}
      >
        {INCIDENT_STATUSES.map((s) => (
          <option key={s} value={s}>
            {INCIDENT_STATUS_LABELS[s]}
          </option>
        ))}
      </select>
      <textarea
        className="mt-2 min-h-[64px] w-full rounded-[9px] border border-[#e0e4ea] px-3 py-[9px] text-[13px] text-[#14213d] outline-none focus:border-[#2f49d1]"
        placeholder="Outcome — how this resolved"
        value={draftOutcome}
        onChange={(e) => setDraftOutcome(e.target.value)}
      />
      {error ? <p className="mt-1 text-[12px] text-[#c0362c]">{error}</p> : null}
      <button
        type="button"
        disabled={busy}
        onClick={() => void handleSave()}
        className="mt-2 rounded-[9px] bg-[#2f49d1] px-[13px] py-[8px] text-[13px] font-semibold text-white hover:bg-[#2438a8] disabled:opacity-50"
      >
        {busy ? 'Saving…' : 'Save resolution'}
      </button>
    </div>
  );
}

export function RetryBanner({
  incidentId,
  failedEmails,
}: {
  incidentId: string;
  failedEmails: string[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleRetry() {
    setBusy(true);
    setMessage(null);
    const result = await retryIncidentNotifications(incidentId);
    setBusy(false);
    if (!result.success) setMessage(result.error ?? 'Retry failed');
    else if (result.emailErrors?.length) {
      setMessage(`Still failing: ${result.emailErrors.join('; ')}`);
    } else {
      setMessage(`Resent ${result.resent ?? 0} notification(s).`);
      router.refresh();
    }
  }

  return (
    <div className="rounded-[13px] border border-[#f5c6c0] bg-[#fbe4e2] p-[16px]">
      <div className="text-[13px] font-bold text-[#c0362c]">
        Notification failed for {failedEmails.length} recipient
        {failedEmails.length === 1 ? '' : 's'}
      </div>
      <div className="mt-1 text-[12px] text-[#c0362c]">{failedEmails.join(', ')}</div>
      <button
        type="button"
        disabled={busy}
        onClick={() => void handleRetry()}
        className="mt-2 rounded-[9px] bg-[#c0362c] px-[13px] py-[8px] text-[13px] font-semibold text-white hover:bg-[#a52d24] disabled:opacity-50"
      >
        {busy ? 'Retrying…' : 'Retry failed sends'}
      </button>
      {message ? <p className="mt-2 text-[12px] text-[#8a5a12]">{message}</p> : null}
    </div>
  );
}

export function IncidentPdfButton({
  incidentId,
  pdfPath,
  pdfName,
}: {
  incidentId: string;
  pdfPath: string | null;
  pdfName: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setBusy(true);
    setError(null);
    if (pdfPath) {
      const url = await getFileSignedUrl(pdfPath, pdfName ?? 'incident-report.pdf');
      if (url) {
        window.open(url, '_blank');
        setBusy(false);
        return;
      }
    }
    const result = await generateIncidentPdf(incidentId);
    if (!result.success) setError(result.error ?? 'PDF generation failed');
    else router.refresh();
    setBusy(false);
  }

  return (
    <div className="flex flex-col items-end">
      <button
        type="button"
        disabled={busy}
        onClick={() => void handleClick()}
        className="rounded-[9px] border border-[#e0e4ea] bg-white px-[15px] py-[9px] text-[13px] font-semibold text-[#374151] transition-colors hover:border-[#c9d2e4] disabled:opacity-50"
      >
        {busy ? 'Working…' : pdfPath ? 'Download PDF' : 'Generate PDF'}
      </button>
      {error ? <p className="mt-1 text-[11px] text-[#c0362c]">{error}</p> : null}
    </div>
  );
}

export function DeleteIncidentButton({ incidentId }: { incidentId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleDelete() {
    if (!window.confirm('Move this incident to the trash? An incident is a record — be sure.'))
      return;
    setBusy(true);
    const result = await softDeleteIncident(incidentId);
    setBusy(false);
    if (result.success) {
      router.push('/dashboard/field-ops/safety');
      router.refresh();
    } else {
      window.alert(result.error ?? 'Delete failed');
    }
  }

  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => void handleDelete()}
      className="rounded-[9px] border border-[#f5c6c0] bg-white px-[15px] py-[9px] text-[13px] font-semibold text-[#c0362c] transition-colors hover:bg-[#fbe4e2] disabled:opacity-50"
    >
      Delete
    </button>
  );
}
