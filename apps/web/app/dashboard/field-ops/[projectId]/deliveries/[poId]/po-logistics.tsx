'use client';

// 18b §4.3 — the logistics pair. Need-by and deliver-to live on the PO and
// print on the PDF (po-template renders '—' when unset); this is the ONE
// place they are written. Editable for O/A/PM (the UPDATE policy mirrored by
// canEdit); read-only text for everyone else.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { updatePoLogistics } from '@/lib/services/po-lines-client';

export function PoLogistics({
  poId,
  needBy,
  deliverTo,
  canEdit,
}: {
  poId: string;
  needBy: string | null;
  deliverTo: string | null;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [date, setDate] = useState(needBy ?? '');
  const [dest, setDest] = useState(deliverTo ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    const res = await updatePoLogistics(poId, {
      need_by: date || null,
      deliver_to: dest.trim() || null,
    });
    setBusy(false);
    if (!res.success) {
      setError(res.error ?? 'Failed to save.');
      return;
    }
    setEditing(false);
    router.refresh();
  }

  return (
    <div
      data-testid="po-logistics"
      className="mb-[18px] flex flex-wrap items-center gap-x-6 gap-y-2 rounded-[13px] border border-[#e6e9ef] bg-white px-5 py-3 text-[13px]"
    >
      {editing ? (
        <>
          <label className="flex items-center gap-2 text-[#374151]">
            <span className="font-semibold">Need by</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="rounded-[8px] border border-[#e0e4ea] px-2 py-1"
            />
          </label>
          <label className="flex min-w-[220px] flex-1 items-center gap-2 text-[#374151]">
            <span className="font-semibold">Deliver to</span>
            <input
              value={dest}
              onChange={(e) => setDest(e.target.value)}
              placeholder="Site address, gate code…"
              className="min-w-0 flex-1 rounded-[8px] border border-[#e0e4ea] px-2 py-1"
            />
          </label>
          <button
            className="rounded-[8px] bg-[#2f49d1] px-3 py-[6px] font-semibold text-white disabled:opacity-60"
            disabled={busy}
            onClick={() => void save()}
          >
            {busy ? 'Saving…' : 'Save'}
          </button>
          <button
            className="font-semibold text-[#6b7280]"
            disabled={busy}
            onClick={() => setEditing(false)}
          >
            Cancel
          </button>
        </>
      ) : (
        <>
          <span className="text-[#374151]">
            <span className="font-semibold">Need by</span> {needBy ?? '—'}
          </span>
          <span className="text-[#374151]">
            <span className="font-semibold">Deliver to</span> {deliverTo ?? '—'}
          </span>
          {canEdit && (
            <button
              className="font-semibold text-[#2f49d1]"
              onClick={() => {
                setDate(needBy ?? '');
                setDest(deliverTo ?? '');
                setEditing(true);
              }}
            >
              Edit
            </button>
          )}
        </>
      )}
      {error && <span className="font-semibold text-[#c0362c]">{error}</span>}
    </div>
  );
}
