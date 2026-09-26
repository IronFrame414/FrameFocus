'use client';

import { useCallback, useEffect, useState } from 'react';
import { GripVertical, Plus, Trash2 } from 'lucide-react';
import {
  DiscountType,
  EstimateCategory,
  EstimateLineItem,
  EstimateLineRow,
  EstimateSubcategory,
  LaborUnit,
  MaterialUnitOfMeasure,
  RowType,
} from '@/lib/services/estimates-client';
import {
  createEstimateCategory,
  createEstimateLineItem,
  createEstimateLineRow,
  createEstimateSubcategory,
  deleteEstimateCategory,
  deleteEstimateLineItem,
  deleteEstimateLineRow,
  deleteEstimateSubcategory,
  getCompanyDefaultLaborRate,
  getCompanyMarginTarget,
  recalculateEstimateTotals,
  reorderEstimateLines,
  reorderEstimateLineRows,
  updateEstimateCategory,
  updateEstimateLineItem,
  updateEstimateLineRow,
  updateEstimateSubcategory,
} from '@/lib/services/estimate-items-client';
import {
  addInstrumentRate,
  listInstrumentRatesClient,
  rateInForce,
  type InstrumentRate,
  type InstrumentRateType,
} from '@/lib/services/instrument-rates-client';
import type { CostCatalogItem } from '@/lib/services/cost-catalog-client';
import {
  laborUnitLabels,
  laborUnits,
  materialUnitsOfMeasure,
} from '@framefocus/shared/validation/estimate-items';
import {
  planLineMove,
  planRowMove,
  rowsInOrder,
  stepDestination,
  stepRow,
  type LineDestination,
} from '@/lib/estimate-line-order';
import {
  backsolveMarkupPercent,
  computeRowCost,
  roundMoney,
} from '@framefocus/shared/utils/estimate-totals';
import { companyToday } from '@framefocus/shared/utils/dates';
import { InlineNumber, InlineText } from '../inline-edit';
import { UNIT_LABELS, fmtMoney, fmtPercent } from '../labels';
import { CatalogPicker } from './catalog-picker';
import { useConfirm } from '@/components/confirm/confirm-provider';
import { EstimateHealthStrip } from './estimate-health-panel';
import { AddItemsSheet } from './add-items-sheet';
import { font } from '@/lib/theme';
import type { TabProps } from './estimate-builder';

type Result = { success: boolean; error?: string };

const smallButton: React.CSSProperties = {
  padding: '0.25rem 0.625rem',
  fontSize: '0.75rem',
  backgroundColor: '#f4f6fa',
  border: '1px solid #d5dae4',
  borderRadius: '0.25rem',
  cursor: 'pointer',
};

// S108 Spec B ruling #3 — the design's button set: heavier weight and larger
// text than live. Module-local, like smallButton — nothing outside this file
// imports them (FILL-B1 / ASK-B5), so no other screen changes.
const actionBase: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.35rem',
  padding: '0.45rem 0.85rem',
  fontSize: '0.8125rem',
  fontWeight: 700,
  lineHeight: 1.2,
  borderRadius: '8px',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};
/** Filled indigo — the category header's "Add Items". */
const primaryButton: React.CSSProperties = {
  ...actionBase,
  color: '#fff',
  backgroundColor: '#3b4ae0',
  border: '1px solid #3b4ae0',
};
/** Outlined — "+ Subcategory", "+ Add Line". */
const secondaryButton: React.CSSProperties = {
  ...actionBase,
  fontWeight: 600,
  color: '#0f1729',
  backgroundColor: '#fff',
  border: '1px solid #d5dae4',
};
/** Ghost indigo — the in-section / in-subcategory "Add items". */
const ghostButton: React.CSSProperties = {
  ...actionBase,
  fontWeight: 600,
  color: '#3b4ae0',
  backgroundColor: '#f2f4ff',
  border: '1px solid #dbe0fb',
};

/** The red-outlined square trash (ruling #2). Replaces the 🗑 emoji, which
 *  rendered small and orange-tinted. `size` is the square's edge in px. */
function TrashButton({
  label,
  onClick,
  size = 32,
}: {
  label: string;
  onClick: () => void;
  size?: number;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: `${size}px`,
        height: `${size}px`,
        flexShrink: 0,
        padding: 0,
        color: '#c0362c',
        backgroundColor: '#fff',
        border: '1px solid #f1c4bf',
        borderRadius: '8px',
        cursor: 'pointer',
      }}
    >
      <Trash2 size={Math.round(size * 0.47)} strokeWidth={2} aria-hidden />
    </button>
  );
}
const rowLabel: React.CSSProperties = { color: '#7b8699', fontSize: '0.8125rem' };
const selectStyle: React.CSSProperties = {
  padding: '0.125rem 0.25rem',
  fontSize: '0.8125rem',
  border: '1px solid #d5dae4',
  borderRadius: '0.25rem',
};
// 9b — the numeric typeface rule: money/qty/% render in IBM Plex Mono so digits
// are tabular and line up down each column. Applied by WRAPPING the numeric
// InlineNumber (its display span and input both inherit fontFamily), never by
// touching the field's props — and never on the whole cell, so sibling buttons,
// unit selects and the "allowance"/"WINNER" labels stay in the body typeface.
const monoNum: React.CSSProperties = { fontFamily: font.mono };

const ROW_TYPE_LABELS: Record<RowType, string> = {
  labor: 'Labor',
  material: 'Material',
  subcontractor: 'Sub',
  other: 'Other',
  allowance: 'Allowance',
};

const ROW_TYPE_DEFAULT_NAME: Record<RowType, string> = {
  labor: 'Labor',
  material: 'New material',
  subcontractor: 'Subcontractor',
  other: 'Other cost',
  allowance: 'Allowance',
};

// 9b — coloured type badge (short mono label). Matches the handoff palette:
// labor blue, material green, allowance amber, subcontractor purple, other grey.
const ROW_TYPE_BADGE: Record<RowType, { label: string; fg: string; bg: string }> = {
  labor: { label: 'LABOR', fg: '#3b4ae0', bg: '#e8ecfb' },
  material: { label: 'MATL', fg: '#1f8f4e', bg: '#e6f0e9' },
  allowance: { label: 'ALLOW', fg: '#b45309', bg: '#f6ecdd' },
  subcontractor: { label: 'SUB', fg: '#5b45c4', bg: '#ede9f8' },
  other: { label: 'OTHER', fg: '#5c6784', bg: '#eef1f6' },
};

