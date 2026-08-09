'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Image as ImageIcon } from 'lucide-react';
import { checkInDelivery } from '@/lib/services/deliveries-client';
import { uploadFile } from '@/lib/services/files-client';
import { SetMobileHeader } from '../../../../mobile-header';

// M6M §4.12.4 — the 7d form.
//
// ---------------------------------------------------------------------------
// ONLINE-ONLY, AND IT FAILS CLOSED (D-6, A-19).
// ---------------------------------------------------------------------------
// The handoff's global autosave rule — "every capture screen keeps a local
// draft… queue and surface it" — is the one rule 7d is EXEMPT from. Offline,
// the submit is disabled behind an explicit message; there is no Draft pill
// (a pill would promise durability the ruling denies) and NO QUEUE ENTRY is
// created on any path through this file. The steppers keep working — what is
// blocked is submission, not counting.
//
// Adopted as drawn: per-PO-line cards, Received/Damaged steppers,
// usable = received − damaged (derived — there is no stored usable column),
// the error treatment once damage is non-zero, orderless check-in, and the
// consequence line. Damage requires ≥1 photo BEFORE submit — the same rule the
// zod schema, the API route and the submit_delivery_check_in RPC each enforce
// at their own layer.

export type PoOption = {
  id: string;
  po_number: string | null;
  vendor_name: string;
  items: { id: string; description: string; qty_ordered: number }[];
};

type Line = {
  po_item_id: string | null;
  description: string;
  ordered: number | null;
  received: number;
  damaged: number;
  photos: File[];
};

