'use client';

import { useEffect, useState } from 'react';
import {
  CatalogCategory,
  CostCatalogItem,
  listCatalog,
} from '@/lib/services/cost-catalog-client';
import { catalogCategories } from '@framefocus/shared/validation/cost-catalog';
import { fmtMoney } from '../labels';

// Catalog picker modal (4D Items tab). Selecting an item fills
// name / unit / unit_cost on the material row; quantity defaults to
// 1; the user can still edit any field. Unit cost is snapshotted —
// later catalog edits never retro-change the estimate.

interface CatalogPickerProps {
  onSelect: (item: CostCatalogItem) => void;
  onClose: () => void;
}

export function CatalogPicker({ onSelect, onClose }: CatalogPickerProps) {
  const [items, setItems] = useState<CostCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<CatalogCategory | ''>('');

  useEffect(() => {
    setLoading(true);
    listCatalog({
      search: search.trim() || undefined,
      category: category || undefined,
    }).then((rows) => {
      setItems(rows);
      setLoading(false);
    });
  }, [search, category]);

  const inputStyle: React.CSSProperties = {
    padding: '0.5rem 0.75rem',
    border: '1px solid #d1d5db',
    borderRadius: '0.375rem',
    fontSize: '0.875rem',
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 50,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: '#fff',
          borderRadius: '0.5rem',
          padding: '1.5rem',
          width: '100%',
          maxWidth: '560px',
          maxHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <h2 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '1rem' }}>
          Pick from Cost Catalog
        </h2>

        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem' }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search materials…"
            style={{ ...inputStyle, flex: 1 }}
            autoFocus
          />
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as CatalogCategory | '')}
            style={inputStyle}
          >
            <option value="">All categories</option>
            {catalogCategories.map((c) => (
              <option key={c} value={c}>
                {c.charAt(0).toUpperCase() + c.slice(1)}
              </option>
            ))}
          </select>
        </div>

        <div style={{ overflowY: 'auto', flex: 1, border: '1px solid #f3f4f6', borderRadius: '0.375rem' }}>
          {loading ? (
            <p style={{ padding: '1rem', color: '#9ca3af', fontSize: '0.875rem' }}>Loading…</p>
          ) : items.length === 0 ? (
            <p style={{ padding: '1rem', color: '#9ca3af', fontSize: '0.875rem' }}>
              No catalog items match.
            </p>
          ) : (
            items.map((item) => (
              <div
                key={item.id}
                onClick={() => onSelect(item)}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '0.625rem 0.75rem',
                  borderBottom: '1px solid #f3f4f6',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                }}
              >
                <span>
                  <strong>{item.name}</strong>
                  <span style={{ color: '#6b7280', marginLeft: '0.5rem', fontSize: '0.75rem' }}>
                    {item.category} · per {item.unit_of_measure}
                  </span>
                </span>
                <span style={{ fontWeight: 600 }}>{fmtMoney(item.unit_cost)}</span>
              </div>
            ))
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '0.5rem 1rem',
              fontSize: '0.875rem',
              backgroundColor: '#f3f4f6',
              border: '1px solid #d1d5db',
              borderRadius: '0.375rem',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
