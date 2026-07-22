'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { generateDeliveryPdf, softDeleteDelivery } from '@/lib/services/deliveries-client';
// Shared signed-URL helper (6C precedent: incident-detail-client imports it
// from daily-logs-client too).
import { getFileSignedUrl } from '@/lib/services/daily-logs-client';

export function DownloadDeliveryPdfButton({
  deliveryId,
  pdfPath,
  pdfName,
}: {
  deliveryId: string;
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
      // Supabase signed URLs are inline by default; ?download forces the save
      // (CLAUDE.md gotcha).
      const url = await getFileSignedUrl(pdfPath, pdfName ?? 'delivery-record.pdf');
      if (url) {
        window.open(url, '_blank');
        setBusy(false);
        return;
      }
    }
    // No stored PDF yet (or the signed URL failed) — generate, then reload so
    // the page picks up the new pdf_file_id.
    const result = await generateDeliveryPdf(deliveryId);
    if (!result.success) {
      setError(result.error ?? 'PDF generation failed');
    } else {
      router.refresh();
    }
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

export function DeleteDeliveryButton({
  deliveryId,
  projectId,
}: {
  deliveryId: string;
  projectId: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleDelete() {
    if (!window.confirm('Move this delivery to the trash? PO usable totals will recompute.'))
      return;
    setBusy(true);
    const result = await softDeleteDelivery(deliveryId);
    setBusy(false);
    if (result.success) {
      router.push(`/dashboard/field-ops/${projectId}/deliveries`);
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
