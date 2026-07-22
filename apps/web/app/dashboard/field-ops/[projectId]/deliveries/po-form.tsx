'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  createPurchaseOrder,
  updatePurchaseOrder,
  setPurchaseOrderItems,
  type PoFields,
  type PoLineInput,
} from '@/lib/services/deliveries-client';

// 6D §U — path-A PO create/edit form (no handoff design; ui-01 tokens).
// Owner/Admin/PM per RLS; the page gates, RLS enforces. po_number is manual
// and optional (Phase 3 Q6) — the office types the vendor's number or their
// own, or leaves it blank for the vendor·date title fallback.

const card = 'rounded-[13px] border border-[#e6e9ef] bg-white p-[18px]';
const label = 'mb-[6px] block text-[11px] font-semibold uppercase tracking-wide text-[#8a919c]';
const input =
  'w-full rounded-[9px] border border-[#e0e4ea] px-3 py-[9px] text-[13px] text-[#14213d] outline-none focus:border-[#2f49d1]';

interface PoFormProps {
  mode: 'create' | 'edit';
  projectId: string;
  poId?: string;
  initialFields: PoFields;
  initialLines: PoLineInput[];
}

export function PoForm({ mode, projectId, poId, initialFields, initialLines }: PoFormProps) {
  const router = useRouter();
  const [fields, setFields] = useState<PoFields>({
    vendor_name: initialFields.vendor_name,
    po_number: initialFields.po_number ?? '',
    ordered_at: initialFields.ordered_at ?? '',
  });
  const [lines, setLines] = useState<PoLineInput[]>(
    initialLines.length > 0 ? initialLines : [{ description: '', qty_ordered: 0, unit: '' }]
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function setLine(i: number, patch: Partial<PoLineInput>) {
    setLines((rows) => rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }

  async function handleSave() {
    setError(null);
    if (!fields.vendor_name.trim()) {
      setError('Vendor is required.');
      return;
    }
    const cleanLines = lines.filter((l) => l.description.trim());
    if (cleanLines.length === 0) {
      setError('At least one line item is required.');
      return;
    }
    for (const l of cleanLines) {
      if (!(l.qty_ordered > 0)) {
        setError(`"${l.description}" needs a quantity greater than zero.`);
        return;
      }
    }
    setSaving(true);

    const payload: PoFields = {
      vendor_name: fields.vendor_name.trim(),
      po_number: fields.po_number?.toString().trim() || null,
      ordered_at: fields.ordered_at?.toString().trim() || null,
    };

    let targetId = poId;
    if (mode === 'create') {
      const result = await createPurchaseOrder(projectId, payload, cleanLines);
      if (!result.success || !result.id) {
        setSaving(false);
        setError(result.error ?? 'Save failed');
        return;
      }
      targetId = result.id;
    } else if (poId) {
      const updated = await updatePurchaseOrder(poId, payload);
      if (!updated.success) {
        setSaving(false);
        setError(updated.error ?? 'Save failed');
        return;
      }
      const items = await setPurchaseOrderItems(poId, cleanLines);
      if (!items.success) {
        setSaving(false);
        setError(items.error ?? 'Line update failed');
        return;
      }
    }

    router.push(`/dashboard/field-ops/${projectId}/deliveries/${targetId}`);
    router.refresh();
  }

  return (
    <div className="flex max-w-[760px] flex-col gap-4">
      <div className={card}>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className={label}>Vendor</label>
            <input
              type="text"
              className={input}
              placeholder="Jones Lumber"
              value={fields.vendor_name}
              onChange={(e) => setFields((f) => ({ ...f, vendor_name: e.target.value }))}
            />
          </div>
          <div>
            <label className={label}>PO number (optional)</label>
            <input
              type="text"
              className={input}
              placeholder="Vendor's or ours"
              value={fields.po_number ?? ''}
              onChange={(e) => setFields((f) => ({ ...f, po_number: e.target.value }))}
            />
          </div>
          <div>
            <label className={label}>Ordered on</label>
            <input
              type="date"
              className={input}
              value={fields.ordered_at ?? ''}
              onChange={(e) => setFields((f) => ({ ...f, ordered_at: e.target.value }))}
            />
          </div>
        </div>
      </div>

      <div className={card}>
        <div className="mb-2 text-[13px] font-bold uppercase text-[#14213d]">Line items</div>
        {lines.map((line, i) => (
          <div key={line.id ?? `new-${i}`} className="mb-2 flex gap-2">
            <input
              type="text"
              className={input}
              placeholder='Description — e.g. "5/8 plywood sheet"'
              value={line.description}
              onChange={(e) => setLine(i, { description: e.target.value })}
            />
            <input
              type="number"
              min={0}
              step={0.01}
              className={`${input} w-28`}
              placeholder="Qty"
              value={Number.isFinite(line.qty_ordered) && line.qty_ordered !== 0 ? line.qty_ordered : ''}
              onChange={(e) => setLine(i, { qty_ordered: parseFloat(e.target.value) || 0 })}
            />
            <input
              type="text"
              className={`${input} w-24`}
              placeholder="Unit"
              value={line.unit ?? ''}
              onChange={(e) => setLine(i, { unit: e.target.value })}
            />
            <button
              type="button"
              onClick={() => setLines((rows) => rows.filter((_, j) => j !== i))}
              className="shrink-0 text-[12px] text-[#c0362c] hover:underline"
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setLines((rows) => [...rows, { description: '', qty_ordered: 0, unit: '' }])}
          className="text-[13px] font-semibold text-[#2f49d1] hover:underline"
        >
          + Add line
        </button>
      </div>

      {error ? (
        <div className="rounded-[9px] border border-[#f5c6c0] bg-[#fbe4e2] p-3 text-[13px] text-[#c0362c]">
          {error}
        </div>
      ) : null}

      <button
        type="button"
        disabled={saving}
        onClick={() => void handleSave()}
        className="self-start rounded-[9px] bg-[#2f49d1] px-[15px] py-[10px] text-[13px] font-semibold text-white transition-colors hover:bg-[#2438a8] disabled:opacity-50"
      >
        {saving ? 'Saving…' : mode === 'create' ? 'Save purchase order' : 'Save changes'}
      </button>
    </div>
  );
}
