'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  updateDelivery,
  setDeliveryItems,
  type DeliveryItemInput,
} from '@/lib/services/deliveries-client';

// 6D — delivery correction form. PO-linked lines keep their po_item_id and
// descriptions (the order defines them); orderless lines are fully editable.
// No email fires on edit — notification is a check-in event (§7).

const card = 'rounded-[13px] border border-[#e6e9ef] bg-white p-[18px]';
const label = 'mb-[6px] block text-[11px] font-semibold uppercase tracking-wide text-[#8a919c]';
const input =
  'w-full rounded-[9px] border border-[#e0e4ea] px-3 py-[9px] text-[13px] text-[#14213d] outline-none focus:border-[#2f49d1]';

interface DeliveryEditFormProps {
  projectId: string;
  deliveryId: string;
  isOrderless: boolean;
  poId: string | null;
  initial: { vendor_name: string; delivery_date: string; notes: string | null };
  initialItems: DeliveryItemInput[];
}

export function DeliveryEditForm({
  projectId,
  deliveryId,
  isOrderless,
  poId,
  initial,
  initialItems,
}: DeliveryEditFormProps) {
  const router = useRouter();
  const [vendor, setVendor] = useState(initial.vendor_name);
  const [date, setDate] = useState(initial.delivery_date);
  const [notes, setNotes] = useState(initial.notes ?? '');
  const [items, setItems] = useState<DeliveryItemInput[]>(initialItems);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function setItem(i: number, patch: Partial<DeliveryItemInput>) {
    setItems((rows) => rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }

  async function handleSave() {
    setError(null);
    const cleanItems = items.filter((i) => i.description.trim());
    if (cleanItems.length === 0) {
      setError('At least one line is required.');
      return;
    }
    for (const i of cleanItems) {
      if (i.qty_received < 0 || i.qty_damaged < 0 || i.qty_damaged > i.qty_received) {
        setError(`"${i.description}": damaged cannot exceed received; no negatives.`);
        return;
      }
    }
    setSaving(true);

    const updated = await updateDelivery(deliveryId, {
      vendor_name: isOrderless ? vendor.trim() : undefined,
      delivery_date: date,
      notes: notes.trim() || null,
    });
    if (!updated.success) {
      setSaving(false);
      setError(updated.error ?? 'Save failed');
      return;
    }
    const itemsResult = await setDeliveryItems(deliveryId, cleanItems);
    if (!itemsResult.success) {
      setSaving(false);
      setError(itemsResult.error ?? 'Line update failed');
      return;
    }

    router.push(
      poId
        ? `/dashboard/field-ops/${projectId}/deliveries/${poId}`
        : `/dashboard/field-ops/${projectId}/deliveries/d/${deliveryId}`
    );
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
              value={vendor}
              disabled={!isOrderless}
              onChange={(e) => setVendor(e.target.value)}
            />
          </div>
          <div>
            <label className={label}>Delivery date</label>
            <input
              type="date"
              className={input}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div>
            <label className={label}>Notes</label>
            <input
              type="text"
              className={input}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className={card}>
        <div className="mb-2 text-[13px] font-bold uppercase text-[#14213d]">Lines</div>
        {items.map((item, i) => (
          <div key={item.id ?? `new-${i}`} className="mb-2 rounded-[9px] border border-[#eef1f6] p-3">
            <div className="flex items-center gap-2">
              {item.po_item_id ? (
                <span className="flex-1 text-[13px] font-semibold text-[#14213d]">
                  {item.description}
                </span>
              ) : (
                <input
                  type="text"
                  className={input}
                  value={item.description}
                  onChange={(e) => setItem(i, { description: e.target.value })}
                />
              )}
              <div className="flex shrink-0 items-center gap-2">
                <label className="text-[11px] text-[#8a919c]">Received</label>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  className={`${input} w-24`}
                  value={Number.isFinite(item.qty_received) ? item.qty_received : ''}
                  onChange={(e) => setItem(i, { qty_received: parseFloat(e.target.value) || 0 })}
                />
                <label className="text-[11px] text-[#8a919c]">Damaged</label>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  className={`${input} w-24`}
                  value={Number.isFinite(item.qty_damaged) ? item.qty_damaged : ''}
                  onChange={(e) => setItem(i, { qty_damaged: parseFloat(e.target.value) || 0 })}
                />
                <button
                  type="button"
                  onClick={() => setItems((rows) => rows.filter((_, j) => j !== i))}
                  className="text-[12px] text-[#c0362c] hover:underline"
                >
                  Remove
                </button>
              </div>
            </div>
            <input
              type="text"
              className={`${input} mt-2`}
              placeholder="Issue note (blank = no issue flagged on this line)"
              value={item.issue_note ?? ''}
              onChange={(e) => setItem(i, { issue_note: e.target.value })}
            />
          </div>
        ))}
        {isOrderless ? (
          <button
            type="button"
            onClick={() =>
              setItems((rows) => [
                ...rows,
                { description: '', qty_received: 0, qty_damaged: 0, issue_note: '' },
              ])
            }
            className="text-[13px] font-semibold text-[#2f49d1] hover:underline"
          >
            + Add line
          </button>
        ) : null}
        <p className="mt-2 text-[11px] text-[#9aa1ac]">
          Exception state and PO totals recompute automatically when you save.
        </p>
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
        {saving ? 'Saving…' : 'Save changes'}
      </button>
    </div>
  );
}
