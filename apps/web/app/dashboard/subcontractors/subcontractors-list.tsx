'use client';

import { useState } from 'react';
import { Subcontractor } from '@/lib/services/subcontractors';
import { deleteSubcontractor } from '@/lib/services/subcontractors-client';
import { useRouter } from 'next/navigation';

interface SubcontractorsListProps {
  subcontractors: Subcontractor[];
  canEdit: boolean;
}

export function SubcontractorsList({ subcontractors, canEdit }: SubcontractorsListProps) {
  const router = useRouter();
  const [filterType, setFilterType] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('active');
  const [search, setSearch] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);

  const filtered = subcontractors.filter((s) => {
    if (filterType !== 'all' && s.sub_type !== filterType) return false;
    if (filterStatus !== 'all' && s.status !== filterStatus) return false;
    if (search) {
      const q = search.toLowerCase();
      const match =
        s.company_name.toLowerCase().includes(q) ||
        (s.contact_first_name ?? '').toLowerCase().includes(q) ||
        (s.contact_last_name ?? '').toLowerCase().includes(q) ||
        (s.trade_type ?? '').toLowerCase().includes(q) ||
        (s.email ?? '').toLowerCase().includes(q);
      if (!match) return false;
    }
    return true;
  });

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Are you sure you want to delete ${name}?`)) return;
    setDeleting(id);
    const result = await deleteSubcontractor(id);
    if (result.success) {
      router.refresh();
    } else {
      alert(result.error || 'Failed to delete');
    }
    setDeleting(null);
  }

  const selectStyle: React.CSSProperties = {
    padding: '0.375rem 0.5rem',
    border: '1px solid #d1d5db',
    borderRadius: '0.375rem',
    fontSize: '0.875rem',
  };

  const typeBadge = (type: string) => ({
    padding: '0.125rem 0.5rem',
    borderRadius: '9999px',
    fontSize: '0.75rem',
    fontWeight: 500 as const,
    backgroundColor: type === 'subcontractor' ? '#ede9fe' : '#fce7f3',
    color: type === 'subcontractor' ? '#5b21b6' : '#9d174d',
  });

  const stars = (rating: number | null) => {
    if (!rating) return '—';
    return '★'.repeat(rating) + '☆'.repeat(5 - rating);
  };

  return (
    <div>
      {/* Filters */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder="Search subs & vendors..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ ...selectStyle, flexGrow: 1, minWidth: '200px' }}
        />
        <select value={filterType} onChange={(e) => setFilterType(e.target.value)} style={selectStyle}>
          <option value="all">All Types</option>
          <option value="subcontractor">Subcontractors</option>
          <option value="vendor">Vendors</option>
        </select>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} style={selectStyle}>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="archived">Archived</option>
          <option value="all">All Statuses</option>
        </select>
      </div>

      {/* Count */}
      <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.75rem' }}>
        {filtered.length} record{filtered.length !== 1 ? 's' : ''}
      </p>

      {/* Table */}
      {filtered.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '3rem',
          color: '#9ca3af',
          backgroundColor: '#f9fafb',
          borderRadius: '0.5rem',
        }}>
          No subs or vendors found. {canEdit && 'Click "+ Add Sub / Vendor" to get started.'}
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e5e7eb', textAlign: 'left' }}>
                <th style={{ padding: '0.75rem 0.5rem', fontWeight: 600 }}>Company</th>
                <th style={{ padding: '0.75rem 0.5rem', fontWeight: 600 }}>Contact</th>
                <th style={{ padding: '0.75rem 0.5rem', fontWeight: 600 }}>Type</th>
                <th style={{ padding: '0.75rem 0.5rem', fontWeight: 600 }}>Trade</th>
                <th style={{ padding: '0.75rem 0.5rem', fontWeight: 600 }}>Rating</th>
                <th style={{ padding: '0.75rem 0.5rem', fontWeight: 600 }}>Phone</th>
                {canEdit && <th style={{ padding: '0.75rem 0.5rem', fontWeight: 600 }}>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr key={s.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '0.75rem 0.5rem', fontWeight: 500 }}>
                    {s.company_name}
                  </td>
                  <td style={{ padding: '0.75rem 0.5rem', color: '#6b7280' }}>
                    {s.contact_first_name || s.contact_last_name
                      ? `${s.contact_first_name ?? ''} ${s.contact_last_name ?? ''}`.trim()
                      : '—'}
                  </td>
                  <td style={{ padding: '0.75rem 0.5rem' }}>
                    <span style={typeBadge(s.sub_type)}>
                      {s.sub_type === 'subcontractor' ? 'Sub' : 'Vendor'}
                    </span>
                  </td>
                  <td style={{ padding: '0.75rem 0.5rem', color: '#6b7280' }}>
                    {s.trade_type || '—'}
                  </td>
                  <td style={{ padding: '0.75rem 0.5rem', color: '#f59e0b', letterSpacing: '1px' }}>
                    {stars(s.rating)}
                  </td>
                  <td style={{ padding: '0.75rem 0.5rem', color: '#6b7280' }}>
                    {s.phone || '—'}
                  </td>
                  {canEdit && (
                    <td style={{ padding: '0.75rem 0.5rem' }}>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        
                          href={`/dashboard/subcontractors/${s.id}/edit`}
                          style={{ color: '#2563eb', textDecoration: 'none', fontSize: '0.875rem' }}
                        >
                          Edit
                        </a>
                        <button
                          onClick={() => handleDelete(s.id, s.company_name)}
                          disabled={deleting === s.id}
                          style={{
                            color: '#dc2626',
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: '0.875rem',
                            padding: 0,
                          }}
                        >
                          {deleting === s.id ? '...' : 'Delete'}
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
