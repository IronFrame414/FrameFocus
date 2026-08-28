'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { CatalogCategory, CostCatalogItem } from '@/lib/services/cost-catalog-client';
import { listCatalog, softDeleteCatalogItem } from '@/lib/services/cost-catalog-client';
import { CATEGORY_LABELS, UNIT_LABELS } from './catalog-labels';
import { useConfirm, useAlert } from '@/components/confirm/confirm-provider';
import {
  AlertStrip,
  FilterChips,
  ListPageHeader,
  ListSearchInput,
} from '@/components/list-screen/list-screen';
import { cardStyle, color, font, microLabelStyle, primaryButtonStyle } from '@/lib/theme';

interface CatalogListProps {
  canManage: boolean;
  /** RULED (§8.6): estimates-plus-selections usage per item, server-grouped.
   *  Rendered as "used N times" — NO NOUN; a combined count under "estimates"
   *  would be false. */
  usage: Record<string, number>;
}

// Stale = never verified, or last verified more than A YEAR ago — RULED
// [Josh, 2026-08-28], superseding the build's provisional 90 days. The
// mockup's own copy says "haven't been repriced in over a year", and 90 days
// would badge so much of a 148-item list that the flag would mean nothing.
const STALE_AFTER_DAYS = 365;

function isStale(lastVerifiedAt: string | null, now: number): boolean {
  if (!lastVerifiedAt) return true;
  return now - new Date(lastVerifiedAt).getTime() > STALE_AFTER_DAYS * 86_400_000;
}

