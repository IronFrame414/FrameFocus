'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { checkInDelivery } from '@/lib/services/deliveries-client';
import { uploadFile } from '@/lib/services/files-client';

// 6D — check-in form: the crew's two-slips comparison, on desktop. Against a
// PO the lines prefill from the order with received at 0 — the crew counts
// the truck and enters what actually arrived, against a read-only "Ordered"
// figure per line; orderless is free lines (§4). The
// "Issue with delivery" per-line toggle IS the issue_note (live semantics,
// §4.1 as amended). Photos attach PER LINE (S90): they upload immediately,
// project-pooled to the main job file (category 'photos', client_visible
// false), and the check-in route binds them to their delivery line
// (files.delivery_item_id) — REQUIRED on any line with damaged quantity.

const card = 'rounded-[13px] border border-[#e6e9ef] bg-white p-[18px]';
const label = 'mb-[6px] block text-[11px] font-semibold uppercase tracking-wide text-[#8a919c]';
const input =
  'w-full rounded-[9px] border border-[#e0e4ea] px-3 py-[9px] text-[13px] text-[#14213d] outline-none focus:border-[#2f49d1]';

export interface CheckInPoOption {
  id: string;
  title: string;
  vendor_name: string;
  lines: {
    po_item_id: string;
    description: string;
    unit: string | null;
    ordered: number;
    remaining: number;
  }[];
}

interface LinePhoto {
  id: string;
  name: string;
}

interface ItemRow {
  po_item_id: string | null;
  description: string;
  unit?: string | null;
  /** PO lines only — free lines have no order to compare against. */
  ordered?: number | null;
  qty_received: number;
  qty_damaged: number;
  issue_note: string;
  issueOpen: boolean;
  /** Uploaded photos bound to this line at submit (S90). */
  photos: LinePhoto[];
  uploading: boolean;
}

interface CheckInFormProps {
  projectId: string;
  todayYmd: string;
  preselectedPoId: string | null;
  openPos: CheckInPoOption[];
}

function rowsForPo(po: CheckInPoOption): ItemRow[] {
  return po.lines.map((l) => ({
    po_item_id: l.po_item_id,
    description: l.description,
    unit: l.unit,
    ordered: l.ordered,
    qty_received: 0,
    qty_damaged: 0,
    issue_note: '',
    issueOpen: false,
    photos: [],
    uploading: false,
  }));
}

const EMPTY_ROW: ItemRow = {
  po_item_id: null,
  description: '',
  qty_received: 0,
  qty_damaged: 0,
  issue_note: '',
  issueOpen: false,
  photos: [],
  uploading: false,
};