export function CheckInForm({
  projectId,
  projectName,
  poOptions,
  today,
}: {
  projectId: string;
  projectName: string;
  poOptions: PoOption[];
  /**
   * The company's calendar day, resolved SERVER-SIDE [S106]. `delivery_date`
   * is a calendar date; deriving it from the handset clock recorded TOMORROW
   * for any truck checked in after ~20:00 EDT — a wrong delivery date, not a
   * display nit.
   */
  today: string;
}) {
  const router = useRouter();

  const [poId, setPoId] = useState<string | null>(null);
  const [orderless, setOrderless] = useState(poOptions.length === 0);
  const [vendor, setVendor] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [note, setNote] = useState('');
  const [noteOpen, setNoteOpen] = useState(false);
  const [online, setOnline] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The offline state is REAL, not decorative: `online` gates the submit.
  useEffect(() => {
    const sync = () => setOnline(navigator.onLine);
    sync();
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    return () => {
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', sync);
    };
  }, []);

  const po = poOptions.find((p) => p.id === poId) ?? null;

  function choosePo(id: string | null) {
    setPoId(id);
    setOrderless(id === null);
    const chosen = poOptions.find((p) => p.id === id);
    if (chosen) {
      setVendor(chosen.vendor_name);
      setLines(
        chosen.items.map((i) => ({
          po_item_id: i.id,
          description: i.description,
          ordered: i.qty_ordered,
          received: 0,
          damaged: 0,
          photos: [],
        }))
      );
    } else {
      setVendor('');
      setLines([{ po_item_id: null, description: '', ordered: null, received: 0, damaged: 0, photos: [] }]);
    }
  }

  function bump(i: number, field: 'received' | 'damaged', delta: number) {
    setLines((cur) =>
      cur.map((l, j) => {
        if (j !== i) return l;
        const next = { ...l, [field]: Math.max(0, l[field] + delta) };
        // The schema's own rule: damaged never exceeds received.
        if (next.damaged > next.received) next.damaged = next.received;
        return next;
      })
    );
  }

  const activeLines = lines.filter((l) => l.description.trim() && l.received > 0);
  const damagedMissingPhoto = activeLines.some((l) => l.damaged > 0 && l.photos.length === 0);
  const ready =
    online &&
    activeLines.length > 0 &&
    vendor.trim().length > 0 &&
    !damagedMissingPhoto;

  async function submit() {
    if (!ready) return;
    setBusy(true);
    setError(null);

    // Photos first — the payload carries file ids, so the bytes go up through
    // the shared uploadFile path (HEIC conversion included) before submit.
    const withIds: { line: Line; photo_file_ids: string[] }[] = [];
    for (const line of activeLines) {
      const ids: string[] = [];
      for (const file of line.photos) {
        const up = await uploadFile(file, { project_id: projectId, category: 'photos' });
        if (!up.success || !up.id) {
          setBusy(false);
          setError(up.error ?? 'A photo failed to upload — nothing was submitted.');
          return;
        }
        ids.push(up.id);
      }
      withIds.push({ line, photo_file_ids: ids });
    }

    // The submit — through the shared route, whose gate is the
    // submit_delivery_check_in RPC (D-30 rule 4). Only on success does the
    // screen proceed; the notification is the route's job.
    const result = await checkInDelivery({
      project_id: projectId,
      purchase_order_id: poId,
      vendor_name: vendor.trim(),
      delivery_date: today,
      notes: note.trim() || null,
      items: withIds.map(({ line, photo_file_ids }) => ({
        po_item_id: line.po_item_id,
        description: line.description.trim(),
        qty_received: line.received,
        qty_damaged: line.damaged,
        photo_file_ids: photo_file_ids.length > 0 ? photo_file_ids : undefined,
      })),
    });

    setBusy(false);
    if (!result.success) {
      setError(result.error ?? 'Check-in failed.');
      return;
    }
    router.push(`/m/p/${projectId}/deliveries`);
    router.refresh();
  }

  return (
    <div className="px-[18px] pb-[18px] pt-[14px]">
      <SetMobileHeader title="Delivery check-in" sub={projectName} />

      {/* D-6 — offline fails CLOSED. An explicit message, no Draft pill, no
          queue entry. */}
      {!online ? (
        <p
          data-testid="m-checkin-offline"
          role="alert"
          className="mb-[14px] rounded-[12px] border border-m6m-strip-border bg-m6m-strip-bg px-[14px] py-[10px] text-[14px] font-semibold text-m6m-navy"
        >
          Delivery check-in needs a connection — it is not saved offline. Reconnect and try
          again.
        </p>
      ) : null}

      {/* PO or orderless. */}
      <section className="mb-[14px]">
        <h2 className="mb-[8px] font-mono text-[11px] font-medium uppercase tracking-wide text-m6m-muted">
          PURCHASE ORDER
        </h2>
        <div className="flex flex-col gap-[8px]">
          {poOptions.map((p) => (
            <button
              key={p.id}
              type="button"
              data-testid="m-checkin-po"
              data-po-id={p.id}
              data-active={poId === p.id ? 'true' : 'false'}
              onClick={() => choosePo(p.id)}
              className={`flex min-h-[58px] items-center rounded-[14px] border px-[14px] text-left text-[15px] font-bold ${
                poId === p.id
                  ? 'border-[1.5px] border-m6m-blue bg-[#f5f7ff] text-m6m-blue'
                  : 'border-m6m-border bg-m6m-card text-m6m-navy'
              }`}
            >
              {p.po_number ?? 'PO'} · {p.vendor_name}
            </button>
          ))}
          <button
            type="button"
            data-testid="m-checkin-orderless"
            data-active={orderless && poId === null ? 'true' : 'false'}
            onClick={() => choosePo(null)}
            className={`flex min-h-[58px] items-center rounded-[14px] border px-[14px] text-left text-[15px] font-semibold ${
              orderless && poId === null
                ? 'border-[1.5px] border-m6m-blue bg-[#f5f7ff] text-m6m-blue'
                : 'border-dashed border-m6m-border bg-m6m-card text-m6m-navy'
            }`}
          >
            No PO — orderless check-in
          </button>
        </div>
      </section>

      {(poId !== null || orderless) && (
        <>
          {orderless ? (
            <section className="mb-[14px]">
              <label
                htmlFor="m-checkin-vendor"
                className="mb-[6px] block font-mono text-[11px] font-medium uppercase tracking-wide text-m6m-muted"
              >
                VENDOR
              </label>
              <input
                id="m-checkin-vendor"
                data-testid="m-checkin-vendor"
                value={vendor}
                onChange={(e) => setVendor(e.target.value)}
                placeholder="Who delivered?"
                className="h-[48px] w-full rounded-[12px] border border-m6m-border bg-m6m-card px-[12px] text-[15px] text-m6m-navy"
              />
            </section>
          ) : null}

          {/* One card per line. Damage flips the card to the error treatment
              AND demands a photo — border, fill, strip and text, never colour
              alone. */}
          <div className="flex flex-col gap-[10px]">
            {lines.map((line, i) => {
              const usable = line.received - line.damaged;
              const damaged = line.damaged > 0;
              return (
                <section
                  key={i}
                  data-testid="m-checkin-line"
                  data-damaged={damaged ? 'true' : 'false'}
                  className={`rounded-[15px] border p-[15px] ${
                    damaged ? 'border-[1.5px] border-m6m-danger bg-[#fdf1f0]' : 'border-m6m-border bg-m6m-card'
                  }`}
                >
                  {line.po_item_id ? (
                    <div className="flex items-start justify-between gap-[8px]">
                      <p className="min-w-0 flex-1 text-[15px] font-bold text-m6m-navy">
                        {line.description}
                      </p>
                      <span className="shrink-0 font-mono text-[12px] text-m6m-muted">
                        Ordered {line.ordered}
                      </span>
                    </div>
                  ) : (
                    <input
                      data-testid="m-checkin-desc"
                      value={line.description}
                      onChange={(e) =>
                        setLines((cur) =>
                          cur.map((l, j) => (j === i ? { ...l, description: e.target.value } : l))
                        )
                      }
                      placeholder="What arrived?"
                      className="h-[44px] w-full rounded-[10px] border border-m6m-border px-[12px] text-[15px] text-m6m-navy"
                    />
                  )}

                  <div className="mt-[10px] flex items-center justify-between gap-[10px]">
                    <Stepper
                      label="Received"
                      value={line.received}
                      testId={`m-received-${i}`}
                      onDelta={(d) => bump(i, 'received', d)}
                    />
                    <Stepper
                      label="Damaged"
                      value={line.damaged}
                      danger={damaged}
                      testId={`m-damaged-${i}`}
                      onDelta={(d) => bump(i, 'damaged', d)}
                    />
                    <div className="text-right">
                      <p className="font-mono text-[11px] uppercase text-m6m-muted">Usable</p>
                      <p
                        data-testid={`m-usable-${i}`}
                        className={`font-mono text-[20px] font-bold ${
                          damaged ? 'text-m6m-danger' : 'text-[#16a34a]'
                        }`}
                      >
                        {usable}
                      </p>
                    </div>
                  </div>

                  {damaged ? (
                    <div
                      data-testid="m-damage-photo-strip"
                      className="mt-[10px] rounded-[10px] border border-m6m-danger-border bg-white px-[12px] py-[8px]"
                    >
                      <p className="text-[13px] font-semibold text-m6m-danger">
                        Photo required for damage · {line.photos.length}
                      </p>
                      <div className="mt-[6px] flex items-stretch gap-[8px]">
                        <label className="flex min-h-[44px] flex-1 cursor-pointer items-center justify-center rounded-[10px] border border-dashed border-m6m-danger-border text-[14px] font-semibold text-m6m-danger">
                          Add damage photo
                          <input
                            type="file"
                            accept="image/*"
                            capture="environment"
                            data-testid={`m-damage-photo-${i}`}
                            className="hidden"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) {
                                setLines((cur) =>
                                  cur.map((l, j) =>
                                    j === i ? { ...l, photos: [...l.photos, f] } : l
                                  )
                                );
                              }
                              e.target.value = '';
                            }}
                          />
                        </label>
                        {/* §6 / A-20b — the gallery as the SECONDARY control.
                            Damage evidence is the one place a field user is
                            most likely to have shot it already. */}
                        <label
                          data-testid={`m-damage-photo-library-${i}`}
                          aria-label="Choose from library"
                          className="flex min-h-[44px] w-11 shrink-0 cursor-pointer items-center justify-center rounded-[10px] border border-m6m-danger-border text-m6m-danger"
                        >
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) {
                                setLines((cur) =>
                                  cur.map((l, j) =>
                                    j === i ? { ...l, photos: [...l.photos, f] } : l
                                  )
                                );
                              }
                              e.target.value = '';
                            }}
                          />
                          <ImageIcon size={18} aria-hidden />
                        </label>
                      </div>
                    </div>
                  ) : null}
                </section>
              );
            })}

            {orderless ? (
              <button
                type="button"
                data-testid="m-checkin-add-line"
                onClick={() =>
                  setLines((cur) => [
                    ...cur,
                    { po_item_id: null, description: '', ordered: null, received: 0, damaged: 0, photos: [] },
                  ])
                }
                className="flex min-h-[52px] items-center justify-center rounded-[14px] border border-dashed border-m6m-border bg-m6m-card text-[15px] font-semibold text-m6m-blue"
              >
                Add line
              </button>
            ) : null}
          </div>

          {/* Note for the office — a disclosure, not another textarea. */}
          <section className="mt-[14px] overflow-hidden rounded-[14px] border border-m6m-border bg-m6m-card">
            <button
              type="button"
              data-testid="m-checkin-note-row"
              aria-expanded={noteOpen}
              onClick={() => setNoteOpen((v) => !v)}
              className="flex min-h-[58px] w-full items-center justify-between px-[14px] text-[15px] font-semibold text-m6m-navy"
            >
              Note for the office
              <span aria-hidden className={`text-m6m-muted ${noteOpen ? 'rotate-90' : ''}`}>
                ›
              </span>
            </button>
            {noteOpen ? (
              <div className="px-[14px] pb-[14px]">
                <textarea
                  data-testid="m-checkin-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  className="w-full rounded-[10px] border border-m6m-border px-[12px] py-[8px] text-[15px]"
                />
              </div>
            ) : null}
          </section>

          {error ? (
            <p
              data-testid="m-checkin-error"
              role="alert"
              className="mt-[12px] rounded-[10px] border border-m6m-danger-border bg-[#fdf1f0] px-[12px] py-[8px] text-[14px] text-m6m-danger"
            >
              {error}
            </p>
          ) : null}

          {/* The consequence line — never a surprise. */}
          <p className="mt-[14px] text-center text-[12px] text-m6m-muted">
            Notifies Owner, Admin, PM
          </p>
          <button
            type="button"
            data-testid="m-submit-checkin"
            disabled={!ready || busy}
            onClick={submit}
            className="mt-[6px] flex h-[60px] w-full items-center justify-center rounded-[14px] bg-m6m-amber text-[17px] font-bold text-m6m-navy disabled:opacity-40"
          >
            {busy ? 'Submitting…' : 'Submit check-in'}
          </button>
        </>
      )}
    </div>
  );
}

