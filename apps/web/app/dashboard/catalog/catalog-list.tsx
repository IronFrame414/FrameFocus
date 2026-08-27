'use client';

import { useCallback, useEffect, useState } from 'react';
import type { CatalogCategory, CostCatalogItem } from '@/lib/services/cost-catalog-client';
import { listCatalog, softDeleteCatalogItem } from '@/lib/services/cost-catalog-client';
import { CATEGORY_LABELS, UNIT_LABELS } from './catalog-labels';
import { useConfirm, useAlert } from '@/components/confirm/confirm-provider';

interface CatalogListProps {
  canManage: boolean;
}

export function CatalogList({ canManage }: CatalogListProps) {
  const confirm = useConfirm();
  const alert = useAlert();
  const [items, setItems] = useState<CostCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const data = await listCatalog();
    setItems(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = items.filter((item) => {
    if (filterCategory !== 'all' && item.category !== filterCategory) return false;
    if (search && !item.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  // Categorized list: group the filtered items by category, in label order.
  const categories = (Object.keys(CATEGORY_LABELS) as CatalogCategory[]).filter((cat) =>
    filtered.some((item) => item.category === cat)
  );

  async function handleDelete(id: string, name: string) {
    if (!(await confirm(`Are you sure you want to delete "${name}" from the catalog?`))) return;
    setDeleting(id);
    const result = await softDeleteCatalogItem(id);
    if (result.success) {
      await load();
    } else {
      void alert(result.error || 'Failed to delete catalog item');
    }
    setDeleting(null);
  }

  const selectStyle: React.CSSProperties = {
    padding: '0.375rem 0.5rem',
    border: '1px solid #d1d5db',
    borderRadius: '0.375rem',
    fontSize: '0.875rem',
  };

  const thStyle: React.CSSProperties = { padding: '0.75rem 0.5rem', fontWeight: 600 };
  const tdStyle: React.CSSProperties = { padding: '0.75rem 0.5rem' };

  if (loading) {
    return (
      <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>Loading catalog...</p>
    );
  }

  return (
    <div>
      {/* Filters */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder="Search catalog..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ ...selectStyle, flexGrow: 1, minWidth: '200px' }}
        />
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          style={selectStyle}
        >
          <option value="all">All Categories</option>
          {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {/* Count */}
      <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.75rem' }}>
        {filtered.length} item{filtered.length !== 1 ? 's' : ''}
      </p>

      {filtered.length === 0 ? (
        <div
          style={{
            textAlign: 'center',
            padding: '3rem',
            color: '#9ca3af',
            backgroundColor: '#f9fafb',
            borderRadius: '0.5rem',
          }}
        >
          No catalog items found. {canManage && 'Click "+ Add Item" to get started.'}
        </div>
      ) : (
        categories.map((cat) => (
          <div key={cat} style={{ marginBottom: '2rem' }}>
            <h2
              style={{
                fontSize: '1rem',
                fontWeight: 600,
                marginBottom: '0.5rem',
                paddingBottom: '0.375rem',
                borderBottom: '1px solid #e5e7eb',
              }}
            >
              {CATEGORY_LABELS[cat]}
            </h2>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #e5e7eb', textAlign: 'left' }}>
                    <th style={thStyle}>Name</th>
                    <th style={thStyle}>Unit</th>
                    <th style={thStyle}>Unit Cost</th>
                    <th style={thStyle}>Last Verified</th>
                    <th style={thStyle}>Notes</th>
                    {canManage && <th style={thStyle}>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {filtered
                    .filter((item) => item.category === cat)
                    .map((item) => (
                      <tr key={item.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                        <td style={{ ...tdStyle, fontWeight: 500 }}>
                          {item.product_url ? (
                            <a
                              href={item.product_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ color: '#2563eb', textDecoration: 'none' }}
                            >
                              {item.name}
                            </a>
                          ) : (
                            item.name
                          )}
                        </td>
                        <td style={{ ...tdStyle, color: '#6b7280' }}>
                          {UNIT_LABELS[item.unit_of_measure]}
                        </td>
                        <td style={tdStyle}>${Number(item.unit_cost).toFixed(2)}</td>
                        <td style={{ ...tdStyle, color: '#6b7280' }}>
                          {item.last_verified_at
                            ? new Date(item.last_verified_at).toLocaleDateString()
                            : '—'}
                        </td>
                        <td style={{ ...tdStyle, color: '#6b7280' }}>{item.notes || '—'}</td>
                        {canManage && (
                          <td style={tdStyle}>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                              <a
                                href={`/dashboard/catalog/${item.id}/edit`}
                                style={{
                                  color: '#2563eb',
                                  textDecoration: 'none',
                                  fontSize: '0.875rem',
                                }}
                              >
                                Edit
                              </a>
                              <button
                                onClick={() => handleDelete(item.id, item.name)}
                                disabled={deleting === item.id}
                                style={{
                                  color: '#dc2626',
                                  background: 'none',
                                  border: 'none',
                                  cursor: 'pointer',
                                  fontSize: '0.875rem',
                                  padding: 0,
                                }}
                              >
                                {deleting === item.id ? '...' : 'Delete'}
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