export function ItemsTab({ data, canEdit, reload, companyTimeZone }: TabProps) {
  const { estimate, categories, subcategories, lineItems, rows } = data;
  const [error, setError] = useState<string | null>(null);
  // PO module 17 — the batch add sheet (R8). Draft-only, like every write here.
  const [sheetOpen, setSheetOpen] = useState(false);
  // #4/9b — where the add-items sheet was opened from. categoryId pre-targets that
  // category's first section; lineItemId pre-targets a specific section. null/none
  // = the top-level button (first section overall).
  const [sheetCategoryId, setSheetCategoryId] = useState<string | null>(null);
  const [sheetLineItemId, setSheetLineItemId] = useState<string | null>(null);
  function openAddItems(opts?: { categoryId?: string | null; lineItemId?: string | null }) {
    setSheetCategoryId(opts?.categoryId ?? null);
    setSheetLineItemId(opts?.lineItemId ?? null);
    setSheetOpen(true);
  }
  const [pickerForRow, setPickerForRow] = useState<EstimateLineRow | null>(null);
  const [defaultLaborRate, setDefaultLaborRate] = useState<number | null>(null);
  // 9b — category collapse. PRESENTATIONAL only, persists nothing (the subtotal
  // rides the header so it survives collapse). Not an autosave concern.
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggleCollapsed = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  // 9b (§2) — Collapse all / Expand all. Presentational; uses the same Set.
  const allCollapsed = categories.length > 0 && categories.every((c) => collapsed.has(c.id));
  const toggleCollapseAll = () =>
    setCollapsed(allCollapsed ? new Set() : new Set(categories.map((c) => c.id)));
  const confirm = useConfirm();

  // 9b — "Find a line…" (§2). PRESENTATIONAL filter only; no persistence. A
  // section shows if its own name matches, or any of its rows' names do.
  const [findQuery, setFindQuery] = useState('');
  const findQ = findQuery.trim().toLowerCase();
  function sectionMatches(line: EstimateLineItem): boolean {
    if (!findQ) return true;
    if (line.name.toLowerCase().includes(findQ)) return true;
    return rows.some(
      (r) => r.line_item_id === line.id && (r.name ?? '').toLowerCase().includes(findQ)
    );
  }

  useEffect(() => {
    getCompanyDefaultLaborRate().then(setDefaultLaborRate);
    getCompanyMarginTarget().then(setMarginTarget);
  }, []);

  // S108 Spec B #4 — the strip's "N pts under target" note. null = no target.
  const [marginTarget, setMarginTarget] = useState<number | null>(null);

  // ── S108 Spec B #5 — drag-reorder of LINES, within and across categories ──
  // Native HTML5 drag-and-drop (no library is installed; FILL-B10), started
  // ONLY from the grab handle. Native DnD has no keyboard path and no touch
  // support in mobile Safari, so the handle is also a focusable button that
  // ArrowUp/ArrowDown move one step — the keyboard AND touch alternative —
  // announced through the aria-live region below.
  //
  // The plan is pure (lib/estimate-line-order.ts) and the write is ONE atomic
  // RPC; authority stays in the database (RLS + the containment trigger).
  const [draggingLineId, setDraggingLineId] = useState<string | null>(null);
  const [dropKey, setDropKey] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const reorderEnabled = canEdit && !findQ; // a filtered list would hide neighbours

  function containerName(categoryId: string, subcategoryId: string | null): string {
    const cat = categories.find((c) => c.id === categoryId)?.name ?? 'category';
    if (!subcategoryId) return cat;
    const sub = subcategories.find((x) => x.id === subcategoryId)?.name ?? 'subcategory';
    return `${cat} › ${sub}`;
  }

  async function moveLine(lineId: string, dest: LineDestination) {
    let moves;
    try {
      moves = planLineMove(categories, subcategories, lineItems, lineId, dest);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not move that line');
      return;
    }
    if (moves.length === 0) return;
    // Order only — no pricing input changes, so no recalculation.
    const r = await mutate(() => reorderEstimateLines(estimate.id, moves), false);
    if (!r.success) {
      setError(r.error || 'Could not move that line');
      return;
    }
    const name = lineItems.find((l) => l.id === lineId)?.name ?? 'Line';
    setAnnouncement(`Moved ${name} to ${containerName(dest.categoryId, dest.subcategoryId)}.`);
  }

  function onHandleKeyDown(e: React.KeyboardEvent, lineId: string) {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    const dest = stepDestination(
      categories,
      subcategories,
      lineItems,
      lineId,
      e.key === 'ArrowUp' ? 'up' : 'down'
    );
    if (!dest) {
      setAnnouncement(e.key === 'ArrowUp' ? 'Already first.' : 'Already last.');
      return;
    }
    void moveLine(lineId, dest);
  }

  // ── S110 D1 — drag-reorder of the ROWS inside one line ──
  // Same mechanism as lines: a native-DnD grip that is also a focusable
  // button stepping with ↑/↓. A row never leaves its line — the database
  // refuses it (estimate_line_rows_containment) — so a drag over another
  // line's rows is simply not a drop target.
  const [draggingRow, setDraggingRow] = useState<{ lineId: string; rowId: string } | null>(null);
  const [rowDropKey, setRowDropKey] = useState<string | null>(null);

  function orderedRowIds(lineId: string): string[] {
    return rowsInOrder(rows.filter((r) => r.line_item_id === lineId));
  }

  async function applyRowOrder(lineId: string, rowId: string, next: string[] | null) {
    if (!next) return;
    const r = await mutate(() => reorderEstimateLineRows(lineId, next), false);
    if (!r.success) {
      setError(r.error || 'Could not move that row');
      return;
    }
    const name = rows.find((x) => x.id === rowId)?.name || 'Row';
    setAnnouncement(`Moved ${name} to position ${next.indexOf(rowId) + 1} of ${next.length}.`);
  }

  function onRowHandleKeyDown(e: React.KeyboardEvent, lineId: string, rowId: string) {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    const next = stepRow(orderedRowIds(lineId), rowId, e.key === 'ArrowUp' ? 'up' : 'down');
    if (!next) {
      setAnnouncement(e.key === 'ArrowUp' ? 'Already first.' : 'Already last.');
      return;
    }
    void applyRowOrder(lineId, rowId, next);
  }

  /** Drop-target props for a row: the upper half drops BEFORE it, the lower
   *  half AFTER it. Only a row of the SAME line is accepted. */
  function rowDropTarget(lineId: string, rowId: string) {
    if (!reorderEnabled) return {};
    const beforeOf = (e: React.DragEvent): string | null => {
      const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
      if (e.clientY < box.top + box.height / 2) return rowId;
      const ids = orderedRowIds(lineId);
      return ids[ids.indexOf(rowId) + 1] ?? null;
    };
    return {
      onDragOver: (e: React.DragEvent) => {
        if (!draggingRow || draggingRow.lineId !== lineId) return;
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'move';
        const key = `${rowId}:${beforeOf(e) === rowId ? 'before' : 'after'}`;
        if (rowDropKey !== key) setRowDropKey(key);
      },
      onDragLeave: () => {
        if (rowDropKey?.startsWith(`${rowId}:`)) setRowDropKey(null);
      },
      onDrop: (e: React.DragEvent) => {
        if (!draggingRow || draggingRow.lineId !== lineId) return;
        e.preventDefault();
        e.stopPropagation();
        const moved = draggingRow.rowId;
        const before = beforeOf(e);
        setDraggingRow(null);
        setRowDropKey(null);
        let next: string[] | null;
        try {
          next = planRowMove(orderedRowIds(lineId), moved, before);
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Could not move that row');
          return;
        }
        void applyRowOrder(lineId, moved, next);
      },
    };
  }

  /** Drop-target props for anything that accepts a dragged line. */
  function dropTarget(key: string, dest: LineDestination) {
    if (!reorderEnabled) return {};
    return {
      onDragOver: (e: React.DragEvent) => {
        if (!draggingLineId || dest.beforeLineId === draggingLineId) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (dropKey !== key) setDropKey(key);
      },
      onDragLeave: () => {
        if (dropKey === key) setDropKey(null);
      },
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const id = draggingLineId;
        setDraggingLineId(null);
        setDropKey(null);
        if (id) void moveLine(id, dest);
      },
    };
  }

  /** The "drop at the end of this list" strip, shown only while dragging. */
  function endDropZone(categoryId: string, subcategoryId: string | null) {
    if (!draggingLineId) return null;
    const key = `end:${categoryId}:${subcategoryId ?? ''}`;
    return (
      <div
        data-testid={`line-drop-end-${subcategoryId ?? categoryId}`}
        {...dropTarget(key, { categoryId, subcategoryId, beforeLineId: null })}
        style={{
          height: '28px',
          marginBottom: '10px',
          borderRadius: '10px',
          border: `1.5px dashed ${dropKey === key ? '#3b4ae0' : '#d5dae4'}`,
          background: dropKey === key ? '#f2f4ff' : 'transparent',
          fontSize: '0.72rem',
          color: '#687081',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        Drop here to move to the end of {containerName(categoryId, subcategoryId)}
      </div>
    );
  }

  // S97 corrected ruling: companies.default_labor_rate is the default CHARGE
  // rate. On a NON-FIXED instrument a new labor row's rate defaults from the
  // instrument's labor rate in force (the Details-page rate) instead; the
  // row stays a single editable number and qty × row rate drives the line
  // total — the estimate is a projection (7D invoicing bills approved hours
  // at the rate in force, 7d1 §7). Fixed-price keeps the company default.
  const contractType = estimate.contract_type;
  const nonFixed = contractType === 'cost_plus' || contractType === 'time_and_materials';
  const laborRateType: InstrumentRateType =
    contractType === 'cost_plus' ? 'cost_plus_labor_hourly' : 'tm_labor_hourly';
  // #116 [S103]: the company calendar day — NOT the UTC day. Real per-company
  // timezone threaded from the estimate page (America/New_York fallback; never UTC).
  const today = companyToday(companyTimeZone);
  const [instRates, setInstRates] = useState<InstrumentRate[]>([]);

  const refetchInstRates = useCallback(async () => {
    if (!nonFixed) return;
    setInstRates(await listInstrumentRatesClient({ estimate_id: estimate.id }));
  }, [estimate.id, nonFixed]);

  useEffect(() => {
    void refetchInstRates();
  }, [refetchInstRates]);

  const laborRateInForce = nonFixed ? rateInForce(instRates, laborRateType, today) : null;

  // 9b — aggregate "unpriced" summary for the banner. A row is unpriced when its
  // price basis is unset/zero (labor→rate, material/allowance→unit_cost,
  // sub/other→amount); an allowance with no unit_cost has "no cap". Read-only
  // from data; no write path, same signal as the per-row $0 cue.
  const rowUnpriced = (r: EstimateLineRow): boolean => {
    if (r.row_type === 'labor') return !r.rate;
    if (r.row_type === 'material' || r.row_type === 'allowance') return !r.unit_cost;
    return !r.amount;
  };
  const unpricedCount = rows.filter(rowUnpriced).length;
  const uncappedAllowances = rows.filter((r) => r.row_type === 'allowance' && !r.unit_cost).length;
  // 9b (§2) — SECTIONS that will print at $0. Read-only derivation; no write.
  const unpricedSections = lineItems.filter((l) => Number(l.total_price) === 0);

  const mode = estimate.pricing_mode;
  const modeNoun = mode === 'markup' ? 'markup' : 'margin';

  // pricing-affecting writes recompute, then everything reloads
  async function mutate(fn: () => Promise<Result>, recalc: boolean): Promise<Result> {
    setError(null);
    const result = await fn();
    if (!result.success) return result;
    if (recalc) {
      const r = await recalculateEstimateTotals(estimate.id);
      if (!r.success) return r;
    }
    await reload();
    return { success: true };
  }

  function percentValidator(value: number | null): string | null {
    if (value == null) return null;
    if (value < 0) return 'Cannot be negative';
    if (mode === 'margin' && value >= 100) return 'Margin must be below 100%';
    if (mode === 'markup' && value > 1000) return 'Markup cannot exceed 1000%';
    return null;
  }

  function estimateDefaultMarkup(rowType: RowType): number | null {
    if (rowType === 'labor') return estimate.labor_markup_percent;
    // [S170] allowance rides material's default (Q3) — same as resolveRowMarkupPercent.
    if (rowType === 'material' || rowType === 'allowance') return estimate.material_markup_percent;
    return estimate.subcontractor_markup_percent;
  }

  // S106 Part B — a row's pricing base (cost + tax), the value applyPricing/back-solve
  // operate on. Same shape computeRowPricing uses, so a total typed here back-solves to
  // exactly the markup the recompute would apply.
  function rowBase(row: EstimateLineRow): number {
    const cost = computeRowCost({
      row_type: row.row_type as RowType,
      rate: row.rate,
      quantity: row.quantity,
      unit_of_measure: row.unit_of_measure,
      unit_cost: row.unit_cost,
      amount: row.amount,
    });
    const taxable = row.row_type !== 'labor' && !!row.apply_tax;
    return cost + (taxable ? roundMoney(cost * ((estimate.tax_rate ?? 0) / 100)) : 0);
  }

  // The markup shown for a TOTAL-edited row is derived from its pinned total (markup_percent
  // is NULL by the mutual-exclusion CHECK). NULL base → no derivable markup.
  function derivedMarkup(row: EstimateLineRow): number | null {
    if (row.total_override == null) return null;
    return backsolveMarkupPercent(row.total_override, rowBase(row), mode);
  }

  async function addCategory() {
    const sortOrder =
      categories.length > 0 ? Math.max(...categories.map((c) => c.sort_order)) + 1 : 1;
    const result = await mutate(
      () =>
        createEstimateCategory({
          estimate_id: estimate.id,
          name: 'New Category',
          sort_order: sortOrder,
        }),
      false
    );
    if (!result.success) setError(result.error || 'Could not add category');
  }

  async function addSubcategory(categoryId: string) {
    const siblings = subcategories.filter((s) => s.category_id === categoryId);
    const sortOrder =
      siblings.length > 0 ? Math.max(...siblings.map((s) => s.sort_order)) + 1 : 1;
    const result = await mutate(
      () =>
        createEstimateSubcategory({
          estimate_id: estimate.id,
          category_id: categoryId,
          name: 'New Subcategory',
          sort_order: sortOrder,
        }),
      false
    );
    if (!result.success) setError(result.error || 'Could not add subcategory');
  }

  async function addLine(categoryId: string, subcategoryId: string | null) {
    const sortOrder =
      lineItems.length > 0 ? Math.max(...lineItems.map((l) => l.sort_order)) + 1 : 1;
    const result = await mutate(
      () =>
        createEstimateLineItem({
          estimate_id: estimate.id,
          category_id: categoryId,
          subcategory_id: subcategoryId,
          name: 'New line',
          sort_order: sortOrder,
        }),
      true
    );
    if (!result.success) setError(result.error || 'Could not add line item');
  }

  async function addRow(lineItemId: string, rowType: RowType) {
    // S97 corrected ruling: a new labor row's rate defaults from the
    // instrument's labor rate in force on non-fixed instruments, from the
    // company default charge rate on fixed-price. With no instrument labor
    // rate at all, prompt for one (it lands as the contract's labor rate,
    // effective today, exactly as the Details page writes it).
    let laborRowRate = nonFixed ? laborRateInForce : defaultLaborRate;
    if (rowType === 'labor' && nonFixed && laborRateInForce == null) {
      const entered = window.prompt(
        'No labor rate in force for this contract. Enter the labor rate ($/man-hour) — it becomes the contract labor rate (effective today) and can be renegotiated on the Details page:'
      );
      if (entered === null) return; // cancelled — no row without a rate
      const parsed = Number(entered.trim());
      if (entered.trim() === '' || Number.isNaN(parsed) || parsed < 0) {
        setError('Enter a labor rate of zero or more.');
        return;
      }
      const saved = await addInstrumentRate({ estimate_id: estimate.id }, laborRateType, parsed);
      if (!saved.success) {
        setError(saved.error || 'Could not save the labor rate');
        return;
      }
      await refetchInstRates();
      laborRowRate = parsed;
    }

    const lineRows = rows.filter((r) => r.line_item_id === lineItemId);
    const sortOrder =
      lineRows.length > 0 ? Math.max(...lineRows.map((r) => r.sort_order)) + 1 : 0;

    const base = {
      line_item_id: lineItemId,
      row_type: rowType,
      name: ROW_TYPE_DEFAULT_NAME[rowType],
      sort_order: sortOrder,
      markup_percent: null,
    };

    const input =
      rowType === 'labor'
        ? { ...base, apply_tax: false, rate: laborRowRate ?? 0, quantity: 1, labor_unit: 'hours' as LaborUnit }
        : rowType === 'material' || rowType === 'allowance'
          ? { ...base, apply_tax: true, unit_of_measure: 'each' as MaterialUnitOfMeasure, unit_cost: 0, quantity: 1 }
          : { ...base, apply_tax: false, amount: 0 };

    const result = await mutate(() => createEstimateLineRow(input), true);
    if (!result.success) setError(result.error || 'Could not add row');
  }

  async function fillFromCatalog(row: EstimateLineRow, item: CostCatalogItem) {
    setPickerForRow(null);
    const result = await mutate(
      () =>
        updateEstimateLineRow(row.id, {
          catalog_item_id: item.id,
          name: item.name,
          unit_of_measure: item.unit_of_measure,
          unit_cost: item.unit_cost,
          quantity: 1,
        }),
      true
    );
    if (!result.success) setError(result.error || 'Could not apply catalog item');
  }

  // ── Row renderers ──

  // 4D-rev3: the former single "Detail" cell is split into Price + Qty.
  // Price = unit price (rate / unit_cost / amount); Qty = quantity (+ unit).

  function rowPriceCell(row: EstimateLineRow) {
    if (row.row_type === 'labor') {
      return (
        <span style={monoNum}>
          <InlineNumber
            value={row.rate}
            disabled={!canEdit}
            format={fmtMoney}
            validate={(v) => (v == null || v < 0 ? 'Rate ≥ 0' : null)}
            onSave={(v) => mutate(() => updateEstimateLineRow(row.id, { rate: v }), true)}
          />
        </span>
      );
    }

    if (row.row_type === 'material' || row.row_type === 'allowance') {
      // [S170] allowance is its own row type with a real quantity. _Superseded
      // UX (4D §4.14), quoted not deleted: "quantity field hides; unit_cost
      // relabels to Allowance amount."_ The catalog picker stays material-only:
      // estimate_line_rows_type_columns forbids catalog_item_id on an allowance.
      const isAllowance = row.row_type === 'allowance';
      return (
        <span style={{ display: 'inline-flex', gap: '0.375rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={monoNum}>
            <InlineNumber
              value={row.unit_cost}
              disabled={!canEdit}
              format={fmtMoney}
              validate={(v) => (v == null || v < 0 ? 'Cost ≥ 0' : null)}
              onSave={(v) =>
                v == null
                  ? Promise.resolve({ success: false, error: 'Required' })
                  : mutate(() => updateEstimateLineRow(row.id, { unit_cost: v }), true)
              }
            />
          </span>
          {isAllowance && (
            <span style={{ fontSize: '0.625rem', color: '#b45309' }} title="Client-selected later; budgeted at qty × cost">
              allowance
            </span>
          )}
          {canEdit && !isAllowance && (
            <button
              type="button"
              onClick={() => setPickerForRow(row)}
              style={smallButton}
              title="Fill from cost catalog"
            >
              Catalog
            </button>
          )}
        </span>
      );
    }

    // subcontractor / other — single amount
    return (
      <span style={{ display: 'inline-flex', gap: '0.375rem', alignItems: 'center' }}>
        <span style={monoNum}>
          <InlineNumber
            value={row.amount}
            disabled={!canEdit}
            format={fmtMoney}
            validate={(v) => (v == null || v < 0 ? 'Amount ≥ 0' : null)}
            onSave={(v) =>
              v == null
                ? Promise.resolve({ success: false, error: 'Required' })
                : mutate(() => updateEstimateLineRow(row.id, { amount: v }), true)
            }
          />
        </span>
        {row.row_type === 'subcontractor' && row.subcontractor_id && (
          <span
            style={{
              fontSize: '0.625rem',
              fontWeight: 700,
              color: '#1f8f4e',
              backgroundColor: '#e6f0e9',
              padding: '0.0625rem 0.375rem',
              borderRadius: '9999px',
            }}
            title="Winning bid selected in the Bidding tab"
          >
            WINNER
          </span>
        )}
      </span>
    );
  }

  function rowQtyCell(row: EstimateLineRow) {
    if (row.row_type === 'labor') {
      return (
        <span style={{ display: 'inline-flex', gap: '0.375rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={monoNum}>
            <InlineNumber
              value={row.quantity}
              disabled={!canEdit}
              validate={(v) => (v == null || v < 0 ? 'Qty ≥ 0' : null)}
              onSave={(v) => mutate(() => updateEstimateLineRow(row.id, { quantity: v }), true)}
            />
          </span>
          <select
            value={row.labor_unit ?? 'hours'}
            disabled={!canEdit}
            onChange={async (e) => {
              const unit = e.target.value as LaborUnit;
              // S108 ASK-B2 → A: NO rate prefill for square feet. A new labor
              // row is prefilled with an HOURLY rate (company default, or the
              // instrument's labor rate on a non-fixed contract). Carried onto
              // a per-square-foot row it is a wrong number nobody typed, so a
              // switch to sq ft BLANKS a rate that still equals that prefill —
              // the row then reads as unpriced, which is honest. A rate the
              // user entered themselves is kept.
              const prefill = nonFixed ? laborRateInForce : defaultLaborRate;
              const blankRate =
                unit === 'sq_ft' && prefill != null && row.rate != null && Number(row.rate) === Number(prefill);
              const r = await mutate(
                () =>
                  updateEstimateLineRow(
                    row.id,
                    blankRate ? { labor_unit: unit, rate: null } : { labor_unit: unit }
                  ),
                true
              );
              if (!r.success) setError(r.error || 'Save failed');
            }}
            style={selectStyle}
          >
            {/* S108 #6 — the SHARED list (hours · days · sq ft), the same one
                both change-order editors offer (PARITY, ASK-B6). */}
            {laborUnits.map((u) => (
              <option key={u} value={u}>
                {laborUnitLabels[u]}
              </option>
            ))}
          </select>
        </span>
      );
    }

    if (row.row_type === 'material' || row.row_type === 'allowance') {
      return (
        <span style={{ display: 'inline-flex', gap: '0.375rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={monoNum}>
            <InlineNumber
              value={row.quantity}
              disabled={!canEdit}
              validate={(v) => (v == null || v < 0 ? 'Qty ≥ 0' : null)}
              onSave={(v) => mutate(() => updateEstimateLineRow(row.id, { quantity: v }), true)}
            />
          </span>
          <select
            value={row.unit_of_measure ?? 'each'}
            disabled={!canEdit}
            onChange={async (e) => {
              const r = await mutate(
                () =>
                  updateEstimateLineRow(row.id, {
                    unit_of_measure: e.target.value as MaterialUnitOfMeasure,
                  }),
                true
              );
              if (!r.success) setError(r.error || 'Save failed');
            }}
            style={selectStyle}
          >
            {materialUnitsOfMeasure.map((u) => (
              <option key={u} value={u}>
                {UNIT_LABELS[u]}
              </option>
            ))}
          </select>
        </span>
      );
    }

    // subcontractor / other — no quantity
    return <span style={rowLabel}>—</span>;
  }

  function lineRowTr(row: EstimateLineRow) {
    return (
      // #3 — rule between rows.
      <tr
        key={row.id}
        data-row-id={row.id}
        {...rowDropTarget(row.line_item_id, row.id)}
        style={{
          borderBottom: '1px solid #f4f6fa',
          // S110 D1 — the insertion line while a row is dragged over this one.
          boxShadow:
            rowDropKey === `${row.id}:before`
              ? 'inset 0 3px 0 0 #3b4ae0'
              : rowDropKey === `${row.id}:after`
                ? 'inset 0 -3px 0 0 #3b4ae0'
                : undefined,
          opacity: draggingRow?.rowId === row.id ? 0.45 : 1,
        }}
      >
        <td style={{ padding: '0.25rem 0.5rem', whiteSpace: 'nowrap' }}>
          {reorderEnabled && (
            <ReorderGrip
              testId={`row-handle-${row.id}`}
              label={`Move row ${row.name || ROW_TYPE_BADGE[row.row_type].label}. Drag, or press Up or Down arrow.`}
              size={14}
              onKeyDown={(e) => onRowHandleKeyDown(e, row.line_item_id, row.id)}
              onDragStart={(e) => {
                // Not the line's drag: the card must not treat this as a line.
                e.stopPropagation();
                setDraggingRow({ lineId: row.line_item_id, rowId: row.id });
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', row.id);
                const tr = (e.currentTarget as HTMLElement).closest('tr');
                if (tr) e.dataTransfer.setDragImage(tr, 12, 12);
              }}
              onDragEnd={() => {
                setDraggingRow(null);
                setRowDropKey(null);
              }}
            />
          )}
          <span
            style={{
              fontFamily: font.mono,
              fontSize: '0.625rem',
              fontWeight: 700,
              letterSpacing: '0.05em',
              color: ROW_TYPE_BADGE[row.row_type].fg,
              backgroundColor: ROW_TYPE_BADGE[row.row_type].bg,
              padding: '0.125rem 0.4375rem',
              borderRadius: '5px',
            }}
          >
            {ROW_TYPE_BADGE[row.row_type].label}
          </span>
        </td>
        <td style={{ padding: '0.25rem 0.5rem', minWidth: '10rem' }}>
          <InlineText
            value={row.name}
            disabled={!canEdit}
            onSave={(v) =>
              v.trim()
                ? mutate(() => updateEstimateLineRow(row.id, { name: v.trim() }), false)
                : Promise.resolve({ success: false, error: 'Name required' })
            }
          />
        </td>
        <td style={{ padding: '0.25rem 0.5rem' }}>{rowPriceCell(row)}</td>
        <td style={{ padding: '0.25rem 0.5rem' }}>{rowQtyCell(row)}</td>
        <td style={{ padding: '0.25rem 0.5rem', textAlign: 'right', fontFamily: font.mono }}>
          <InlineNumber
            value={row.total_override != null ? derivedMarkup(row) : row.markup_percent}
            disabled={!canEdit}
            allowNull
            placeholder={`${estimateDefaultMarkup(row.row_type) ?? 0}`}
            format={(v) =>
              v == null ? `(${fmtPercent(estimateDefaultMarkup(row.row_type))})` : fmtPercent(v)
            }
            validate={percentValidator}
            // S106: editing the margin switches the row to margin-mode — clears the pinned
            // total (mutual exclusion) so the two definitions of "edited" never disagree.
            onSave={(v) =>
              mutate(
                () => updateEstimateLineRow(row.id, { markup_percent: v, total_override: null }),
                true
              )
            }
          />
        </td>
        <td style={{ padding: '0.25rem 0.5rem', textAlign: 'center' }}>
          {row.row_type === 'labor' ? (
            <span style={{ color: '#9aa4b8', fontSize: '0.75rem' }} title="Labor is never taxed">
              —
            </span>
          ) : (
            <input
              type="checkbox"
              checked={row.apply_tax}
              disabled={!canEdit}
              onChange={async (e) => {
                const r = await mutate(
                  () => updateEstimateLineRow(row.id, { apply_tax: e.target.checked }),
                  true
                );
                if (!r.success) setError(r.error || 'Save failed');
              }}
            />
          )}
        </td>
        <td style={{ padding: '0.25rem 0.5rem', textAlign: 'right', fontSize: '0.8125rem', fontFamily: font.mono }}>
          {/* S106 Part B — a row's total is editable: typing one pins it (total_override)
              and back-solves/clears the markup. NO ≥0 validation — a negative is a credit /
              allowance / rebate line. Clearing (blank) reverts to the computed total. */}
          <InlineNumber
            value={row.total_override}
            disabled={!canEdit}
            allowNull
            format={() => fmtMoney(row.total)}
            onSave={(v) =>
              mutate(
                () => updateEstimateLineRow(row.id, { total_override: v, markup_percent: null }),
                true
              )
            }
          />
        </td>
        <td style={{ padding: '0.25rem 0.5rem' }}>
          {canEdit && (
            <TrashButton
              label="Delete row"
              size={28}
              onClick={async () => {
                if (!(await confirm(`Remove ${ROW_TYPE_LABELS[row.row_type]} row "${row.name}"?`))) return;
                const r = await mutate(() => deleteEstimateLineRow(row.id), true);
                if (!r.success) setError(r.error || 'Delete failed');
              }}
            />
          )}
        </td>
      </tr>
    );
  }

  function discountControls(line: EstimateLineItem) {
    return (
      <span style={{ display: 'inline-flex', gap: '0.5rem', alignItems: 'center' }}>
        <select
          value={line.discount_type ?? ''}
          disabled={!canEdit}
          onChange={async (e) => {
            const value = (e.target.value || null) as DiscountType | null;
            const result = await mutate(
              () =>
                updateEstimateLineItem(line.id, {
                  discount_type: value,
                  discount_amount: value === null ? null : line.discount_amount ?? 0,
                }),
              true
            );
            if (!result.success) setError(result.error || 'Save failed');
          }}
          style={selectStyle}
        >
          <option value="">No discount</option>
          <option value="percent">Percent</option>
          <option value="fixed">Fixed</option>
        </select>
        {line.discount_type && (
          <span style={monoNum}>
            <InlineNumber
              value={line.discount_amount}
              disabled={!canEdit}
              validate={(v) => {
                if (v == null || v < 0) return '≥ 0';
                if (line.discount_type === 'percent' && v > 100) return 'Max 100%';
                return null;
              }}
              onSave={(v) =>
                mutate(() => updateEstimateLineItem(line.id, { discount_amount: v }), true)
              }
            />
          </span>
        )}
      </span>
    );
  }

  function lineItemBlock(line: EstimateLineItem) {
    if (!sectionMatches(line)) return null; // 9b Find filter
    // S110 D1 — the SAME stable order the row plan uses (sort_order, then id),
    // so a duplicated sort_order cannot render one way and plan another.
    const rowOrder = orderedRowIds(line.id);
    const lineRows = rows
      .filter((r) => r.line_item_id === line.id)
      .sort((a, b) => rowOrder.indexOf(a.id) - rowOrder.indexOf(b.id));
    const hasOverride = line.total_price_override != null;
    // #5 — a section printing at $0 is tinted amber whole-card.
    const isUnpriced = Number(line.total_price) === 0;

    // S108 #5 — the card is a drop target: a dragged line lands BEFORE it,
    // adopting this card's category and subcategory.
    const beforeKey = `before:${line.id}`;
    const isDropBefore = dropKey === beforeKey;
    const isDragging = draggingLineId === line.id;

    return (
      <div
        key={line.id}
        data-line-card={line.id}
        {...dropTarget(beforeKey, {
          categoryId: line.category_id,
          subcategoryId: line.subcategory_id,
          beforeLineId: line.id,
        })}
        style={{
          // 9b — Section card geometry (mockup: radius 14, padding 16).
          borderRadius: '14px',
          padding: '16px',
          marginBottom: '10px',
          // #5 — amber tint for an unpriced section, else the plain white card.
          border: isUnpriced ? '1.5px solid #f5cf8f' : '1px solid #e4e8ef',
          boxShadow: isDropBefore
            ? '0 -3px 0 0 #3b4ae0'
            : isUnpriced
              ? '0 0 0 4px rgba(245,165,36,.09)'
              : undefined,
          backgroundColor: isUnpriced ? '#fffdf7' : '#fff',
          opacity: isDragging ? 0.45 : 1,
        }}
      >
        {/* Line header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '0.75rem',
            marginBottom: '0.5rem',
          }}
        >
          <div
            style={{
              flex: 1,
              minWidth: 0,
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              flexWrap: 'wrap',
            }}
          >
            {/* S108 #5 — the grab handle, FAR LEFT. Drag it, or focus it and use
                ↑/↓ (the keyboard and touch alternative). */}
            {reorderEnabled && (
              <ReorderGrip
                testId={`line-handle-${line.id}`}
                label={`Move line ${line.name}. Drag, or press Up or Down arrow.`}
                onKeyDown={(e) => onHandleKeyDown(e, line.id)}
                onDragStart={(e) => {
                  setDraggingLineId(line.id);
                  e.dataTransfer.effectAllowed = 'move';
                  e.dataTransfer.setData('text/plain', line.id);
                  const card = (e.currentTarget as HTMLElement).closest('[data-line-card]');
                  if (card) e.dataTransfer.setDragImage(card, 24, 24);
                }}
                onDragEnd={() => {
                  setDraggingLineId(null);
                  setDropKey(null);
                }}
              />
            )}
            <span style={{ fontWeight: 700, fontSize: '1rem' }}>
              <InlineText
                value={line.name}
                disabled={!canEdit}
                onSave={(v) =>
                  v.trim()
                    ? mutate(() => updateEstimateLineItem(line.id, { name: v.trim() }), false)
                    : Promise.resolve({ success: false, error: 'Name required' })
                }
              />
            </span>
            {/* Step 9 — $0 rows get a visible treatment: an unpriced line will not
                contribute to the proposal total, which is nearly always an omission
                rather than an intent. Presentation only. */}
            {Number(line.total_price) === 0 && (
              <span
                title="This line has no price — it won't add to the proposal total."
                style={{
                  fontSize: '0.65rem',
                  fontWeight: 700,
                  color: '#b45309',
                  background: '#fff5e6',
                  border: '1px solid #f6d9a8',
                  borderRadius: '999px',
                  padding: '1px 7px',
                  fontFamily: font.mono,
                }}
              >
                Unpriced
              </span>
            )}
          </div>
          <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
            {/* Cost basis for a flat-priced line (S-3/§4.1) — carried to the
                project budget at conversion; never shown to the client. */}
            {hasOverride && (
              <span style={{ marginRight: '0.75rem' }}>
                <span style={rowLabel}>Cost </span>
                <span style={monoNum}>
                  <InlineNumber
                    value={line.override_cost}
                    disabled={!canEdit}
                    allowNull
                    format={(v) => (v == null ? 'not set' : fmtMoney(v))}
                    validate={(v) => (v != null && v < 0 ? '≥ 0' : null)}
                    onSave={(v) =>
                      mutate(() => updateEstimateLineItem(line.id, { override_cost: v }), false)
                    }
                  />
                </span>
              </span>
            )}
            {/* #7 — TOTAL label stacked above the figure; #5 — greyed when $0. */}
            <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', lineHeight: 1.15, verticalAlign: 'middle' }}>
              <span style={{ fontFamily: font.mono, fontSize: '9px', fontWeight: 700, letterSpacing: '.08em', color: '#687081' }}>
                TOTAL
              </span>
              <span style={{ ...monoNum, color: isUnpriced ? '#9aa4b8' : undefined }}>
                {/* S106 Part B — a line WITH rows shows a READ-ONLY total (= the sum of its
                    row totals); its total is edited per-row now, and the DB invariant
                    (20261560000000) forbids a flat total_price_override on a rowed line.
                    Only a ROWLESS flat-priced line keeps the editable line total. */}
                {lineRows.length > 0 ? (
                  fmtMoney(line.total_price)
                ) : (
                  <InlineNumber
                    value={line.total_price_override}
                    disabled={!canEdit}
                    allowNull
                    format={() => fmtMoney(line.total_price)}
                    // S106 [RULED Josh]: NO ≥0 validation — a negative typed total is
                    // DELIBERATELY legal (a credit, allowance, or rebate carried as a
                    // line). The old ≥0 was inherited from override_cost, where a cost
                    // truly cannot be negative; that justification does not transfer to
                    // a sell price. Aligned with the row-level total_override. Do NOT
                    // re-add a ≥0 check here.
                    onSave={(v) =>
                      mutate(() => updateEstimateLineItem(line.id, { total_price_override: v }), true)
                    }
                  />
                )}
              </span>
            </span>
            {hasOverride && (
              <button
                type="button"
                title="Override active — click to revert to the computed total"
                disabled={!canEdit}
                onClick={async () => {
                  const result = await mutate(
                    () => updateEstimateLineItem(line.id, { total_price_override: null }),
                    true
                  );
                  if (!result.success) setError(result.error || 'Save failed');
                }}
                style={{ ...smallButton, marginLeft: '0.375rem', color: '#b45309' }}
              >
                override ↺
              </button>
            )}
            {canEdit && (
              <span style={{ marginLeft: '0.5rem', display: 'inline-flex', verticalAlign: 'middle' }}>
                <TrashButton
                  label="Delete section"
                  onClick={async () => {
                    if (!(await confirm(`Delete line "${line.name}"?`))) return;
                    const result = await mutate(() => deleteEstimateLineItem(line.id), true);
                    if (!result.success) setError(result.error || 'Delete failed');
                  }}
                />
              </span>
            )}
          </div>
        </div>

        {/* Description */}
        <div style={{ marginBottom: '0.5rem', fontSize: '0.8125rem' }}>
          <span style={rowLabel}>Description (shown on proposal): </span>
          <InlineText
            value={line.description ?? ''}
            disabled={!canEdit}
            placeholder="Add description"
            onSave={(v) =>
              mutate(
                () => updateEstimateLineItem(line.id, { description: v.trim() || null }),
                false
              )
            }
          />
        </div>

        {/* Rows table */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '0.5rem' }}>
          <thead>
            {/* #3 — rule under the column header. */}
            <tr style={{ fontSize: '0.6875rem', color: '#7b8699', textAlign: 'left', borderBottom: '1px solid #e4e8ef' }}>
              <th style={{ padding: '0.25rem 0.5rem' }}>Type</th>
              <th style={{ padding: '0.25rem 0.5rem' }}>Name</th>
              {/* S108 ruling #1 — "Price" → "Cost": the column is the unit COST
                  (rate / unit cost / amount), before markup; the sell is Total. */}
              <th style={{ padding: '0.25rem 0.5rem' }}>Cost</th>
              <th style={{ padding: '0.25rem 0.5rem' }}>Qty</th>
              <th style={{ padding: '0.25rem 0.5rem', textAlign: 'right' }}>{modeNoun} %</th>
              <th style={{ padding: '0.25rem 0.5rem', textAlign: 'center' }}>Tax</th>
              <th style={{ padding: '0.25rem 0.5rem', textAlign: 'right' }}>Total</th>
              <th style={{ padding: '0.25rem 0.5rem' }}></th>
            </tr>
          </thead>
          <tbody>{lineRows.map(lineRowTr)}</tbody>
        </table>
        {/* 9b (§2) — section EMPTY STATE, with a jump into the add-items sheet. */}
        {/* #5 — CENTRED empty state with its own + Add items. */}
        {lineRows.length === 0 && (
          <div
            style={{
              fontSize: '0.8125rem',
              color: '#687081',
              marginBottom: '0.5rem',
              padding: '1rem',
              border: '1px dashed #d5dae4',
              borderRadius: '10px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              textAlign: 'center',
              gap: '0.6rem',
            }}
          >
            <span>
              Nothing priced here yet — labor, material, a subcontractor bid, or another cost.
            </span>
            {canEdit && (
              <button
                type="button"
                onClick={() => openAddItems({ lineItemId: line.id })}
                style={primaryButton}
              >
                <Plus size={15} aria-hidden /> Add items
              </button>
            )}
          </div>
        )}

        {/* #6 — ONE footer row: + Add items / Discount on the left, Internal notes right. */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: '1rem',
            flexWrap: 'wrap',
            alignItems: 'center',
            fontSize: '0.8125rem',
          }}
        >
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
            {/* 9b (§2) — per-section "+ Add items" (pre-targeted); "+ Add Row" stays for a blank row. */}
            {canEdit && (
              <button
                type="button"
                data-testid={`open-add-items-section-${line.id}`}
                onClick={() => openAddItems({ lineItemId: line.id })}
                style={ghostButton}
              >
                <Plus size={14} aria-hidden /> Add items
              </button>
            )}
            {canEdit && addRowDropdown(line.id)}
            <span>
              <span style={rowLabel}>Discount </span>
              {discountControls(line)}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', minWidth: 0 }}>
            <span style={rowLabel}>Internal notes</span>
            <InlineText
              value={line.notes ?? ''}
              disabled={!canEdit}
              placeholder="Add a note — never on the proposal"
              onSave={(v) =>
                mutate(() => updateEstimateLineItem(line.id, { notes: v.trim() || null }), false)
              }
            />
          </div>
        </div>
      </div>
    );
  }

  function addRowDropdown(lineItemId: string) {
    return (
      <select
        value=""
        onChange={(e) => {
          const v = e.target.value as RowType | '';
          if (v) addRow(lineItemId, v);
          e.target.value = '';
        }}
        style={{ ...smallButton, appearance: 'auto' }}
      >
        <option value="">+ Add Row…</option>
        <option value="labor">Labor (rate × qty)</option>
        <option value="material">Material</option>
        <option value="allowance">Allowance (client selects later)</option>
        <option value="subcontractor">Subcontractor</option>
        <option value="other">Other (permit, fee…)</option>
      </select>
    );
  }

  function addLineButton(categoryId: string, subcategoryId: string | null) {
    return (
      // ⚠️ "+ Add Line" STAYS [RULED]. The design mockup omits it; its removal
      // was requested and WITHDRAWN — Josh wants material and labor rows
      // together in one line. The ruling wins over the mockup.
      <button type="button" onClick={() => addLine(categoryId, subcategoryId)} style={secondaryButton}>
        + Add Line
      </button>
    );
  }

  function subcategoryBlock(sub: EstimateSubcategory) {
    const lines = lineItems.filter((l) => l.subcategory_id === sub.id);
    // 9b Find filter — hide a subcategory with no matching section during a search.
    if (findQ && !lines.some(sectionMatches)) return null;
    // 9b — subcategory subtotal (Σ its sections). Read-only derivation; no write.
    const subSubtotal = lines.reduce((s, l) => s + Number(l.total_price ?? 0), 0);
    return (
      <div key={sub.id} style={{ marginLeft: '1.25rem', marginBottom: '0.75rem' }}>
        {/* #2 — lighter TINTED subcategory bar; name + subtotal left, actions right. */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '0.75rem',
            marginBottom: '0.5rem',
            flexWrap: 'wrap',
            padding: '8px 12px',
            background: '#fbfcfe',
            border: '1px solid #eef1f6',
            borderRadius: '10px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap', minWidth: 0 }}>
            <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>
              <InlineText
                value={sub.name}
                disabled={!canEdit}
                onSave={(v) =>
                  v.trim()
                    ? mutate(() => updateEstimateSubcategory(sub.id, { name: v.trim() }), false)
                    : Promise.resolve({ success: false, error: 'Name required' })
                }
              />
            </span>
            <span
              style={{
                fontFamily: font.mono,
                fontSize: '0.72rem',
                fontWeight: 600,
                color: '#5c6784',
                background: '#fff',
                border: '1px solid #dde3ee',
                padding: '2px 8px',
                borderRadius: '20px',
              }}
            >
              {fmtMoney(subSubtotal)}
            </span>
          </div>
          {canEdit && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0, flexWrap: 'wrap' }}>
              {/* 9b (§2) — add catalog items straight into this subcategory (its
                  first section). Shown only when it has a section to receive them. */}
              {lines.length > 0 && (
                <button
                  type="button"
                  data-testid={`open-add-items-sub-${sub.id}`}
                  onClick={() => openAddItems({ lineItemId: lines[0].id })}
                  style={ghostButton}
                >
                  <Plus size={14} aria-hidden /> Add items
                </button>
              )}
              {addLineButton(sub.category_id, sub.id)}
              <TrashButton
                label="Delete subcategory"
                onClick={async () => {
                  if (
                    !(await confirm(
                      `Delete subcategory "${sub.name}"? Its line items move up to the category.`
                    ))
                  ) {
                    return;
                  }
                  const result = await mutate(() => deleteEstimateSubcategory(sub.id), true);
                  if (!result.success) setError(result.error || 'Delete failed');
                }}
              />
            </div>
          )}
        </div>
        {lines.map(lineItemBlock)}
        {endDropZone(sub.category_id, sub.id)}
      </div>
    );
  }

  function categoryBlock(category: EstimateCategory) {
    const subs = subcategories.filter((s) => s.category_id === category.id);
    const directLines = lineItems.filter(
      (l) => l.category_id === category.id && l.subcategory_id == null
    );
    // 9b Find filter — hide a category with no matching section anywhere in it.
    if (findQ && !lineItems.some((l) => l.category_id === category.id && sectionMatches(l)))
      return null;
    // 9b — category subtotal = Σ of every line's total in the category (direct
    // AND subcategory lines carry category_id). It renders ON THE HEADER so it
    // survives collapse. Read-only derivation from data; no write.
    const catTotal = lineItems
      .filter((l) => l.category_id === category.id)
      .reduce((s, l) => s + Number(l.total_price ?? 0), 0);
    const isCollapsed = collapsed.has(category.id);

    return (
      <div
        key={category.id}
        style={{
          // 9b — Category card geometry, aligned with the Section cards.
          border: '1px solid #e4e8ef',
          borderRadius: '14px',
          padding: '16px',
          marginBottom: '14px',
          backgroundColor: '#fbfcfe',
        }}
      >
        {/* #1 — full-width TINTED category bar; identity on the left, actions
            right-aligned. */}
        <div
          {...dropTarget(`head:${category.id}`, {
            categoryId: category.id,
            subcategoryId: null,
            beforeLineId: null,
          })}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '0.75rem',
            flexWrap: 'wrap',
            outline: dropKey === `head:${category.id}` ? '2px solid #3b4ae0' : undefined,
            margin: isCollapsed ? '-16px' : '-16px -16px 12px',
            padding: '10px 16px',
            background: '#eef1f6',
            borderRadius: isCollapsed ? '14px' : '14px 14px 0 0',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap', minWidth: 0 }}>
            <button
              type="button"
              onClick={() => toggleCollapsed(category.id)}
              aria-label={isCollapsed ? 'Expand category' : 'Collapse category'}
              style={{
                border: 'none',
                background: 'none',
                cursor: 'pointer',
                padding: '0 0.25rem 0 0',
                color: '#687081',
                fontSize: '0.75rem',
                lineHeight: 1,
              }}
            >
              {isCollapsed ? '▸' : '▾'}
            </button>
            <span style={{ fontWeight: 700, fontSize: '1rem' }}>
              <InlineText
                value={category.name}
                disabled={!canEdit}
                onSave={(v) =>
                  v.trim()
                    ? mutate(() => updateEstimateCategory(category.id, { name: v.trim() }), false)
                    : Promise.resolve({ success: false, error: 'Name required' })
                }
              />
            </span>
            <span
              style={{
                fontFamily: font.mono,
                fontSize: '0.75rem',
                fontWeight: 600,
                color: '#5c6784',
                background: '#fff',
                border: '1px solid #dde3ee',
                padding: '3px 9px',
                borderRadius: '20px',
              }}
            >
              {fmtMoney(catTotal)}
            </span>
            {/* 9b (§2) — category count line. */}
            <span style={{ fontSize: '0.72rem', color: '#687081' }}>
              {subs.length} subcategor{subs.length === 1 ? 'y' : 'ies'} ·{' '}
              {lineItems.filter((l) => l.category_id === category.id).length} section
              {lineItems.filter((l) => l.category_id === category.id).length === 1 ? '' : 's'}
            </span>
          </div>
          {canEdit && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0, flexWrap: 'wrap' }}>
              {/* #4 — add catalog items straight into this category. Shown only
                  when the category has a section to receive them; the sheet
                  pre-targets that section (adjustable in step 2). */}
              {lineItems.some((l) => l.category_id === category.id) && (
                // S108 ruling #3 — the FILLED indigo primary.
                <button
                  type="button"
                  data-testid={`open-add-items-${category.id}`}
                  onClick={() => openAddItems({ categoryId: category.id })}
                  style={primaryButton}
                >
                  <Plus size={15} aria-hidden /> Add Items
                </button>
              )}
              {/* S108 ruling #3 — shortened from "+ Add Subcategory"; outlined secondary. */}
              <button type="button" onClick={() => addSubcategory(category.id)} style={secondaryButton}>
                + Subcategory
              </button>
              {addLineButton(category.id, null)}
              <TrashButton
                label="Delete category"
                size={34}
                onClick={async () => {
                  if (
                    !(await confirm(
                      `Delete category "${category.name}" and everything in it? This cannot be undone.`
                    ))
                  ) {
                    return;
                  }
                  const result = await mutate(() => deleteEstimateCategory(category.id), true);
                  if (!result.success) setError(result.error || 'Delete failed');
                }}
              />
            </div>
          )}
        </div>
        {!isCollapsed && (
          <>
            {directLines.map(lineItemBlock)}
            {endDropZone(category.id, null)}
            {subs.map(subcategoryBlock)}
          </>
        )}
      </div>
    );
  }

  return (
    <div>
      {/* Step 9 — the live cost/price/margin strip (same derivation as the
          Details Health card; one implementation, two surfaces). 9b (§2): the
          "Find a line…" box sits beside it — the strip itself is NOT rebuilt. */}
      {/* S108 ruling #4 — the design's metrics card, "Find a line…" inside it
          on the right. The card is still the SAME derivation as Details. */}
      <EstimateHealthStrip
        data={data}
        marginTarget={marginTarget}
        trailing={
          <input
            value={findQuery}
            onChange={(e) => setFindQuery(e.target.value)}
            placeholder="Find a line…"
            aria-label="Find a line"
            style={{
              width: '220px',
              maxWidth: '100%',
              padding: '10px 12px',
              borderRadius: '10px',
              border: '1px solid #d5dae4',
              fontSize: '14px',
            }}
          />
        }
      />
      {/* S108 #5 — where keyboard reorders are announced. */}
      <div aria-live="polite" data-testid="line-reorder-status" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
        {announcement}
      </div>

      {/* 9b — the aggregate unpriced/no-cap banner. Read-only derivation from
          data (unpricedCount / uncappedAllowances); no write path. Complements
          the per-row "$0" cue with a job-level summary. */}
      {(unpricedCount > 0 || uncappedAllowances > 0) && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.7rem',
            background: '#fff5e6',
            border: '1.5px solid #f5cf8f',
            borderRadius: '12px',
            padding: '12px 16px',
            marginBottom: '0.75rem',
            boxShadow: '0 0 0 4px rgba(245,165,36,.09)',
            fontSize: '0.8125rem',
            color: '#8a5a12',
          }}
        >
          <span aria-hidden style={{ fontSize: '1rem', lineHeight: 1 }}>
            ⚠
          </span>
          <div style={{ flex: 1 }}>
            {unpricedCount > 0 && (
              <strong style={{ fontWeight: 700 }}>
                {unpricedCount} row{unpricedCount === 1 ? '' : 's'} unpriced
              </strong>
            )}
            {unpricedCount > 0 && uncappedAllowances > 0 && ' · '}
            {uncappedAllowances > 0 && (
              <strong style={{ fontWeight: 700 }}>
                {uncappedAllowances} allowance{uncappedAllowances === 1 ? '' : 's'} with no cap
              </strong>
            )}
            {' — unpriced rows print as $0.00 on the proposal.'}
          </div>
        </div>
      )}
      {/* 9b (§2) — SECTION-level unpriced warning, with a jump per section. An
          empty section still prints, so it names each one and offers Add items. */}
      {unpricedSections.length > 0 && (
        <div
          style={{
            background: '#fff5e6',
            border: '1.5px solid #f5cf8f',
            borderRadius: '12px',
            padding: '12px 16px',
            marginBottom: '0.75rem',
            boxShadow: '0 0 0 4px rgba(245,165,36,.09)',
            fontSize: '0.8125rem',
            color: '#8a5a12',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
            <span aria-hidden style={{ fontSize: '1rem', lineHeight: 1 }}>⚠</span>
            <strong style={{ fontWeight: 700 }}>
              {unpricedSections.length} section{unpricedSections.length === 1 ? ' is' : 's are'} unpriced
            </strong>
            <span
              style={{
                fontFamily: font.mono,
                fontSize: '9px',
                fontWeight: 800,
                letterSpacing: '.08em',
                color: '#b45309',
                background: '#fffdf7',
                border: '1px solid #f3e2c4',
                borderRadius: '20px',
                padding: '1px 6px',
              }}
            >
              NEW
            </span>
          </div>
          <div style={{ marginBottom: canEdit ? '0.4rem' : 0 }}>
            An empty section still prints on the proposal — price it or remove it before you send.
          </div>
          {canEdit && (
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
              {unpricedSections.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => openAddItems({ lineItemId: s.id })}
                  style={{ ...smallButton, color: '#3b4ae0', borderColor: '#dbe0fb', background: '#f2f4ff' }}
                >
                  Add items to {s.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {/* #8 [S103] — the page-level "+ Add items" was REMOVED. Adding items
          belongs inside a category / subcategory / section (those buttons are the
          paths). `openAddItems()` with no target is still used by the sheet plumbing. */}
      {sheetOpen && (
        <AddItemsSheet
          data={data}
          reload={reload}
          initialCategoryId={sheetCategoryId ?? undefined}
          initialLineItemId={sheetLineItemId ?? undefined}
          onClose={() => setSheetOpen(false)}
        />
      )}
      {error && (
        <div
          style={{
            padding: '0.75rem 1rem',
            borderRadius: '0.375rem',
            marginBottom: '1rem',
            backgroundColor: '#fdf1f0',
            color: '#c0362c',
            fontSize: '0.875rem',
          }}
        >
          {error}
        </div>
      )}

      {categories.length === 0 ? (
        <div
          style={{
            padding: '3rem',
            textAlign: 'center',
            color: '#9aa4b8',
            border: '1px dashed #d5dae4',
            borderRadius: '0.5rem',
            fontSize: '0.875rem',
          }}
        >
          No categories yet —{' '}
          {canEdit ? (
            <button
              type="button"
              onClick={addCategory}
              style={{
                color: '#3b4ae0',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: '0.875rem',
                textDecoration: 'underline',
              }}
            >
              + Add your first category
            </button>
          ) : (
            'nothing here.'
          )}
        </div>
      ) : (
        <>
          {categories.map(categoryBlock)}
          {/* 9b (§2) — foot controls: + Add category · Collapse all. */}
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            {canEdit && (
              <button
                type="button"
                onClick={addCategory}
                style={{
                  padding: '0.5rem 1rem',
                  fontSize: '0.875rem',
                  backgroundColor: '#f4f6fa',
                  border: '1px solid #d5dae4',
                  borderRadius: '0.375rem',
                  cursor: 'pointer',
                }}
              >
                + Add Category
              </button>
            )}
            <button
              type="button"
              onClick={toggleCollapseAll}
              style={{
                padding: '0.5rem 1rem',
                fontSize: '0.875rem',
                backgroundColor: 'transparent',
                border: '1px solid #d5dae4',
                borderRadius: '0.375rem',
                cursor: 'pointer',
                color: '#5c6784',
              }}
            >
              {allCollapsed ? 'Expand all' : 'Collapse all'}
            </button>
          </div>
        </>
      )}

      {pickerForRow && (
        <CatalogPicker
          onClose={() => setPickerForRow(null)}
          onSelect={(item) => fillFromCatalog(pickerForRow, item)}
        />
      )}
    </div>
  );
}

// S108 #5 / S110 D — THE GRAB HANDLE, one component for lines and rows.
//
// ⚠️ S110 D2: IT FOCUSES ITSELF ON MOUSEDOWN. Chromium focuses a <button> on
// click; Safari and Firefox on macOS DO NOT (platform convention). The handle
// relied on the browser, so click-then-↑/↓ did nothing for Josh while S109's T2
// — run only in Chromium — asserted "focused" and passed. The test measured
// Chromium's default, not this control. Focusing explicitly makes the keyboard
// path independent of the browser; s110-grip-focus.test.ts fails if it goes.
function ReorderGrip({
  testId,
  label,
  size = 18,
  onKeyDown,
  onDragStart,
  onDragEnd,
}: {
  testId: string;
  label: string;
  size?: number;
  onKeyDown: (e: React.KeyboardEvent<HTMLButtonElement>) => void;
  onDragStart: (e: React.DragEvent<HTMLButtonElement>) => void;
  onDragEnd: () => void;
}) {
  return (
    <button
      type="button"
      draggable
      data-testid={testId}
      aria-label={label}
      title="Drag to reorder — or focus and press ↑ / ↓"
      onMouseDown={(e) => e.currentTarget.focus()}
      onKeyDown={onKeyDown}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size + 6,
        height: size + 10,
        marginLeft: '-6px',
        marginRight: size < 18 ? '2px' : 0,
        padding: 0,
        border: 'none',
        borderRadius: '6px',
        background: 'transparent',
        color: '#9aa4b8',
        cursor: 'grab',
        verticalAlign: 'middle',
      }}
    >
      <GripVertical size={size} aria-hidden />
    </button>
  );
}
