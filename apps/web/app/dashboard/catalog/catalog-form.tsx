'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type {
  CatalogCategory,
  CatalogUnitOfMeasure,
  CostCatalogItem,
} from '@/lib/services/cost-catalog-client';
import {
  createCatalogItem,
  getCatalogItem,
  updateCatalogItem,
} from '@/lib/services/cost-catalog-client';
import { costCatalogSchema } from '@framefocus/shared/validation/cost-catalog';
import { CATEGORY_LABELS, UNIT_LABELS } from './catalog-labels';

export interface VendorOption {
  id: string;
  company_name: string;
}

interface CatalogFormProps {
  itemId?: string;
  vendors: VendorOption[];
}

export function CatalogForm({ itemId, vendors }: CatalogFormProps) {
  const router = useRouter();
  const isEdit = !!itemId;

  const [form, setForm] = useState({
    name: '',
    category: 'lumber',
    unit_of_measure: 'each',
    unit_cost: '',
    default_vendor_id: '',
    product_url: '',
    last_verified_at: '',
    notes: '',
  });

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!itemId) return;
    let cancelled = false;
    (async () => {
      const item: CostCatalogItem | null = await getCatalogItem(itemId);
      if (cancelled) return;
      if (!item) {
        setError('Catalog item not found.');
        setLoading(false);
        return;
      }
      setForm({
        name: item.name,
        category: item.category,
        unit_of_measure: item.unit_of_measure,
        unit_cost: String(item.unit_cost),
        default_vendor_id: item.default_vendor_id || '',
        product_url: item.product_url || '',
        last_verified_at: item.last_verified_at ? item.last_verified_at.slice(0, 10) : '',
        notes: item.notes || '',
      });
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [itemId]);

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSubmit() {
    setError('');

    const parsed = costCatalogSchema.safeParse({
      name: form.name.trim(),
      category: form.category,
      unit_of_measure: form.unit_of_measure,
      unit_cost: parseFloat(form.unit_cost),
      default_vendor_id: form.default_vendor_id || undefined,
      product_url: form.product_url.trim() || undefined,
      last_verified_at: form.last_verified_at || undefined,
      notes: form.notes.trim() || undefined,
    });

    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Form is invalid.');
      return;
    }

    setSaving(true);

    const payload = {
      name: parsed.data.name,
      category: parsed.data.category as CatalogCategory,
      unit_of_measure: parsed.data.unit_of_measure as CatalogUnitOfMeasure,
      unit_cost: parsed.data.unit_cost,
      default_vendor_id: parsed.data.default_vendor_id ?? null,
      product_url: parsed.data.product_url || null,
      last_verified_at: parsed.data.last_verified_at
        ? new Date(parsed.data.last_verified_at).toISOString()
        : null,
      notes: parsed.data.notes ?? null,
    };

    const result =
      isEdit && itemId
        ? await updateCatalogItem(itemId, payload)
        : await createCatalogItem(payload);

    if (!result.success) {
      setError(result.error || 'Failed to save catalog item.');
      setSaving(false);
      return;
    }

    setSaving(false);
    router.push('/dashboard/catalog');
    router.refresh();
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '0.5rem 0.75rem',
    border: '1px solid #d1d5db',
    borderRadius: '0.375rem',
    fontSize: '0.875rem',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '0.875rem',
    fontWeight: 500,
    marginBottom: '0.25rem',
    color: '#374151',
  };

  const gridTwoCol: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '1rem',
    marginBottom: '1rem',
  };

  if (loading) {
    return <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>Loading...</p>;
  }

  return (
    <div style={{ maxWidth: '640px' }}>
      <div style={{ marginBottom: '1rem' }}>
        <label style={labelStyle}>Name *</label>
        <input
          name="name"
          value={form.name}
          onChange={handleChange}
          style={inputStyle}
          placeholder='e.g., 2x4x8 SPF Stud'
        />
      </div>

      <div style={gridTwoCol}>
        <div>
          <label style={labelStyle}>Category *</label>
          <select name="category" value={form.category} onChange={handleChange} style={inputStyle}>
            {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Unit of Measure *</label>
          <select
            name="unit_of_measure"
            value={form.unit_of_measure}
            onChange={handleChange}
            style={inputStyle}
          >
            {Object.entries(UNIT_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div style={gridTwoCol}>
        <div>
          <label style={labelStyle}>Unit Cost ($) *</label>
          <input
            name="unit_cost"
            type="number"
            min="0"
            step="0.01"
            value={form.unit_cost}
            onChange={handleChange}
            style={inputStyle}
            placeholder="0.00"
          />
        </div>
        <div>
          <label style={labelStyle}>Default Vendor</label>
          <select
            name="default_vendor_id"
            value={form.default_vendor_id}
            onChange={handleChange}
            style={inputStyle}
          >
            <option value="">None</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>
                {v.company_name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ marginBottom: '1rem' }}>
        <label style={labelStyle}>Product URL</label>
        <input
          name="product_url"
          value={form.product_url}
          onChange={handleChange}
          style={inputStyle}
          placeholder="https://..."
        />
      </div>

      <div style={{ marginBottom: '1rem' }}>
        <label style={labelStyle}>Last Verified</label>
        <input
          name="last_verified_at"
          type="date"
          value={form.last_verified_at}
          onChange={handleChange}
          style={inputStyle}
        />
      </div>

      <div style={{ marginBottom: '1.5rem' }}>
        <label style={labelStyle}>Notes</label>
        <textarea
          name="notes"
          value={form.notes}
          onChange={handleChange}
          rows={3}
          style={{ ...inputStyle, resize: 'vertical' }}
          placeholder="Any notes about this item..."
        />
      </div>

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

      <div style={{ display: 'flex', gap: '0.75rem' }}>
        <button
          onClick={handleSubmit}
          disabled={saving}
          style={{
            padding: '0.625rem 1.5rem',
            fontSize: '0.875rem',
            fontWeight: 600,
            color: '#fff',
            backgroundColor: saving ? '#9ca3af' : '#2563eb',
            border: 'none',
            borderRadius: '0.375rem',
            cursor: saving ? 'not-allowed' : 'pointer',
          }}
        >
          {saving ? 'Saving...' : isEdit ? 'Update Item' : 'Create Item'}
        </button>
        <a
          href="/dashboard/catalog"
          style={{
            padding: '0.625rem 1.5rem',
            fontSize: '0.875rem',
            color: '#374151',
            backgroundColor: '#f3f4f6',
            border: '1px solid #d1d5db',
            borderRadius: '0.375rem',
            textDecoration: 'none',
          }}
        >
          Cancel
        </a>
      </div>
    </div>
  );
}