/** The handoff's stepper — `− value +` with 46px tap zones and mono numerals. */
function Stepper({
  label,
  value,
  danger,
  testId,
  onDelta,
}: {
  label: string;
  value: number;
  danger?: boolean;
  testId: string;
  onDelta: (d: number) => void;
}) {
  return (
    <div>
      <p className={`font-mono text-[11px] uppercase ${danger ? 'text-m6m-danger' : 'text-m6m-muted'}`}>
        {label}
      </p>
      <div className="mt-[2px] flex items-center">
        <button
          type="button"
          data-testid={`${testId}-minus`}
          aria-label={`${label} minus`}
          onClick={() => onDelta(-1)}
          className="flex h-[46px] w-[46px] items-center justify-center rounded-l-[10px] border border-m6m-border bg-white text-[18px] font-bold text-m6m-navy"
        >
          −
        </button>
        <span
          data-testid={testId}
          className={`flex h-[46px] min-w-[44px] items-center justify-center border-y border-m6m-border bg-white px-[6px] font-mono text-[16px] font-bold ${
            danger ? 'text-m6m-danger' : 'text-m6m-navy'
          }`}
        >
          {value}
        </span>
        <button
          type="button"
          data-testid={`${testId}-plus`}
          aria-label={`${label} plus`}
          onClick={() => onDelta(1)}
          className="flex h-[46px] w-[46px] items-center justify-center rounded-r-[10px] border border-m6m-border bg-white text-[18px] font-bold text-m6m-navy"
        >
          +
        </button>
      </div>
    </div>
  );
}