export function CheckInForm({ projectId, todayYmd, preselectedPoId, openPos }: CheckInFormProps) {
  const router = useRouter();
  const initialPo = openPos.find((p) => p.id === preselectedPoId) ?? null;

  const [poId, setPoId] = useState<string>(initialPo?.id ?? '');
  const [vendor, setVendor] = useState<string>(initialPo?.vendor_name ?? '');
  const [date, setDate] = useState(todayYmd);
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<ItemRow[]>(initialPo ? rowsForPo(initialPo) : [{ ...EMPTY_ROW }]);
  // General whole-delivery photos (S90) — always optional, bound to the
  // check-in as a whole via files.delivery_id, never tagged 'damage'.
  const [deliveryPhotos, setDeliveryPhotos] = useState<LinePhoto[]>([]);
  const [deliveryPhotosUploading, setDeliveryPhotosUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedPo = openPos.find((p) => p.id === poId) ?? null;
  const anyUploading = items.some((i) => i.uploading) || deliveryPhotosUploading;

  function handlePoChange(nextId: string) {
    setPoId(nextId);
    const po = openPos.find((p) => p.id === nextId) ?? null;
    if (po) {
      setVendor(po.vendor_name);
      setItems(rowsForPo(po));
    } else {
      setVendor('');
      setItems([{ ...EMPTY_ROW }]);
    }
  }

  function setItem(i: number, patch: Partial<ItemRow>) {
    setItems((rows) => rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }

  async function handleLinePhotoUpload(i: number, files: FileList | null) {
    if (!files || files.length === 0) return;
    setItem(i, { uploading: true });
    for (const file of Array.from(files)) {
      // Project-pooled (Q7): main job file, category 'photos'. client_visible
      // defaults false, so these stay portal-hidden. The check-in route binds
      // each photo to its delivery line and tags damage lines' photos.
      const result = await uploadFile(file, { project_id: projectId, category: 'photos' });
      if (result.success && result.id) {
        const photo = { id: result.id, name: file.name };
        setItems((rows) =>
          rows.map((r, j) => (j === i ? { ...r, photos: [...r.photos, photo] } : r))
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

  async function handleSubmit() {
    setError(null);
    if (!selectedPo && !vendor.trim()) {
      setError('Vendor is required for an orderless check-in.');
      return;
    }
    const cleanItems = items.filter((i) => i.description.trim());
    if (cleanItems.length === 0) {
      setError('At least one line is required.');
      return;
    }
    for (const i of cleanItems) {
      if (i.qty_received < 0 || i.qty_damaged < 0 || i.qty_damaged > i.qty_received) {
        setError(
          `"${i.description}": damaged cannot exceed received, and quantities cannot be negative.`
        );
        return;
      }
      if (i.qty_damaged > 0 && i.photos.length === 0) {
        setError(
          `"${i.description}": ${i.qty_damaged} marked damaged — attach at least one photo of the damage before recording. The office sends these to the vendor.`
        );
        return;
      }
    }
    setSaving(true);

    const result = await checkInDelivery({
      project_id: projectId,
      purchase_order_id: selectedPo?.id ?? null,
      vendor_name: selectedPo?.vendor_name ?? vendor.trim(),
      delivery_date: date,
      notes: notes.trim() || null,
      items: cleanItems.map((i) => ({
        po_item_id: i.po_item_id,
        description: i.description.trim(),
        qty_received: i.qty_received,
        qty_damaged: i.qty_damaged,
        issue_note: i.issue_note.trim() || null,
        photo_file_ids: i.photos.map((p) => p.id),
      })),
      photo_file_ids: deliveryPhotos.map((p) => p.id),
    });

    if (!result.success) {
      setSaving(false);
      setError(result.error ?? 'Check-in failed');
      return;
    }
    if (result.emailErrors && result.emailErrors.length > 0) {
      window.alert(
        `Delivery recorded, but the notification email had problems:\n${result.emailErrors.join('\n')}`
      );
    }
    router.push(
      selectedPo
        ? `/dashboard/field-ops/${projectId}/deliveries/${selectedPo.id}`
        : `/dashboard/field-ops/${projectId}/deliveries/d/${result.deliveryId}`
    );
    router.refresh();
  }

  return (
    <div className="flex max-w-[760px] flex-col gap-4">
      <div className={card}>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className={label}>Purchase order</label>
            <select className={input} value={poId} onChange={(e) => handlePoChange(e.target.value)}>
              <option value="">No PO — orderless check-in</option>
              {openPos.map((po) => (
                <option key={po.id} value={po.id}>
                  {po.title}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={label}>Vendor</label>
            <input
              type="text"
              className={input}
              value={selectedPo ? selectedPo.vendor_name : vendor}
              disabled={selectedPo != null}
              placeholder="Who delivered"
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
        </div>
        {!selectedPo ? (
          <p className="mt-2 text-[11px] text-[#9aa1ac]">
            No order entered yet? Record it anyway — the office reconciles later. A delivery
            recorded loosely beats a delivery not recorded at all.
          </p>
        ) : null}
      </div>

      <div className={card}>
        <div className="mb-2 text-[13px] font-bold uppercase text-[#14213d]">
          {selectedPo ? 'Check each line against the truck' : 'What arrived'}
        </div>
        {items.map((item, i) => (
          <div key={item.po_item_id ?? `free-${i}`} className="mb-2 rounded-[9px] border border-[#eef1f6] p-3">
            <div className="flex items-center gap-2">
              {selectedPo ? (
                <span className="flex-1 text-[13px] font-semibold text-[#14213d]">
                  {item.description}
                  {item.unit ? <span className="font-normal text-[#9aa1ac]"> ({item.unit})</span> : null}
                </span>
              ) : (
                <input
                  type="text"
                  className={input}
                  placeholder="Description"
                  value={item.description}
                  onChange={(e) => setItem(i, { description: e.target.value })}
                />
              )}
              <div className="flex shrink-0 items-center gap-2">
                {item.ordered != null ? (
                  <span className="text-[11px] text-[#8a919c]">
                    Ordered: <span className="font-semibold text-[#374151]">{item.ordered}</span>
                  </span>
                ) : null}
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
                {!selectedPo ? (
                  <button
                    type="button"
                    onClick={() => setItems((rows) => rows.filter((_, j) => j !== i))}
                    className="text-[12px] text-[#c0362c] hover:underline"
                  >
                    Remove
                  </button>
                ) : null}
              </div>
            </div>
            <div className="mt-2">
              {item.issueOpen ? (
                <input
                  type="text"
                  className={input}
                  placeholder='What went wrong — e.g. "2 split, returned with driver"'
                  value={item.issue_note}
                  onChange={(e) => setItem(i, { issue_note: e.target.value })}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setItem(i, { issueOpen: true })}
                  className="text-[12px] font-semibold text-[#b45309] hover:underline"
                >
                  ⚠ Issue with delivery
                </button>
              )}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <label
                className={
                  item.qty_damaged > 0 && item.photos.length === 0
                    ? 'cursor-pointer text-[12px] font-semibold text-[#c0362c] hover:underline'
                    : 'cursor-pointer text-[12px] font-semibold text-[#2f49d1] hover:underline'
                }
              >
                {item.uploading
                  ? 'Uploading…'
                  : item.qty_damaged > 0 && item.photos.length === 0
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
              {item.photos.length > 0 ? (
                <span className="text-[12px] text-[#3d7a4b]">
                  {item.photos.map((p) => p.name).join(', ')}
                </span>
              ) : null}
            </div>
          </div>
        ))}
        {!selectedPo ? (
          <button
            type="button"
            onClick={() => setItems((rows) => [...rows, { ...EMPTY_ROW }])}
            className="text-[13px] font-semibold text-[#2f49d1] hover:underline"
          >
            + Add line
          </button>
        ) : null}
        <p className="mt-2 text-[11px] text-[#9aa1ac]">
          Photos file to the job&rsquo;s photo pool and stay attached to their line — required when
          a line has damage, so the office has evidence for the vendor call.
        </p>
      </div>

      <div className={card}>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={label}>Notes</label>
            <input
              type="text"
              className={input}
              placeholder="Anything about this truck"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          <div>
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
            {deliveryPhotos.length > 0 ? (
              <p className="mt-1 text-[12px] text-[#3d7a4b]">
                Uploaded: {deliveryPhotos.map((p) => p.name).join(', ')}
              </p>
            ) : null}
          </div>
        </div>
      </div>

      {error ? (
        <div className="rounded-[9px] border border-[#f5c6c0] bg-[#fbe4e2] p-3 text-[13px] text-[#c0362c]">
          {error}
        </div>
      ) : null}

      <button
        type="button"
        disabled={saving || anyUploading}
        onClick={() => void handleSubmit()}
        className="self-start rounded-[9px] bg-[#2f49d1] px-[15px] py-[10px] text-[13px] font-semibold text-white transition-colors hover:bg-[#2438a8] disabled:opacity-50"
      >
        {saving ? 'Recording…' : 'Record delivery'}
      </button>
      <p className="-mt-2 text-[11px] text-[#9aa1ac]">
        Recording emails Owner, Admin, and assigned PMs — clean or flagged — and files a delivery
        record PDF to the job&rsquo;s Files.
      </p>
    </div>
  );
}
