'use client';

import { useState } from 'react';
import {
  DiscountType,
  EstimateCategory,
  EstimateLineItem,
  EstimateLineMaterial,
  EstimateSubcategory,
  MaterialUnitOfMeasure,
} from '@/lib/services/estimates-client';
import {
  createEstimateCategory,
  createEstimateLineItem,
  createEstimateLineMaterial,
  createEstimateSubcategory,
  deleteEstimateCategory,
  deleteEstimateLineItem,
  deleteEstimateLineMaterial,
  deleteEstimateSubcategory,
  recalculateEstimateTotals,
  updateEstimateCategory,
  updateEstimateLineItem,
  updateEstimateLineMaterial,
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

export function ItemsTab({ data, canEdit, reload }: TabProps) {
  const { estimate, categories, subcategories, lineItems, materials } = data;
  const [error, setError] = useState<string | null>(null);
  const [pickerForMaterial, setPickerForMaterial] = useState<EstimateLineMaterial | null>(null);

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

  async function addLine(
    categoryId: string,
    subcategoryId: string | null,
    lineType: 'lump_sum' | 'detailed'
  ) {
    const sortOrder =
      lineItems.length > 0 ? Math.max(...lineItems.map((l) => l.sort_order)) + 1 : 1;
    const result = await mutate(
      () =>
        createEstimateLineItem({
          estimate_id: estimate.id,
          category_id: categoryId,
          subcategory_id: subcategoryId,
          name: lineType === 'lump_sum' ? 'New lump-sum line' : 'New detailed line',
          line_type: lineType,
          sort_order: sortOrder,
        }),
      true
    );
    if (!result.success) setError(result.error || 'Could not add line item');
  }

  async function addMaterial(lineItemId: string) {
    const result = await mutate(
      () =>
        createEstimateLineMaterial({
          line_item_id: lineItemId,
          name: 'New material',
          unit_of_measure: 'each',
          unit_cost: 0,
          quantity: 1,
          apply_tax: true,
        }),
      true
    );
    if (!result.success) setError(result.error || 'Could not add material');
  }

  async function fillFromCatalog(material: EstimateLineMaterial, item: CostCatalogItem) {
    setPickerForMaterial(null);
    const result = await mutate(
      () =>
        updateEstimateLineMaterial(material.id, {
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

  // ── Renderers ──

  function materialRow(material: EstimateLineMaterial) {
    const isAllowance = material.unit_of_measure === 'allowance';
    return (
      <tr key={material.id}>
        <td style={{ padding: '0.25rem 0.5rem' }}>
          <InlineText
            value={material.name}
            disabled={!canEdit}
            onSave={(v) =>
              v.trim()
                ? mutate(() => updateEstimateLineMaterial(material.id, { name: v.trim() }), false)
                : Promise.resolve({ success: false, error: 'Name required' })
            }
          />
          {isAllowance && (
            <span
              style={{
                marginLeft: '0.375rem',
                fontSize: '0.625rem',
                fontWeight: 700,
                color: '#92400e',
                backgroundColor: '#fef3c7',
                padding: '0.0625rem 0.375rem',
                borderRadius: '9999px',
              }}
            >
              ALLOWANCE
            </span>
          )}
        </td>
        <td style={{ padding: '0.25rem 0.5rem' }}>
          <select
            value={material.unit_of_measure}
            disabled={!canEdit}
            onChange={async (e) => {
              const unit = e.target.value as MaterialUnitOfMeasure;
              const result = await mutate(
                () => updateEstimateLineMaterial(material.id, { unit_of_measure: unit }),
                true
              );
              if (!result.success) setError(result.error || 'Save failed');
            }}
            style={{
              padding: '0.125rem 0.25rem',
              fontSize: '0.8125rem',
              border: '1px solid #d1d5db',
              borderRadius: '0.25rem',
            }}
          >
            {materialUnitsOfMeasure.map((u) => (
              <option key={u} value={u}>
                {UNIT_LABELS[u]}
              </option>
            ))}
          </select>
        </td>
        <td style={{ padding: '0.25rem 0.5rem', textAlign: 'right' }}>
          {/* Allowance UX: quantity hides; unit_cost relabels */}
          {!isAllowance && (
            <InlineNumber
              value={material.quantity}
              disabled={!canEdit}
              validate={(v) => (v == null || v < 0 ? 'Quantity ≥ 0' : null)}
              onSave={(v) =>
                mutate(() => updateEstimateLineMaterial(material.id, { quantity: v }), true)
              }
            />
          )}
        </td>
        <td style={{ padding: '0.25rem 0.5rem', textAlign: 'right' }}>
          <InlineNumber
            value={material.unit_cost}
            disabled={!canEdit}
            format={fmtMoney}
            validate={(v) => (v == null || v < 0 ? 'Cost ≥ 0' : null)}
            onSave={(v) =>
              v == null
                ? Promise.resolve({ success: false, error: 'Required' })
                : mutate(() => updateEstimateLineMaterial(material.id, { unit_cost: v }), true)
            }
          />
          {isAllowance && (
            <div style={{ fontSize: '0.625rem', color: '#92400e' }}>Allowance amount</div>
          )}
        </td>
        <td style={{ padding: '0.25rem 0.5rem', textAlign: 'center' }}>
          <input
            type="checkbox"
            checked={material.apply_tax}
            disabled={!canEdit}
            onChange={async (e) => {
              const result = await mutate(
                () => updateEstimateLineMaterial(material.id, { apply_tax: e.target.checked }),
                true
              );
              if (!result.success) setError(result.error || 'Save failed');
            }}
          />
        </td>
        <td style={{ padding: '0.25rem 0.5rem', textAlign: 'right', fontSize: '0.8125rem' }}>
          {fmtMoney(material.total_cost)}
        </td>
        <td style={{ padding: '0.25rem 0.5rem', whiteSpace: 'nowrap' }}>
          {canEdit && (
            <>
              <button
                type="button"
                onClick={() => setPickerForMaterial(material)}
                style={smallButton}
                title="Fill from cost catalog"
              >
                Catalog
              </button>{' '}
              <button
                type="button"
                onClick={async () => {
                  if (!window.confirm(`Remove material "${material.name}"?`)) return;
                  const result = await mutate(
                    () => deleteEstimateLineMaterial(material.id),
                    true
                  );
                  if (!result.success) setError(result.error || 'Delete failed');
                }}
                style={dangerButton}
              >
                ✕
              </button>
            </>
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
          style={{
            padding: '0.125rem 0.25rem',
            fontSize: '0.8125rem',
            border: '1px solid #d1d5db',
            borderRadius: '0.25rem',
          }}
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
    const lineMaterials = materials.filter((m) => m.line_item_id === line.id);
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
          <div style={{ flex: 1, minWidth: 0, fontWeight: 600, fontSize: '0.9375rem' }}>
            <InlineText
              value={line.name}
              disabled={!canEdit}
              onSave={(v) =>
                v.trim()
                  ? mutate(() => updateEstimateLineItem(line.id, { name: v.trim() }), false)
                  : Promise.resolve({ success: false, error: 'Name required' })
              }
            />
            <span
              style={{
                marginLeft: '0.5rem',
                fontSize: '0.625rem',
                fontWeight: 700,
                color: '#6b7280',
                backgroundColor: '#f3f4f6',
                padding: '0.0625rem 0.375rem',
                borderRadius: '9999px',
                verticalAlign: 'middle',
              }}
            >
              {line.line_type === 'lump_sum' ? 'LUMP SUM' : 'DETAILED'}
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

        {line.line_type === 'lump_sum' ? (
          <div
            style={{
              display: 'flex',
              gap: '1.5rem',
              flexWrap: 'wrap',
              fontSize: '0.875rem',
              alignItems: 'center',
            }}
          >
            <span>
              <span style={rowLabel}>Sub bid </span>
              <InlineNumber
                value={line.sub_bid_amount}
                disabled={!canEdit}
                allowNull
                format={fmtMoney}
                validate={(v) => (v != null && v < 0 ? '≥ 0' : null)}
                onSave={(v) =>
                  mutate(() => updateEstimateLineItem(line.id, { sub_bid_amount: v }), true)
                }
              />
              {line.subcontractor_id && (
                <span
                  style={{
                    marginLeft: '0.375rem',
                    fontSize: '0.625rem',
                    fontWeight: 700,
                    color: '#166534',
                    backgroundColor: '#dcfce7',
                    padding: '0.0625rem 0.375rem',
                    borderRadius: '9999px',
                  }}
                  title="Winning bid selected in the Bidding tab"
                >
                  WINNER SET
                </span>
              )}
            </span>
            <span>
              <span style={rowLabel}>Sub {modeNoun} % </span>
              <InlineNumber
                value={line.subcontractor_markup_percent}
                disabled={!canEdit}
                allowNull
                placeholder={`${estimate.subcontractor_markup_percent ?? 0}`}
                format={(v) =>
                  v == null
                    ? `(${fmtPercent(estimate.subcontractor_markup_percent)})`
                    : fmtPercent(v)
                }
                validate={percentValidator}
                onSave={(v) =>
                  mutate(
                    () => updateEstimateLineItem(line.id, { subcontractor_markup_percent: v }),
                    true
                  )
                }
              />
            </span>
            <span>
              <span style={rowLabel}>Discount </span>
              {discountControls(line)}
            </span>
          </div>
        ) : (
          <div>
            <div
              style={{
                display: 'flex',
                gap: '1.5rem',
                flexWrap: 'wrap',
                fontSize: '0.875rem',
                alignItems: 'center',
                marginBottom: '0.5rem',
              }}
            >
              <span>
                <span style={rowLabel}>Labor cost </span>
                <InlineNumber
                  value={line.labor_cost}
                  disabled={!canEdit}
                  allowNull
                  format={fmtMoney}
                  validate={(v) => (v != null && v < 0 ? '≥ 0' : null)}
                  onSave={(v) =>
                    mutate(() => updateEstimateLineItem(line.id, { labor_cost: v }), true)
                  }
                />
              </span>
              <span>
                <span style={rowLabel}>Labor {modeNoun} % </span>
                <InlineNumber
                  value={line.labor_markup_percent}
                  disabled={!canEdit}
                  allowNull
                  format={(v) =>
                    v == null ? `(${fmtPercent(estimate.labor_markup_percent)})` : fmtPercent(v)
                  }
                  validate={percentValidator}
                  onSave={(v) =>
                    mutate(() => updateEstimateLineItem(line.id, { labor_markup_percent: v }), true)
                  }
                />
              </span>
              <span>
                <span style={rowLabel}>Material {modeNoun} % </span>
                <InlineNumber
                  value={line.material_markup_percent}
                  disabled={!canEdit}
                  allowNull
                  format={(v) =>
                    v == null ? `(${fmtPercent(estimate.material_markup_percent)})` : fmtPercent(v)
                  }
                  validate={percentValidator}
                  onSave={(v) =>
                    mutate(
                      () => updateEstimateLineItem(line.id, { material_markup_percent: v }),
                      true
                    )
                  }
                />
              </span>
              <span style={{ fontSize: '0.8125rem' }}>
                <span style={rowLabel}>Tax </span>
                {fmtMoney(line.tax_amount)}
              </span>
              <span>
                <span style={rowLabel}>Discount </span>
                {discountControls(line)}
              </span>
            </div>

            {/* Materials table */}
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '0.5rem' }}>
              <thead>
                <tr style={{ fontSize: '0.6875rem', color: '#6b7280', textAlign: 'left' }}>
                  <th style={{ padding: '0.25rem 0.5rem' }}>Material</th>
                  <th style={{ padding: '0.25rem 0.5rem' }}>Unit</th>
                  <th style={{ padding: '0.25rem 0.5rem', textAlign: 'right' }}>Qty</th>
                  <th style={{ padding: '0.25rem 0.5rem', textAlign: 'right' }}>Unit cost</th>
                  <th style={{ padding: '0.25rem 0.5rem', textAlign: 'center' }}>Tax</th>
                  <th style={{ padding: '0.25rem 0.5rem', textAlign: 'right' }}>Total</th>
                  <th style={{ padding: '0.25rem 0.5rem' }}></th>
                </tr>
              </thead>
              <tbody>{lineMaterials.map(materialRow)}</tbody>
            </table>
            {canEdit && (
              <button type="button" onClick={() => addMaterial(line.id)} style={smallButton}>
                + Add Material
              </button>
            )}
          </div>
        )}

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

  function addLineDropdown(categoryId: string, subcategoryId: string | null) {
    return (
      <select
        value=""
        onChange={(e) => {
          if (e.target.value === 'lump_sum' || e.target.value === 'detailed') {
            addLine(categoryId, subcategoryId, e.target.value);
          }
          e.target.value = '';
        }}
        style={{ ...smallButton, appearance: 'auto' }}
      >
        <option value="">+ Add Line…</option>
        <option value="lump_sum">Lump Sum (sub bid)</option>
        <option value="detailed">Detailed (labor + materials)</option>
      </select>
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
              {addLineDropdown(sub.category_id, sub.id)}
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
              {addLineDropdown(category.id, null)}
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

      {pickerForMaterial && (
        <CatalogPicker
          onClose={() => setPickerForMaterial(null)}
          onSelect={(item) => fillFromCatalog(pickerForMaterial, item)}
        />
      )}
    </div>
  );
}
