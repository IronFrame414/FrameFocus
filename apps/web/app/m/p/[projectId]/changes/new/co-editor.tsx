'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  createCoLineItem,
  createCoLineRow,
  deleteCoLineItem,
  deleteCoLineRow,
  recalculateChangeOrderTotals,
  updateChangeOrder,
  updateCoLineItem,
  updateCoLineRow,
  type ChangeOrderLineItemWithRows,
  type ChangeOrderLineRow,
  type ChangeOrderWithChildren,
  type CoRowType,
} from '@/lib/services/change-orders-client';
import { SetMobileHeader } from '../../../../mobile-header';
import { formatMoney } from '../../../../mobile-ui';
import {
  ErrorNotice,
  OfflineNotice,
  PrimaryButton,
  SecondaryButton,
  TextField,
  useOnline,
} from '../../../../write-ui';

// M6M §4.11.12 — M-32, the EDIT half: the three-level editor.
//
// ===========================================================================
// THIS IS A THREE-LEVEL EDITOR BECAUSE THE VALUE IS NOT A FIELD
// ===========================================================================
// §4.11.12, quoted because it is the scope fact the whole screen follows from:
//
//   "`createChangeOrder` takes **no amount**. `change_orders.net_delta` is a
//    stored `numeric DEFAULT 0` computed by `recalculateChangeOrderTotals()`
//    from **line items → line rows**. So 'create a CO with a value' on a phone
//    is a **three-level editor**: the CO, its `change_order_line_items`, and
//    each item's `change_order_line_rows`."
//
// Levels, and the six existing client functions that write them — §4.11.12 is
// explicit that "Six client functions already exist and none needs writing":
//
//   CO         updateChangeOrder
//   line item  createCoLineItem · updateCoLineItem · deleteCoLineItem
//   line row   createCoLineRow  · updateCoLineRow  · deleteCoLineRow
//
// All six are used here. A seventh was not written.
//
// ===========================================================================
// ⚠️ EVERY PRICING WRITE IS FOLLOWED BY recalculateChangeOrderTotals(). A-55.
// ===========================================================================
// `net_delta` defaults to 0 and is ONLY ever set by that call. §4.11.12: "A
// build that writes rows and skips the recalculation leaves `net_delta` at its
// default of `0` and sends a client a change order worth nothing" — and every
// screen-level assertion passes while it does, which is why A-55 asserts the
// stored value rather than the rendered one.
//
// It is called after row and line-item writes, and NOT after a CO-header edit:
// title, description, reason and schedule days do not affect pricing, and an
// extra round trip through the privileged route buys nothing.
//
// ===========================================================================
// THE RECALCULATION IS A PRIVILEGED SERVER ROUND TRIP, NOT LOCAL ARITHMETIC
// ===========================================================================
// Since c87e370 (#140 / D-62) `recalculateChangeOrderTotals` POSTs to
// `/api/change-orders/[id]/recalculate`, which does 401 → 403 → an RLS-scoped
// CO read → 404 BEFORE reading `instrument_rates` under the service role. That
// is what lets a PM price a cost_plus or T&M change order at all: the rates
// table is DB-floored to Owner/Admin, so the PM's own client reads zero rows.
//
// **No rate value comes back** — the response is `{ success }` (A-68c). This
// component must never try to compute or display a markup itself; it re-reads
// the CO through `router.refresh()` and renders what the server persisted.
//
// ===========================================================================
// MONEY RENDERS FREELY HERE, AND ONLY BECAUSE THE ROUTE IS ALREADY FLOORED
// ===========================================================================
// D-51 restricts CO money to Owner/Admin/PM. On M-31 that needs a `showMoney`
// branch because foreman and crew legitimately reach that screen. Here it does
// not: `requireCoWriteAccess` refused every other role at the route, so anyone
// rendering this component is one of D-51's three. There is no second gate and
// there must not be one — a redundant check here would imply the route guard
// were unreliable.

