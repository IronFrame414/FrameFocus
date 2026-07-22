'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff } from 'lucide-react';
import {
  generateDailyLogPdf,
  getFileSignedUrl,
  setFileClientVisible,
  softDeleteDailyLog,
} from '@/lib/services/daily-logs-client';

// Client-side pieces of the 4c detail view: photo grid with the per-photo
// client_visible toggle (Q4 REVISED [S87] — flag only in v1, portal
// enforcement is M9), the Download PDF action, and Owner/Admin delete.

const VISIBLE_TILES = 8;

export interface GridPhoto {
  id: string;
  file_name: string;
  client_visible: boolean;
  signedUrl: string | null;
}

export function PhotoGrid({ photos }: { photos: GridPhoto[] }) {
  const [visibleFlags, setVisibleFlags] = useState<Record<string, boolean>>(
    Object.fromEntries(photos.map((p) => [p.id, p.client_visible]))
  );
  const [showAll, setShowAll] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (photos.length === 0) {
    return <p className="text-[12px] text-[#9aa1ac]">No photos for this day yet.</p>;
  }

  const shown = showAll ? photos : photos.slice(0, VISIBLE_TILES - 1);
  const overflow = photos.length - shown.length;

  async function toggle(photo: GridPhoto) {
    const next = !visibleFlags[photo.id];
    setVisibleFlags((f) => ({ ...f, [photo.id]: next })); // optimistic
    const result = await setFileClientVisible(photo.id, next);
    if (!result.success) {
      setVisibleFlags((f) => ({ ...f, [photo.id]: !next }));
      setError(result.error ?? 'Could not update photo visibility');
    }
  }

  return (
    <div>
      <div className="grid grid-cols-4 gap-[10px]">
        {shown.map((photo) => (
          <div
            key={photo.id}
            className="group relative aspect-square overflow-hidden rounded-[9px] bg-[#eef1f6]"
          >
            {photo.signedUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- signed URL, not optimizable
              <img
                src={photo.signedUrl}
                alt={photo.file_name}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-[11px] text-[#9aa1ac]">
                {photo.file_name}
              </div>
            )}
            <button
              type="button"
              title={
                visibleFlags[photo.id]
                  ? 'Shared to client (flag only in v1) — click to unshare'
                  : 'Not client-visible — click to share'
              }
              onClick={() => void toggle(photo)}
              className={
                visibleFlags[photo.id]
                  ? 'absolute right-1 top-1 rounded-[7px] bg-[#2f49d1] p-[5px] text-white'
                  : 'absolute right-1 top-1 rounded-[7px] bg-black/40 p-[5px] text-white opacity-0 transition-opacity group-hover:opacity-100'
              }
            >
              {visibleFlags[photo.id] ? <Eye size={13} /> : <EyeOff size={13} />}
            </button>
          </div>
        ))}
        {overflow > 0 ? (
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="flex aspect-square items-center justify-center rounded-[9px] border border-dashed border-[#cbd2dc] bg-[#f4f6f9] text-[12px] font-semibold text-[#9aa1ac] hover:text-[#14213d]"
          >
            +{overflow}
          </button>
        ) : null}
      </div>
      {error ? <p className="mt-2 text-[12px] text-[#c0362c]">{error}</p> : null}
      <p className="mt-2 text-[11px] text-[#9aa1ac]">
        Eye icon marks a photo client-visible (flag only — the client portal is a later module).
      </p>
    </div>
  );
}

export function DownloadPdfButton({
  logId,
  pdfPath,
  pdfName,
}: {
  logId: string;
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
      const url = await getFileSignedUrl(pdfPath, pdfName ?? 'daily-log.pdf');
      if (url) {
        window.open(url, '_blank');
        setBusy(false);
        return;
      }
    }
    // No stored PDF yet (or the signed URL failed) — generate, then reload so
    // the page picks up the new pdf_file_id.
    const result = await generateDailyLogPdf(logId);
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

export function DeleteLogButton({ logId, projectId }: { logId: string; projectId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleDelete() {
    if (!window.confirm('Move this daily log to the trash?')) return;
    setBusy(true);
    const result = await softDeleteDailyLog(logId);
    setBusy(false);
    if (result.success) {
      router.push(`/dashboard/field-ops/${projectId}/daily-logs`);
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
