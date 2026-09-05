'use client';

import { useCallback, useEffect, useState } from 'react';
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
  recalculateEstimateTotals,
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
import { materialUnitsOfMeasure } from '@framefocus/shared/validation/estimate-items';
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
const dangerButton: React.CSSProperties = { ...smallButton, color: '#c0362c' };
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
  // #4 — which category the add-items sheet was opened from (null = top-level
  // button; the sheet pre-targets this category's first section when set).
  const [sheetCategoryId, setSheetCategoryId] = useState<string | null>(null);
  function openAddItems(categoryId: string | null) {
    setSheetCategoryId(categoryId);
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
  const confirm = useConfirm();

  useEffect(() => {
    getCompanyDefaultLaborRate().then(setDefaultLaborRate);
  }, []);

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
              const r = await mutate(
                () => updateEstimateLineRow(row.id, { labor_unit: e.target.value as LaborUnit }),
                true
              );
              if (!r.success) setError(r.error || 'Save failed');
            }}
            style={selectStyle}
          >
            <option value="hours">hours</option>
            <option value="days">days</option>
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
      <tr key={row.id}>
        <td style={{ padding: '0.25rem 0.5rem' }}>
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
            value={row.markup_percent}
            disabled={!canEdit}
            allowNull
            placeholder={`${estimateDefaultMarkup(row.row_type) ?? 0}`}
            format={(v) =>
              v == null ? `(${fmtPercent(estimateDefaultMarkup(row.row_type))})` : fmtPercent(v)
            }
            validate={percentValidator}
            onSave={(v) => mutate(() => updateEstimateLineRow(row.id, { markup_percent: v }), true)}
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
          {fmtMoney(row.total)}
        </td>
        <td style={{ padding: '0.25rem 0.5rem' }}>
          {canEdit && (
            <button
              type="button"
              onClick={async () => {
                if (!(await confirm(`Remove ${ROW_TYPE_LABELS[row.row_type]} row "${row.name}"?`))) return;
                const r = await mutate(() => deleteEstimateLineRow(row.id), true);
                if (!r.success) setError(r.error || 'Delete failed');
              }}
              style={dangerButton}
            >
              ✕
            </button>
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
    const lineRows = rows
      .filter((r) => r.line_item_id === line.id)
      .sort((a, b) => a.sort_order - b.sort_order);
    const hasOverride = line.total_price_override != null;

    return (
      <div
        key={line.id}
        style={{
          border: '1px solid #e4e8ef',
          borderRadius: '0.375rem',
          padding: '0.75rem',
          marginBottom: '0.625rem',
          backgroundColor: '#fff',
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
            <span style={{ fontWeight: 600, fontSize: '0.9375rem' }}>
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
                Unpriced · $0
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
            <span style={rowLabel}>Total </span>
            <span style={monoNum}>
              <InlineNumber
                value={line.total_price_override}
                disabled={!canEdit}
                allowNull
                format={() => fmtMoney(line.total_price)}
                validate={(v) => (v != null && v < 0 ? '≥ 0' : null)}
                onSave={(v) =>
                  mutate(() => updateEstimateLineItem(line.id, { total_price_override: v }), true)
                }
              />
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
              <button
                type="button"
                onClick={async () => {
                  if (!(await confirm(`Delete line "${line.name}"?`))) return;
                  const result = await mutate(() => deleteEstimateLineItem(line.id), true);
                  if (!result.success) setError(result.error || 'Delete failed');
                }}
                style={{ ...dangerButton, marginLeft: '0.375rem' }}
              >
                ✕
              </button>
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
            <tr style={{ fontSize: '0.6875rem', color: '#7b8699', textAlign: 'left' }}>
              <th style={{ padding: '0.25rem 0.5rem' }}>Type</th>
              <th style={{ padding: '0.25rem 0.5rem' }}>Name</th>
              <th style={{ padding: '0.25rem 0.5rem' }}>Price</th>
              <th style={{ padding: '0.25rem 0.5rem' }}>Qty</th>
              <th style={{ padding: '0.25rem 0.5rem', textAlign: 'right' }}>{modeNoun} %</th>
              <th style={{ padding: '0.25rem 0.5rem', textAlign: 'center' }}>Tax</th>
              <th style={{ padding: '0.25rem 0.5rem', textAlign: 'right' }}>Total</th>
              <th style={{ padding: '0.25rem 0.5rem' }}></th>
            </tr>
          </thead>
          <tbody>{lineRows.map(lineRowTr)}</tbody>
        </table>
        {lineRows.length === 0 && (
          <div style={{ fontSize: '0.75rem', color: '#9aa4b8', marginBottom: '0.5rem' }}>
            No rows yet — add labor, materials, a subcontractor bid, or another cost.
          </div>
        )}

        <div
          style={{
            display: 'flex',
            gap: '1rem',
            flexWrap: 'wrap',
            alignItems: 'center',
            fontSize: '0.8125rem',
          }}
        >
          {canEdit && addRowDropdown(line.id)}
          <span>
            <span style={rowLabel}>Discount </span>
            {discountControls(line)}
          </span>
        </div>

        {/* Internal line notes */}
        <div style={{ marginTop: '0.5rem', fontSize: '0.8125rem' }}>
          <span style={rowLabel}>Internal notes: </span>
          <InlineText
            value={line.notes ?? ''}
            disabled={!canEdit}
            placeholder="Add notes (never on proposal)"
            onSave={(v) =>
              mutate(() => updateEstimateLineItem(line.id, { notes: v.trim() || null }), false)
            }
          />
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
      <button type="button" onClick={() => addLine(categoryId, subcategoryId)} style={smallButton}>
        + Add Line
      </button>
    );
  }

  function subcategoryBlock(sub: EstimateSubcategory) {
    const lines = lineItems.filter((l) => l.subcategory_id === sub.id);
    return (
      <div key={sub.id} style={{ marginLeft: '1.25rem', marginBottom: '0.75rem' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            marginBottom: '0.5rem',
          }}
        >
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
          {canEdit && (
            <>
              {addLineButton(sub.category_id, sub.id)}
              <button
                type="button"
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
                style={dangerButton}
              >
                🗑
              </button>
            </>
          )}
        </div>
        {lines.map(lineItemBlock)}
      </div>
    );
  }

  function categoryBlock(category: EstimateCategory) {
    const subs = subcategories.filter((s) => s.category_id === category.id);
    const directLines = lineItems.filter(
      (l) => l.category_id === category.id && l.subcategory_id == null
    );
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
          border: '1px solid #e4e8ef',
          borderRadius: '0.5rem',
          padding: '1rem',
          marginBottom: '1rem',
          backgroundColor: '#fbfcfe',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            marginBottom: isCollapsed ? 0 : '0.75rem',
            flexWrap: 'wrap',
          }}
        >
          <button
            type="button"
            onClick={() => toggleCollapsed(category.id)}
            aria-label={isCollapsed ? 'Expand category' : 'Collapse category'}
            style={{
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              padding: '0 0.25rem 0 0',
              color: '#8792a8',
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
              background: '#eef1f6',
              padding: '3px 9px',
              borderRadius: '20px',
            }}
          >
            {fmtMoney(catTotal)}
          </span>
          {canEdit && (
            <>
              {/* #4 — add catalog items straight into this category. Shown only
                  when the category has a section to receive them; the sheet
                  pre-targets that section (adjustable in step 2). */}
              {lineItems.some((l) => l.category_id === category.id) && (
                <button
                  type="button"
                  data-testid={`open-add-items-${category.id}`}
                  onClick={() => openAddItems(category.id)}
                  style={smallButton}
                >
                  + Add items
                </button>
              )}
              <button type="button" onClick={() => addSubcategory(category.id)} style={smallButton}>
                + Add Subcategory
              </button>
              {addLineButton(category.id, null)}
              <button
                type="button"
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
                style={dangerButton}
              >
                🗑
              </button>
            </>
          )}
        </div>
        {!isCollapsed && (
          <>
            {directLines.map(lineItemBlock)}
            {subs.map(subcategoryBlock)}
          </>
        )}
      </div>
    );
  }

  return (
    <div>
      {/* Step 9 — the live cost/price/margin strip (same derivation as the
          Details Health card; one implementation, two surfaces). */}
      <EstimateHealthStrip data={data} />

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
      {canEdit && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.75rem' }}>
          <button
            type="button"
            data-testid="open-add-items"
            onClick={() => openAddItems(null)}
            style={{
              padding: '9px 16px',
              borderRadius: '9px',
              backgroundColor: '#3b4ae0',
              color: '#fff',
              fontSize: '13px',
              fontWeight: 700,
              border: 'none',
              cursor: 'pointer',
            }}
          >
            + Add items
          </button>
        </div>
      )}
      {sheetOpen && (
        <AddItemsSheet
          data={data}
          reload={reload}
          initialCategoryId={sheetCategoryId ?? undefined}
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