const ROW_TYPES: readonly { value: CoRowType; label: string }[] = [
  { value: 'labor', label: 'Labor' },
  { value: 'material', label: 'Material' },
  { value: 'allowance', label: 'Allowance' }, // [S170] fifth row type — parity with the desktop builder
  { value: 'subcontractor', label: 'Sub' },
  { value: 'other', label: 'Other' },
];

/** A signed decimal, or null for an empty box. Credits are negative (D-2). */
function num(v: string): number | null {
  const t = v.trim();
  if (t === '' || t === '-') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function moneyInput(v: string): string {
  return v.replace(/[^0-9.-]/g, '');
}

export function CoEditor({
  projectId,
  projectName,
  co,
}: {
  projectId: string;
  projectName: string;
  co: ChangeOrderWithChildren;
}) {
  const router = useRouter();
  const online = useOnline();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openItem, setOpenItem] = useState<string | null>(null);

  // CO header fields.
  const [title, setTitle] = useState(co.title);
  const [description, setDescription] = useState(co.description ?? '');
  const [reason, setReason] = useState(co.reason_category ?? '');
  const [days, setDays] = useState(
    co.schedule_impact_days === null || co.schedule_impact_days === undefined
      ? ''
      : String(co.schedule_impact_days)
  );

  const [newItemName, setNewItemName] = useState('');

  const editable = co.status === 'draft';

  /**
   * Runs a write, then the recalculation, then re-reads.
   *
   * The recalculation failing is NOT swallowed: a CO whose rows changed but
   * whose net_delta did not is exactly the state A-55 forbids, and the author
   * needs to know before they reach Send.
   */
  async function write(
    action: () => Promise<{ success: boolean; error?: string }>,
    opts: { reprice: boolean }
  ) {
    if (!online) return;
    setBusy(true);
    setError(null);

    const result = await action();
    if (!result.success) {
      setBusy(false);
      setError(result.error ?? 'That change could not be saved.');
      return;
    }

    if (opts.reprice) {
      const priced = await recalculateChangeOrderTotals(co.id);
      if (!priced.success) {
        setBusy(false);
        // The route's own message, verbatim. It distinguishes 401/403/404/422
        // and this component must not overwrite it with a guess.
        setError(priced.error ?? 'The total could not be recalculated.');
        router.refresh();
        return;
      }
    }

    setBusy(false);
    router.refresh();
  }

  return (
    <div className="px-[18px] pb-[18px] pt-[14px]">
      <SetMobileHeader title="Edit change order" sub={projectName} />

      <header className="mb-[6px]">
        <p className="font-mono text-[11px] font-semibold text-m6m-muted">{co.co_number}</p>
        <h1 className="mt-[2px] text-[17px] font-bold leading-tight text-m6m-navy">
          {co.title}
        </h1>
        <p
          data-testid="m-co-editor-total"
          className="mt-[6px] font-mono text-[15px] font-bold text-m6m-navy"
        >
          {formatMoney(co.net_delta)}
        </p>
      </header>

      {!online ? <OfflineNotice what="Editing a change order" testId="m-co-offline" /> : null}

      {!editable ? (
        // A sent or signed CO is not editable. Stated rather than silently
        // disabled: D-51's revise path is void + write a new one.
        <p
          data-testid="m-co-not-editable"
          role="status"
          className="mb-[12px] rounded-[10px] border border-m6m-border bg-m6m-card px-[12px] py-[10px] text-[14px] text-m6m-navy"
        >
          This change order has been sent and can no longer be edited. Void it and write a new one
          to revise.
        </p>
      ) : null}

      {/* ── LEVEL 1 — the change order itself ── */}
      {editable ? (
        <section data-testid="m-co-fields">
          <TextField label="Title" value={title} onChange={setTitle} testId="m-co-edit-title" />
          <TextField
            label="Description"
            value={description}
            onChange={setDescription}
            testId="m-co-edit-description"
          />
          <TextField label="Reason" value={reason} onChange={setReason} testId="m-co-edit-reason" />
          <TextField
            label="Schedule impact (days)"
            value={days}
            onChange={(v) => setDays(v.replace(/[^0-9-]/g, ''))}
            testId="m-co-edit-days"
            inputMode="numeric"
          />
          <SecondaryButton
            label="Save details"
            testId="m-co-save-fields"
            disabled={busy || !online}
            onClick={() =>
              // NOT repriced — none of these four fields affects the total.
              write(
                () =>
                  updateChangeOrder(co.id, {
                    title: title.trim(),
                    description: description.trim() || null,
                    reason_category: reason.trim() || null,
                    schedule_impact_days: days.trim() === '' ? null : Number(days),
                  }),
                { reprice: false }
              )
            }
          />
        </section>
      ) : null}

      {/* ── LEVEL 2 — line items ── */}
      <h2 className="mb-[8px] mt-[20px] font-mono text-[11px] font-medium uppercase tracking-wide text-m6m-muted">
        Line items
      </h2>

      {co.line_items.length === 0 ? (
        <p
          data-testid="m-co-no-lines"
          className="rounded-[12px] border border-m6m-border bg-m6m-card px-[14px] py-[12px] text-[14px] text-m6m-muted"
        >
          No line items yet — a change order with none is worth nothing.
        </p>
      ) : (
        <ul data-testid="m-co-edit-lines" className="flex flex-col gap-[10px]">
          {co.line_items.map((item) => (
            <LineItemBlock
              key={item.id}
              item={item}
              open={openItem === item.id}
              onToggle={() => setOpenItem(openItem === item.id ? null : item.id)}
              editable={editable}
              busy={busy}
              online={online}
              write={write}
            />
          ))}
        </ul>
      )}

      {editable ? (
        <div className="mt-[12px] flex items-center gap-[8px]">
          <input
            data-testid="m-co-new-line-name"
            value={newItemName}
            onChange={(e) => setNewItemName(e.target.value)}
            placeholder="New line item"
            className="h-[48px] min-w-0 flex-1 rounded-[12px] border border-m6m-border bg-m6m-card px-[14px] text-[15px] text-m6m-navy"
          />
          <button
            type="button"
            data-testid="m-co-add-line"
            disabled={busy || !online || newItemName.trim() === ''}
            onClick={() =>
              write(
                async () => {
                  const r = await createCoLineItem({
                    change_order_id: co.id,
                    name: newItemName.trim(),
                    description: null,
                    sort_order: co.line_items.length,
                  });
                  if (r.success) setNewItemName('');
                  return r;
                },
                // An empty line item has no rows, so it cannot change the
                // total — but repricing anyway keeps ONE rule ("every
                // structural write reprices") instead of a per-case judgement
                // a later edit would get wrong.
                { reprice: true }
              )
            }
            className="flex h-[48px] shrink-0 items-center rounded-[12px] border border-m6m-border bg-m6m-card px-[16px] text-[15px] font-semibold text-m6m-navy disabled:opacity-40"
          >
            Add
          </button>
        </div>
      ) : null}

      {error ? <ErrorNotice message={error} testId="m-co-editor-error" /> : null}

      <PrimaryButton
        label="Done — review and send"
        busyLabel="Saving…"
        onClick={() => router.push(`/m/p/${projectId}/changes/${co.id}`)}
        disabled={busy}
        busy={false}
        testId="m-co-done"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// One line item, with its rows.
// ---------------------------------------------------------------------------
function LineItemBlock({
  item,
  open,
  onToggle,
  editable,
  busy,
  online,
  write,
}: {
  item: ChangeOrderLineItemWithRows;
  open: boolean;
  onToggle: () => void;
  editable: boolean;
  busy: boolean;
  online: boolean;
  write: (
    action: () => Promise<{ success: boolean; error?: string }>,
    opts: { reprice: boolean }
  ) => Promise<void>;
}) {
  const [name, setName] = useState(item.name);
  const [addingType, setAddingType] = useState<CoRowType | null>(null);

  return (
    <li
      data-testid="m-co-edit-line"
      className="overflow-hidden rounded-[14px] border border-m6m-border bg-m6m-card"
    >
      <button
        type="button"
        data-testid="m-co-line-toggle"
        aria-expanded={open}
        onClick={onToggle}
        className="flex min-h-[58px] w-full items-center justify-between gap-[10px] px-[14px] text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-bold text-m6m-navy">{item.name}</span>
          <span className="block font-mono text-[11px] text-m6m-muted">
            {item.rows.length} {item.rows.length === 1 ? 'row' : 'rows'}
          </span>
        </span>
        <span
          data-testid="m-co-edit-line-total"
          className="shrink-0 font-mono text-[13px] font-semibold text-m6m-navy"
        >
          {formatMoney(item.total_price)}
        </span>
        <span aria-hidden className={`shrink-0 text-m6m-muted ${open ? 'rotate-90' : ''}`}>
          ›
        </span>
      </button>

      {open ? (
        <div className="border-t border-m6m-border px-[14px] pb-[14px]">
          {/* ── LEVEL 3 — rows ── */}
          {item.rows.length > 0 ? (
            <ul className="mt-[6px] flex flex-col gap-[8px]">
              {item.rows.map((row) => (
                <RowBlock
                  key={row.id}
                  row={row}
                  editable={editable}
                  busy={busy}
                  online={online}
                  write={write}
                />
              ))}
            </ul>
          ) : (
            <p className="mt-[10px] text-[13px] text-m6m-muted">No rows on this line yet.</p>
          )}

          {editable ? (
            <>
              <div className="mt-[12px] flex flex-wrap gap-[6px]">
                {ROW_TYPES.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    data-testid={`m-co-add-row-${t.value}`}
                    disabled={busy || !online}
                    onClick={() => setAddingType(addingType === t.value ? null : t.value)}
                    className={`flex min-h-[44px] items-center rounded-[10px] border px-[12px] text-[13px] font-semibold disabled:opacity-40 ${
                      addingType === t.value
                        ? 'border-m6m-blue bg-[#f5f7ff] text-m6m-blue'
                        : 'border-m6m-border text-m6m-navy'
                    }`}
                  >
                    + {t.label}
                  </button>
                ))}
              </div>

              {addingType ? (
                <NewRowForm
                  lineItemId={item.id}
                  rowType={addingType}
                  sortOrder={item.rows.length}
                  busy={busy}
                  online={online}
                  write={write}
                  onDone={() => setAddingType(null)}
                />
              ) : null}

              <div className="mt-[12px] flex items-center gap-[8px]">
                <input
                  data-testid="m-co-line-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="h-[44px] min-w-0 flex-1 rounded-[10px] border border-m6m-border px-[12px] text-[14px] text-m6m-navy"
                />
                <button
                  type="button"
                  data-testid="m-co-save-line"
                  disabled={busy || !online || name.trim() === ''}
                  onClick={() =>
                    write(() => updateCoLineItem(item.id, { name: name.trim() }), {
                      reprice: false,
                    })
                  }
                  className="flex h-[44px] shrink-0 items-center rounded-[10px] border border-m6m-border px-[14px] text-[14px] font-semibold text-m6m-navy disabled:opacity-40"
                >
                  Save
                </button>
                <button
                  type="button"
                  data-testid="m-co-delete-line"
                  aria-label={`Delete ${item.name}`}
                  disabled={busy || !online}
                  onClick={() => write(() => deleteCoLineItem(item.id), { reprice: true })}
                  className="flex h-[44px] w-11 shrink-0 items-center justify-center rounded-[10px] border border-m6m-danger-border text-m6m-danger disabled:opacity-40"
                >
                  ✕
                </button>
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

// ---------------------------------------------------------------------------
// One existing row — edit its numbers, or delete it.
//
// The editable fields FOLLOW row_type, because the DB CHECK
// `change_order_line_rows_type_columns` only permits the matching columns to be
// non-null. `row_type` itself is immutable after creation — `UpdateCoLineRowInput`
// omits it deliberately — so there is no type switcher here.
// ---------------------------------------------------------------------------
function RowBlock({
  row,
  editable,
  busy,
  online,
  write,
}: {
  row: ChangeOrderLineRow;
  editable: boolean;
  busy: boolean;
  online: boolean;
  write: (
    action: () => Promise<{ success: boolean; error?: string }>,
    opts: { reprice: boolean }
  ) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(row.name);
  const [rate, setRate] = useState(row.rate === null ? '' : String(row.rate));
  const [quantity, setQuantity] = useState(row.quantity === null ? '' : String(row.quantity));
  const [unitCost, setUnitCost] = useState(row.unit_cost === null ? '' : String(row.unit_cost));
  const [amount, setAmount] = useState(row.amount === null ? '' : String(row.amount));

  function save() {
    const patch =
      row.row_type === 'labor'
        ? { name: name.trim(), rate: num(rate), quantity: num(quantity) }
        : row.row_type === 'material' || row.row_type === 'allowance' // [S170] material shape
          ? { name: name.trim(), unit_cost: num(unitCost), quantity: num(quantity) }
          : { name: name.trim(), amount: num(amount) };

    return write(() => updateCoLineRow(row.id, patch), { reprice: true });
  }

  return (
    <li
      data-testid="m-co-edit-row"
      data-row-type={row.row_type}
      className="rounded-[10px] border border-m6m-border"
    >
      <button
        type="button"
        data-testid="m-co-row-toggle"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex min-h-[44px] w-full items-center justify-between gap-[8px] px-[12px] py-[8px] text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-semibold text-m6m-navy">{row.name}</span>
          <span className="block font-mono text-[10px] uppercase text-m6m-muted">
            {row.row_type}
          </span>
        </span>
        <span
          data-testid="m-co-edit-row-total"
          className="shrink-0 font-mono text-[12px] text-m6m-navy"
        >
          {formatMoney(row.total)}
        </span>
      </button>

      {open && editable ? (
        <div className="border-t border-m6m-border px-[12px] pb-[12px]">
          <TextField label="Name" value={name} onChange={setName} testId="m-co-row-name" />

          {row.row_type === 'labor' ? (
            <>
              <TextField
                label="Rate"
                value={rate}
                onChange={(v) => setRate(moneyInput(v))}
                testId="m-co-row-rate"
                inputMode="decimal"
              />
              <TextField
                label={`Quantity (${row.labor_unit ?? 'hours'})`}
                value={quantity}
                onChange={(v) => setQuantity(moneyInput(v))}
                testId="m-co-row-quantity"
                inputMode="decimal"
              />
            </>
          ) : row.row_type === 'material' || row.row_type === 'allowance' ? (
            <>
              <TextField
                label="Unit cost"
                value={unitCost}
                onChange={(v) => setUnitCost(moneyInput(v))}
                testId="m-co-row-unit-cost"
                inputMode="decimal"
              />
              <TextField
                label={`Quantity (${row.unit_of_measure ?? 'each'})`}
                value={quantity}
                onChange={(v) => setQuantity(moneyInput(v))}
                testId="m-co-row-quantity"
                inputMode="decimal"
              />
            </>
          ) : (
            <TextField
              label="Amount"
              value={amount}
              onChange={(v) => setAmount(moneyInput(v))}
              testId="m-co-row-amount"
              inputMode="decimal"
            />
          )}

          <div className="mt-[12px] flex items-center gap-[8px]">
            <button
              type="button"
              data-testid="m-co-save-row"
              disabled={busy || !online}
              onClick={save}
              className="flex h-[44px] flex-1 items-center justify-center rounded-[10px] border border-m6m-border text-[14px] font-semibold text-m6m-navy disabled:opacity-40"
            >
              Save row
            </button>
            <button
              type="button"
              data-testid="m-co-delete-row"
              aria-label={`Delete ${row.name}`}
              disabled={busy || !online}
              onClick={() => write(() => deleteCoLineRow(row.id), { reprice: true })}
              className="flex h-[44px] w-11 shrink-0 items-center justify-center rounded-[10px] border border-m6m-danger-border text-m6m-danger disabled:opacity-40"
            >
              ✕
            </button>
          </div>
        </div>
      ) : null}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Adding a row. The fields shown follow the type, for the same CHECK-constraint
// reason as above — and `createCoLineRow` builds the payload with only the
// valid columns non-null, so this form must not send the others.
//
// `total` is deliberately NOT set: rowInsertPayload leaves it to
// recalculateChangeOrderTotals, which `write({ reprice: true })` invokes.
// ---------------------------------------------------------------------------
function NewRowForm({
  lineItemId,
  rowType,
  sortOrder,
  busy,
  online,
  write,
  onDone,
}: {
  lineItemId: string;
  rowType: CoRowType;
  sortOrder: number;
  busy: boolean;
  online: boolean;
  write: (
    action: () => Promise<{ success: boolean; error?: string }>,
    opts: { reprice: boolean }
  ) => Promise<void>;
  onDone: () => void;
}) {
  const [name, setName] = useState('');
  const [rate, setRate] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unitCost, setUnitCost] = useState('');
  const [amount, setAmount] = useState('');

  const ready =
    name.trim() !== '' &&
    (rowType === 'labor'
      ? num(rate) !== null && num(quantity) !== null
      : rowType === 'material' || rowType === 'allowance'
        ? num(unitCost) !== null && num(quantity) !== null
        : num(amount) !== null);

  return (
    <div data-testid="m-co-new-row" data-row-type={rowType} className="mt-[10px]">
      <TextField label="Name" value={name} onChange={setName} testId="m-co-new-row-name" required />

      {rowType === 'labor' ? (
        <>
          <TextField
            label="Rate"
            value={rate}
            onChange={(v) => setRate(moneyInput(v))}
            testId="m-co-new-row-rate"
            inputMode="decimal"
            required
          />
          <TextField
            label="Hours"
            value={quantity}
            onChange={(v) => setQuantity(moneyInput(v))}
            testId="m-co-new-row-quantity"
            inputMode="decimal"
            required
          />
        </>
      ) : rowType === 'material' || rowType === 'allowance' ? (
        <>
          <TextField
            label="Unit cost"
            value={unitCost}
            onChange={(v) => setUnitCost(moneyInput(v))}
            testId="m-co-new-row-unit-cost"
            inputMode="decimal"
            required
          />
          <TextField
            label="Quantity"
            value={quantity}
            onChange={(v) => setQuantity(moneyInput(v))}
            testId="m-co-new-row-quantity"
            inputMode="decimal"
            required
          />
        </>
      ) : (
        <TextField
          label="Amount"
          value={amount}
          onChange={(v) => setAmount(moneyInput(v))}
          testId="m-co-new-row-amount"
          inputMode="decimal"
          required
        />
      )}

      {/* A negative value is a CREDIT and is a normal row, not a special case
          (D-2). The minus sign is kept by `moneyInput` on purpose. */}
      <p className="mt-[6px] text-[12px] text-m6m-muted">A negative value records a credit.</p>

      <SecondaryButton
        label="Add row"
        testId="m-co-save-new-row"
        disabled={busy || !online || !ready}
        onClick={() =>
          write(
            async () => {
              const r = await createCoLineRow({
                line_item_id: lineItemId,
                row_type: rowType,
                name: name.trim(),
                sort_order: sortOrder,
                markup_percent: null,
                // apply_tax and unit_of_measure/labor_unit are OMITTED, not
                // nulled: `rowInsertPayload` applies the per-type defaults the
                // DB CHECK expects — labor never taxed, material taxed and
                // 'each', sub/other opt-in. Passing null here would override a
                // default with an invalid value on a NOT NULL column.
                rate: rowType === 'labor' ? num(rate) : null,
                quantity:
                  rowType === 'labor' || rowType === 'material' || rowType === 'allowance'
                    ? num(quantity)
                    : null,
                unit_cost: rowType === 'material' || rowType === 'allowance' ? num(unitCost) : null,
                amount: rowType === 'subcontractor' || rowType === 'other' ? num(amount) : null,
                subcontractor_id: null,
              });
              if (r.success) onDone();
              return r;
            },
            { reprice: true }
          )
        }
      />
    </div>
  );
}
