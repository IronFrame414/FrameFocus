'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { saveDeliveryEdit } from '@/lib/services/deliveries-client';
import { uploadFile } from '@/lib/services/files-client';

// 6D — delivery correction form. PO-linked lines keep their po_item_id and
// descriptions (the order defines them); orderless lines are fully editable.
// No email fires on edit — notification is a check-in event (§7). Saves via
// PUT /api/deliveries/[id] (S90), which enforces the damage-photo rule
// server-side, binds new photos, and regenerates the record PDF. The same
// rule guards here first: raising Damaged above 0 on a line with no photo —
// existing or new — blocks the save, identical to check-in.

const card = 'rounded-[13px] border border-[#e6e9ef] bg-white p-[18px]';
const label = 'mb-[6px] block text-[11px] font-semibold uppercase tracking-wide text-[#8a919c]';
const input =
  'w-full rounded-[9px] border border-[#e0e4ea] px-3 py-[9px] text-[13px] text-[#14213d] outline-none focus:border-[#2f49d1]';

interface LinePhoto {
  id: string;
  name: string;
}

export interface EditItemInput {
  /** Present on existing lines; absent for new lines. */
  id?: string;
  po_item_id?: string | null;
  description: string;
  qty_received: number;
  qty_damaged: number;
  issue_note?: string | null;
  /** Photos already bound to this line (files.delivery_item_id). */
  existingPhotoCount: number;
}

interface ItemRow extends EditItemInput {
  /** Newly uploaded photos, bound at save. */
  newPhotos: LinePhoto[];
  uploading: boolean;
}

interface DeliveryEditFormProps {
  projectId: string;
  deliveryId: string;
  isOrderless: boolean;
  poId: string | null;
  initial: { vendor_name: string; delivery_date: string; notes: string | null };
  initialItems: EditItemInput[];
  /** Whole-delivery photos already bound (files.delivery_id). */
  existingDeliveryPhotoCount: number;
}