export function CatalogList({ canManage, usage }: CatalogListProps) {
  const confirm = useConfirm();
  const alert = useAlert();
  const [items, setItems] = useState<CostCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<string>('all');
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

  const now = Date.now();
  const staleCount = useMemo(() => items.filter((i) => isStale(i.last_verified_at, now)).length, [items, now]);

  const filtered = items.filter((item) => {
    if (filter === 'stale') {
      if (!isStale(item.last_verified_at, now)) return false;
    } else if (filter !== 'all' && item.category !== filter) return false;
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

  const chips = [
    { value: 'all', label: 'All' },
    ...Object.entries(CATEGORY_LABELS).map(([value, label]) => ({ value, label })),
    { value: 'stale', label: `Stale${staleCount > 0 ? ` ${staleCount}` : ''}` },
  ];

  const cellText: React.CSSProperties = { fontSize: '13px', color: color.bodyAlt };

  return (
    <div>
      <ListPageHeader
        title="Cost Catalog"
        subtitle={
          loading
            ? 'Loading…'
            : `${items.length} item${items.length === 1 ? '' : 's'} · reusable material costs for building estimates`
        }
      >
        <ListSearchInput value={search} onChange={setSearch} placeholder="Search catalog…" />
        {canManage && (
          <Link href="/dashboard/catalog/new" style={primaryButtonStyle}>
            + Add Item
          </Link>
        )}
      </ListPageHeader>

      {!loading && staleCount > 0 && (
        <AlertStrip>
          <strong>{staleCount}</strong> price{staleCount === 1 ? '' : 's'} not verified in over a
          year — stale catalog prices are the quietest way to lose margin on a bid.{' '}
          <button
            onClick={() => setFilter('stale')}
            style={{
              border: 'none',
              background: 'none',
              padding: 0,
              color: color.primary,
              fontWeight: 600,
              fontSize: '13px',
              fontFamily: font.sans,
              cursor: 'pointer',
            }}
          >
            Review stale prices
          </button>
        </AlertStrip>
      )}

      <FilterChips options={chips} selected={filter} onSelect={setFilter} />

      {loading ? (
        <p style={{ fontSize: '13px', color: color.muted }}>Loading catalog…</p>
      ) : filtered.length === 0 ? (
        <div style={{ ...cardStyle, padding: '48px', textAlign: 'center', color: color.muted }}>
          No catalog items found. {canManage && 'Click "+ Add Item" to get started.'}
        </div>
      ) : (
        categories.map((cat) => (
          <div key={cat} style={{ ...cardStyle, overflow: 'hidden', marginBottom: '16px' }}>
            <div
              style={{
                padding: '11px 20px',
                backgroundColor: color.tableHeadBg,
                borderBottom: `1px solid ${color.neutralBadgeBg}`,
              }}
            >
              <span style={{ ...microLabelStyle, color: color.muted }}>{CATEGORY_LABELS[cat]}</span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${color.neutralBadgeBg}`, textAlign: 'left' }}>
                    <th style={{ ...microLabelStyle, padding: '10px 12px 10px 20px' }}>Name</th>
                    <th style={{ ...microLabelStyle, padding: '10px 12px' }}>Unit</th>
                    <th style={{ ...microLabelStyle, padding: '10px 12px' }}>Unit cost</th>
                    <th style={{ ...microLabelStyle, padding: '10px 12px' }}>Last verified</th>
                    <th style={{ ...microLabelStyle, padding: '10px 12px' }}>Used</th>
                    <th style={{ ...microLabelStyle, padding: '10px 12px' }}>Notes</th>
                    {canManage && <th style={{ ...microLabelStyle, padding: '10px 20px 10px 12px' }}>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {filtered
                    .filter((item) => item.category === cat)
                    .map((item) => {
                      const stale = isStale(item.last_verified_at, now);
                      const used = usage[item.id] ?? 0;
                      return (
                        <tr key={item.id} style={{ borderBottom: `1px solid ${color.rowDivider}` }}>
                          <td style={{ padding: '11px 12px 11px 20px', fontWeight: 600, color: color.navy }}>
                            {item.product_url ? (
                              <a
                                href={item.product_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{ color: color.primary, textDecoration: 'none' }}
                              >
                                {item.name}
                              </a>
                            ) : (
                              item.name
                            )}
                          </td>
                          <td style={{ ...cellText, padding: '11px 12px' }}>
                            {UNIT_LABELS[item.unit_of_measure]}
                          </td>
                          <td style={{ padding: '11px 12px', fontFamily: font.mono, fontWeight: 600, color: color.navy }}>
                            ${Number(item.unit_cost).toFixed(2)}
                          </td>
                          <td
                            style={{
                              padding: '11px 12px',
                              fontFamily: font.mono,
                              fontSize: '12.5px',
                              color: stale ? color.warningDeep : color.bodyAlt,
                              fontWeight: stale ? 600 : 400,
                            }}
                          >
                            {item.last_verified_at
                              ? new Date(item.last_verified_at).toLocaleDateString()
                              : 'never'}
                            {stale && ' · stale'}
                          </td>
                          {/* RULED wording: "used N times" — no noun. */}
                          <td style={{ ...cellText, padding: '11px 12px', fontFamily: font.mono, fontSize: '12.5px' }}>
                            {used > 0 ? `used ${used} time${used === 1 ? '' : 's'}` : '—'}
                          </td>
                          <td style={{ ...cellText, padding: '11px 12px' }}>{item.notes || '—'}</td>
                          {canManage && (
                            <td style={{ padding: '11px 20px 11px 12px' }}>
                              <div style={{ display: 'flex', gap: '10px' }}>
                                <Link
                                  href={`/dashboard/catalog/${item.id}/edit`}
                                  style={{ color: color.primary, textDecoration: 'none', fontSize: '13px', fontWeight: 600 }}
                                >
                                  Edit
                                </Link>
                                <button
                                  onClick={() => handleDelete(item.id, item.name)}
                                  disabled={deleting === item.id}
                                  style={{
                                    color: color.danger,
                                    background: 'none',
                                    border: 'none',
                                    cursor: 'pointer',
                                    fontSize: '13px',
                                    fontWeight: 600,
                                    padding: 0,
                                    fontFamily: font.sans,
                                  }}
                                >
                                  {deleting === item.id ? '…' : 'Delete'}
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
