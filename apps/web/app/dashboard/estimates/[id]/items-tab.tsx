'use client';

import { useEffect, useState } from 'react';
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
import type { CostCatalogItem } from '@/lib/services/cost-catalog-client';
import { materialUnitsOfMeasure } from '@framefocus/shared/validation/estimate-items';
import { InlineNumber, InlineText } from '../inline-edit';
import { UNIT_LABELS, fmtMoney, fmtPercent } from '../labels';
import { CatalogPicker } from './catalog-picker';
import type { TabProps } from './estimate-builder';

type Result = { success: boolean; error?: string };

const smallButton: React.CSSProperties = {
  padding: '0.25rem 0.625rem',
  fontSize: '0.75rem',
  backgroundColor: '#f3f4f6',
  border: '1px solid #d1d5db',
  borderRadius: '0.25rem',
  cursor: 'pointer',
};
const dangerButton: React.CSSProperties = { ...smallButton, color: '#991b1b' };
const rowLabel: React.CSSProperties = { color: '#6b7280', fontSize: '0.8125rem' };
const selectStyle: React.CSSProperties = {
  padding: '0.125rem 0.25rem',
  fontSize: '0.8125rem',
  border: '1px solid #d1d5db',
  borderRadius: '0.25rem',
};

const ROW_TYPE_LABELS: Record<RowType, string> = {
  labor: 'Labor',
  material: 'Material',
  subcontractor: 'Sub',
  other: 'Other',
};

const ROW_TYPE_DEFAULT_NAME: Record<RowType, string> = {
  labor: 'Labor',
  material: 'New material',
  subcontractor: 'Subcontractor',
  other: 'Other cost',
};

export function ItemsTab({ data, canEdit, reload }: TabProps) {
  const { estimate, categories, subcategories, lineItems, rows } = data;
  const [error, setError] = useState<string | null>(null);
  const [pickerForRow, setPickerForRow] = useState<EstimateLineRow | null>(null);
  const [defaultLaborRate, setDefaultLaborRate] = useState<number | null>(null);

  useEffect(() => {
    getCompanyDefaultLaborRate().then(setDefaultLaborRate);
  }, []);

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
    if (rowType === 'material') return estimate.material_markup_percent;
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
        ? { ...base, apply_tax: false, rate: defaultLaborRate ?? 0, quantity: 1, labor_unit: 'hours' as LaborUnit }
        : rowType === 'material'
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
        <InlineNumber
          value={row.rate}
          disabled={!canEdit}
          format={fmtMoney}
          validate={(v) => (v == null || v < 0 ? 'Rate ≥ 0' : null)}
          onSave={(v) => mutate(() => updateEstimateLineRow(row.id, { rate: v }), true)}
        />
      );
    }

    if (row.row_type === 'material') {
      const isAllowance = row.unit_of_measure === 'allowance';
      return (
        <span style={{ display: 'inline-flex', gap: '0.375rem', alignItems: 'center', flexWrap: 'wrap' }}>
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
          {isAllowance && (
            <span style={{ fontSize: '0.625rem', color: '#92400e' }}>allowance = unit cost</span>
          )}
          {canEdit && (
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
        {row.row_type === 'subcontractor' && row.subcontractor_id && (
          <span
            style={{
              fontSize: '0.625rem',
              fontWeight: 700,
              color: '#166534',
              backgroundColor: '#dcfce7',
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
          <InlineNumber
            value={row.quantity}
            disabled={!canEdit}
            validate={(v) => (v == null || v < 0 ? 'Qty ≥ 0' : null)}
            onSave={(v) => mutate(() => updateEstimateLineRow(row.id, { quantity: v }), true)}
          />
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

    if (row.row_type === 'material') {
      const isAllowance = row.unit_of_measure === 'allowance';
      return (
        <span style={{ display: 'inline-flex', gap: '0.375rem', alignItems: 'center', flexWrap: 'wrap' }}>
          {isAllowance ? (
            <span style={rowLabel} title="Allowance rows have no quantity">
              —
            </span>
          ) : (
            <InlineNumber
              value={row.quantity}
              disabled={!canEdit}
              validate={(v) => (v == null || v < 0 ? 'Qty ≥ 0' : null)}
              onSave={(v) => mutate(() => updateEstimateLineRow(row.id, { quantity: v }), true)}
            />
          )}
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
              fontSize: '0.625rem',
              fontWeight: 700,
              color: '#374151',
              backgroundColor: '#f3f4f6',
              padding: '0.0625rem 0.375rem',
              borderRadius: '9999px',
            }}
          >
            {ROW_TYPE_LABELS[row.row_type]}
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
        <td style={{ padding: '0.25rem 0.5rem', textAlign: 'right' }}>
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
            <span style={{ color: '#9ca3af', fontSize: '0.75rem' }} title="Labor is never taxed">
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
        <td style={{ padding: '0.25rem 0.5rem', textAlign: 'right', fontSize: '0.8125rem' }}>
          {fmtMoney(row.total)}
        </td>
        <td style={{ padding: '0.25rem 0.5rem' }}>
          {canEdit && (
            <button
              type="button"
              onClick={async () => {
                if (!window.confirm(`Remove ${ROW_TYPE_LABELS[row.row_type]} row "${row.name}"?`)) return;
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
          border: '1px solid #e5e7eb',
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
          </div>
          <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
            <span style={rowLabel}>Total </span>
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
                style={{ ...smallButton, marginLeft: '0.375rem', color: '#92400e' }}
              >
                override ↺
              </button>
            )}
            {canEdit && (
              <button
                type="button"
                onClick={async () => {
                  if (!window.confirm(`Delete line "${line.name}"?`)) return;
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
            <tr style={{ fontSize: '0.6875rem', color: '#6b7280', textAlign: 'left' }}>
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
          <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginBottom: '0.5rem' }}>
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
                    !window.confirm(
                      `Delete subcategory "${sub.name}"? Its line items move up to the category.`
                    )
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

    return (
      <div
        key={category.id}
        style={{
          border: '1px solid #e5e7eb',
          borderRadius: '0.5rem',
          padding: '1rem',
          marginBottom: '1rem',
          backgroundColor: '#f9fafb',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            marginBottom: '0.75rem',
            flexWrap: 'wrap',
          }}
        >
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
          {canEdit && (
            <>
              <button type="button" onClick={() => addSubcategory(category.id)} style={smallButton}>
                + Add Subcategory
              </button>
              {addLineButton(category.id, null)}
              <button
                type="button"
                onClick={async () => {
                  if (
                    !window.confirm(
                      `Delete category "${category.name}" and everything in it? This cannot be undone.`
                    )
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
        {directLines.map(lineItemBlock)}
        {subs.map(subcategoryBlock)}
      </div>
    );
  }

  return (
    <div>
      {error && (
        <div
          style={{
            padding: '0.75rem 1rem',
            borderRadius: '0.375rem',
            marginBottom: '1rem',
            backgroundColor: '#fef2f2',
            color: '#991b1b',
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
            color: '#9ca3af',
            border: '1px dashed #d1d5db',
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
                color: '#2563eb',
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
                backgroundColor: '#f3f4f6',
                border: '1px solid #d1d5db',
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