export function DeliveryEditForm({
  projectId,
  deliveryId,
  isOrderless,
  poId,
  initial,
  initialItems,
  existingDeliveryPhotoCount,
}: DeliveryEditFormProps) {
  const router = useRouter();
  const [vendor, setVendor] = useState(initial.vendor_name);
  const [date, setDate] = useState(initial.delivery_date);
  const [notes, setNotes] = useState(initial.notes ?? '');
  const [items, setItems] = useState<ItemRow[]>(
    initialItems.map((it) => ({ ...it, newPhotos: [], uploading: false }))
  );
  const [deliveryPhotos, setDeliveryPhotos] = useState<LinePhoto[]>([]);
  const [deliveryPhotosUploading, setDeliveryPhotosUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const anyUploading = items.some((i) => i.uploading) || deliveryPhotosUploading;

  function setItem(i: number, patch: Partial<ItemRow>) {
    setItems((rows) => rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }

  async function handleLinePhotoUpload(i: number, files: FileList | null) {
    if (!files || files.length === 0) return;
    setItem(i, { uploading: true });
    for (const file of Array.from(files)) {
      // Project-pooled, category 'photos', client_visible default false —
      // the save route binds each to its line and tags damage lines' photos.
      const result = await uploadFile(file, { project_id: projectId, category: 'photos' });
      if (result.success && result.id) {
        const photo = { id: result.id, name: file.name };
        setItems((rows) =>
          rows.map((r, j) => (j === i ? { ...r, newPhotos: [...r.newPhotos, photo] } : r))
        );
      } else {
        setError(`Photo "${file.name}": ${result.error ?? 'upload failed'}`);
        break;
      }
    }
    setItem(i, { uploading: false });
  }

  async function handleDeliveryPhotoUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setDeliveryPhotosUploading(true);
    for (const file of Array.from(files)) {
      const result = await uploadFile(file, { project_id: projectId, category: 'photos' });
      if (result.success && result.id) {
        const photo = { id: result.id, name: file.name };
        setDeliveryPhotos((p) => [...p, photo]);
      } else {
        setError(`Photo "${file.name}": ${result.error ?? 'upload failed'}`);
        break;
      }
    }
    setDeliveryPhotosUploading(false);
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
      if (i.qty_damaged > 0 && i.existingPhotoCount + i.newPhotos.length === 0) {
        setError(
          `"${i.description}": ${i.qty_damaged} marked damaged — attach at least one photo of the damage before recording. The office sends these to the vendor.`
        );
        return;
      }
    }
    setSaving(true);

    const result = await saveDeliveryEdit(deliveryId, {
      vendor_name: isOrderless ? vendor.trim() : undefined,
      delivery_date: date,
      notes: notes.trim() || null,
      items: cleanItems.map((i) => ({
        id: i.id,
        po_item_id: i.po_item_id ?? null,
        description: i.description.trim(),
        qty_received: i.qty_received,
        qty_damaged: i.qty_damaged,
        issue_note: i.issue_note?.trim() ? i.issue_note.trim() : null,
        photo_file_ids: i.newPhotos.map((p) => p.id),
        existing_photo_count: i.existingPhotoCount,
      })),
      photo_file_ids: deliveryPhotos.map((p) => p.id),
    });
    if (!result.success) {
      setSaving(false);
      setError(result.error ?? 'Save failed');
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
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <label
                className={
                  item.qty_damaged > 0 && item.existingPhotoCount + item.newPhotos.length === 0
                    ? 'cursor-pointer text-[12px] font-semibold text-[#c0362c] hover:underline'
                    : 'cursor-pointer text-[12px] font-semibold text-[#2f49d1] hover:underline'
                }
              >
                {item.uploading
                  ? 'Uploading…'
                  : item.qty_damaged > 0 && item.existingPhotoCount + item.newPhotos.length === 0
                    ? '📷 Damage photo required'
                    : '📷 Add photo'}
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  disabled={item.uploading || saving}
                  onChange={(e) => {
                    void handleLinePhotoUpload(i, e.target.files);
                    e.target.value = '';
                  }}
                />
              </label>
              {item.existingPhotoCount > 0 ? (
                <span className="text-[12px] text-[#8a919c]">
                  {item.existingPhotoCount} photo{item.existingPhotoCount === 1 ? '' : 's'} on file
                </span>
              ) : null}
              {item.newPhotos.length > 0 ? (
                <span className="text-[12px] text-[#3d7a4b]">
                  {item.newPhotos.map((p) => p.name).join(', ')}
                </span>
              ) : null}
            </div>
          </div>
        ))}
        {isOrderless ? (
          <button
            type="button"
            onClick={() =>
              setItems((rows) => [
                ...rows,
                {
                  description: '',
                  qty_received: 0,
                  qty_damaged: 0,
                  issue_note: '',
                  existingPhotoCount: 0,
                  newPhotos: [],
                  uploading: false,
                },
              ])
            }
            className="text-[13px] font-semibold text-[#2f49d1] hover:underline"
          >
            + Add line
          </button>
        ) : null}
        <p className="mt-2 text-[11px] text-[#9aa1ac]">
          Exception state and PO totals recompute automatically when you save. A line with damage
          needs at least one photo — already-attached photos count.
        </p>
      </div>

      <div className={card}>
        <label className={label}>Photos (whole delivery — optional)</label>
        <input
          type="file"
          accept="image/*"
          multiple
          disabled={deliveryPhotosUploading || saving}
          onChange={(e) => {
            void handleDeliveryPhotoUpload(e.target.files);
            e.target.value = '';
          }}
          className="text-[13px] text-[#374151]"
        />
        {deliveryPhotosUploading ? (
          <p className="mt-1 text-[12px] text-[#8a919c]">Uploading…</p>
        ) : null}
        <p className="mt-1 text-[12px] text-[#8a919c]">
          {existingDeliveryPhotoCount > 0
            ? `${existingDeliveryPhotoCount} photo${existingDeliveryPhotoCount === 1 ? '' : 's'} on file. `
            : ''}
          {deliveryPhotos.length > 0 ? (
            <span className="text-[#3d7a4b]">
              Uploaded: {deliveryPhotos.map((p) => p.name).join(', ')}
            </span>
          ) : null}
        </p>
      </div>

      {error ? (
        <div className="rounded-[9px] border border-[#f5c6c0] bg-[#fbe4e2] p-3 text-[13px] text-[#c0362c]">
          {error}
        </div>
      ) : null}

      <button
        type="button"
        disabled={saving || anyUploading}
        onClick={() => void handleSave()}
        className="self-start rounded-[9px] bg-[#2f49d1] px-[15px] py-[10px] text-[13px] font-semibold text-white transition-colors hover:bg-[#2438a8] disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Save changes'}
      </button>
    </div>
  );
}
