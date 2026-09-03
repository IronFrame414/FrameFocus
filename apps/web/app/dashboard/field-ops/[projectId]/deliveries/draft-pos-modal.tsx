'use client';

// PO module 18a — draft POs from the estimate (po-module-spec.md §6).
// Reachable from the project Deliveries tab any time after conversion (the
// spec's chosen home — it subsumes the convert-flow entry). What it obeys:
//   · Group into POs by Vendor (default; a PO goes to one supplier) ·
//     Category · One PO — categories carry through either way (they live on
//     the budget items, not the grouping).
//   · Lines with NO vendor land on the amber "no vendor yet" card, called
//     out rather than silently dropped (R4); vendors are assigned HERE, on
//     the project side, from real vendor rows — never a guessed string.
//   · POs are created as DRAFTS. Nothing is committed until issue (R-Q1) —
//     drafting writes no totals (R-L2).
//   · Dedup: lines already on a live PO are shown as already drafted.

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase-browser';
import {
  createDraftPos,
  groupDraftableLines,
  listDraftableLines,
  type DraftGroupBy,
  type DraftableLine,
} from '@/lib/services/po-lines-client';

const fmt = (v: number) =>
  `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

interface VendorOption {
  id: string;
  name: string;
}

export function DraftPosModal({
  projectId,
  sourceEstimateId,
}: {
  projectId: string;
  sourceEstimateId: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [lines, setLines] = useState<DraftableLine[] | null>(null);
  const [vendors, setVendors] = useState<VendorOption[]>([]);
  const [groupBy, setGroupBy] = useState<DraftGroupBy>('vendor');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    void listDraftableLines(projectId).then(setLines);
    const supabase = createClient();
    void supabase
      .from('subcontractors')
      .select('id, company_name')
      .eq('sub_type', 'vendor')
      .eq('is_deleted', false)
      .order('company_name')
      .then(({ data }) =>
        setVendors((data ?? []).map((v) => ({ id: v.id, name: v.company_name ?? 'Vendor' })))
      );
  }, [open, projectId]);

  const previews = useMemo(
    () => (lines ? groupDraftableLines(lines, groupBy) : []),
    [lines, groupBy]
  );
  const alreadyDrafted = (lines ?? []).filter((l) => l.alreadyDrafted).length;
  const totalCost = previews.reduce((s, p) => s + p.total, 0);
  const unassigned = previews.find((p) => p.vendorId === null && p.vendorName === null && groupBy === 'vendor');

  function assignVendorLocally(sourceLineRowId: string, vendorId: string) {
    const vendor = vendors.find((v) => v.id === vendorId);
    if (!vendor) return;
    setLines((prev) =>
      (prev ?? []).map((l) =>
        l.sourceLineRowId === sourceLineRowId
          ? { ...l, vendorId: vendor.id, vendorName: vendor.name }
          : l
      )
    );
  }

  async function handleCreate() {
    setBusy(true);
    setError(null);
    const result = await createDraftPos(projectId, sourceEstimateId, previews);
    setBusy(false);
    if (!result.success) {
      setError(result.error ?? 'Drafting failed.');
      return;
    }
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        data-testid="open-draft-pos"
        onClick={() => setOpen(true)}
        className="rounded-[9px] border border-[#dbe0fb] bg-[#f2f4ff] px-[15px] py-[9px] text-[13px] font-semibold text-blue"
      >
        Draft POs from the estimate
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-[rgba(15,23,41,.42)]"
          onClick={() => !busy && setOpen(false)}
        >
          <div
            data-testid="draft-pos-modal"
            onClick={(e) => e.stopPropagation()}
            className="absolute bottom-0 right-0 top-0 flex w-[min(760px,96vw)] flex-col bg-white shadow-[-18px_0_44px_rgba(15,23,41,.18)]"
          >
            <div className="flex items-center justify-between border-b border-[#e4e8ef] px-[22px] py-[14px]">
              <div className="text-[18px] font-extrabold text-navy">
                Draft purchase orders
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={() => !busy && setOpen(false)}
                className="text-[18px] text-[#7b8699]"
              >
                ✕
              </button>
            </div>

            <div className="flex items-center gap-2 border-b border-[#e4e8ef] px-[22px] py-[10px]">
              <span className="text-[12px] font-bold text-[#3f4a60]">Group into POs by:</span>
              {(
                [
                  ['vendor', 'Vendor'],
                  ['category', 'Category'],
                  ['single', 'One PO for everything'],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setGroupBy(key)}
                  className={`rounded-[20px] px-3 py-[5px] text-[12px] font-semibold ${
                    groupBy === key
                      ? 'bg-navy text-white'
                      : 'border border-[#d5dae4] bg-white text-[#3f4a60]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-[22px] py-[14px]">
              {error && (
                <p className="mb-2 rounded-[8px] bg-[#fdf1f0] px-3 py-2 text-[12.5px] text-[#c0362c]">
                  {error}
                </p>
              )}
              {lines === null ? (
                <p className="text-[13px] text-[#9aa4b8]">Reading the estimate&rsquo;s material lines…</p>
              ) : previews.length === 0 ? (
                <p className="text-[13px] text-[#9aa4b8]">
                  {alreadyDrafted > 0
                    ? `Every material line from the estimate is already on a PO (${alreadyDrafted}).`
                    : 'No material lines with cost came through from an estimate on this job.'}
                </p>
              ) : (
                previews.map((preview) => {
                  const noVendorCard = groupBy === 'vendor' && preview.vendorId === null;
                  return (
                    <div
                      key={preview.label}
                      className={`mb-3 rounded-[13px] border p-[14px] ${
                        noVendorCard ? 'border-[#f5cf8f] bg-[#fffdf7]' : 'border-[#e4e8ef] bg-white'
                      }`}
                    >
                      <div className="mb-1 flex items-center justify-between">
                        <span className="text-[13.5px] font-bold text-navy">
                          {noVendorCard
                            ? `${preview.lines.length} line${preview.lines.length === 1 ? ' has' : 's have'} no vendor yet`
                            : preview.label}
                        </span>
                        <span className="font-mono text-[13px] font-semibold text-navy">
                          {fmt(preview.total)}
                        </span>
                      </div>
                      {preview.lines.map((line) => (
                        <div
                          key={line.sourceLineRowId}
                          className="flex items-center gap-2 border-b border-[#f4f6fa] py-[5px] text-[12.5px]"
                        >
                          <span className="min-w-0 flex-1 text-[#3f4a60]">
                            {line.description}
                            {line.costCode ? (
                              <span className="ml-2 font-mono text-[10.5px] text-[#9aa4b8]">
                                {line.costCode}
                              </span>
                            ) : null}
                          </span>
                          <span className="font-mono text-[#3f4a60]">
                            {line.qty} × {fmt(line.unitCost)}
                          </span>
                          {noVendorCard && (
                            <select
                              aria-label={`Vendor for ${line.description}`}
                              className="rounded-[7px] border border-[#d5dae4] px-2 py-[3px] text-[12px]"
                              defaultValue=""
                              onChange={(e) => {
                                if (e.target.value) assignVendorLocally(line.sourceLineRowId, e.target.value);
                              }}
                            >
                              <option value="">Assign vendor…</option>
                              {vendors.map((v) => (
                                <option key={v.id} value={v.id}>
                                  {v.name}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                      ))}
                    </div>
                  );
                })
              )}
              {alreadyDrafted > 0 && previews.length > 0 && (
                <p className="text-[11.5px] text-[#9aa4b8]">
                  {alreadyDrafted} line{alreadyDrafted === 1 ? ' is' : 's are'} already on a PO and
                  not offered again.
                </p>
              )}
            </div>

            <div className="flex items-center gap-3 border-t border-[#e4e8ef] bg-navy px-[22px] py-[12px] text-[13px] text-white">
              <span>
                {previews.length} PO{previews.length === 1 ? '' : 's'} to draft
              </span>
              <span>
                Cost <strong className="font-mono text-[#f5a524]">{fmt(totalCost)}</strong>
              </span>
              <span className="flex-1 text-[11px] text-muted-navy">
                POs are created as drafts — nothing is committed until lines are issued.
              </span>
              <button
                type="button"
                disabled={busy}
                onClick={() => setOpen(false)}
                className="rounded-[8px] border border-[rgba(255,255,255,.4)] px-[13px] py-[7px] font-semibold"
              >
                Skip POs
              </button>
              <button
                type="button"
                data-testid="create-draft-pos"
                disabled={busy || previews.length === 0 || Boolean(unassigned && unassigned.lines.some((l) => !l.vendorId))}
                onClick={() => void handleCreate()}
                className="rounded-[8px] bg-blue px-[15px] py-[8px] font-bold disabled:opacity-50"
                title={
                  unassigned && unassigned.lines.some((l) => !l.vendorId)
                    ? 'Assign a vendor to every line first (or switch the grouping).'
                    : undefined
                }
              >
                {busy ? 'Drafting…' : `Create ${previews.length} PO${previews.length === 1 ? '' : 's'}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
