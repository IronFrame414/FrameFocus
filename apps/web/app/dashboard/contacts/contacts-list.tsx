'use client';

import { useState } from 'react';
import type { Contact } from '@/lib/services/contacts';
import { deleteContact } from '@/lib/services/contacts-client';
import { useRouter } from 'next/navigation';

interface ContactsListProps {
  contacts: Contact[];
  canEdit: boolean;
}

export function ContactsList({ contacts, canEdit }: ContactsListProps) {
  const router = useRouter();
  const [filterType, setFilterType] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('active');
  const [search, setSearch] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);

  const filtered = contacts.filter((c) => {
    if (filterType !== 'all' && c.contact_type !== filterType) return false;
    if (filterStatus !== 'all' && c.status !== filterStatus) return false;
    if (search) {
      const s = search.toLowerCase();
      const match =
        c.first_name.toLowerCase().includes(s) ||
        c.last_name.toLowerCase().includes(s) ||
        (c.email ?? '').toLowerCase().includes(s) ||
        (c.company_name ?? '').toLowerCase().includes(s);
      if (!match) return false;
    }
    return true;
  });

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Are you sure you want to delete ${name}?`)) return;
    setDeleting(id);
    const result = await deleteContact(id);
    if (result.success) {
      router.refresh();
    } else {
      alert(result.error || 'Failed to delete contact');
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
    backgroundColor: type === 'client' ? '#dbeafe' : '#fef3c7',
    color: type === 'client' ? '#1e40af' : '#92400e',
  });

  const statusBadge = (status: string) => ({
    padding: '0.125rem 0.5rem',
    borderRadius: '9999px',
    fontSize: '0.75rem',
    fontWeight: 500 as const,
    backgroundColor:
      status === 'active' ? '#dcfce7' : status === 'inactive' ? '#f3f4f6' : '#fef2f2',
    color: status === 'active' ? '#166534' : status === 'inactive' ? '#374151' : '#991b1b',
  });

  return (
    <div>
      {/* Filters */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder="Search contacts..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            ...selectStyle,
            flexGrow: 1,
            minWidth: '200px',
          }}
        />
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          style={selectStyle}
        >
          <option value="all">All Types</option>
          <option value="lead">Leads</option>
          <option value="client">Clients</option>
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          style={selectStyle}
        >
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="archived">Archived</option>
          <option value="all">All Statuses</option>
        </select>
      </div>

      {/* Count */}
      <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.75rem' }}>
        {filtered.length} contact{filtered.length !== 1 ? 's' : ''}
      </p>

      {/* Table */}
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
          No contacts found. {canEdit && 'Click "+ Add Contact" to get started.'}
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e5e7eb', textAlign: 'left' }}>
                <th style={{ padding: '0.75rem 0.5rem', fontWeight: 600 }}>Name</th>
                <th style={{ padding: '0.75rem 0.5rem', fontWeight: 600 }}>Company</th>
                <th style={{ padding: '0.75rem 0.5rem', fontWeight: 600 }}>Type</th>
                <th style={{ padding: '0.75rem 0.5rem', fontWeight: 600 }}>Status</th>
                <th style={{ padding: '0.75rem 0.5rem', fontWeight: 600 }}>Email</th>
                <th style={{ padding: '0.75rem 0.5rem', fontWeight: 600 }}>Phone</th>
                {canEdit && <th style={{ padding: '0.75rem 0.5rem', fontWeight: 600 }}>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '0.75rem 0.5rem', fontWeight: 500 }}>
                    {c.first_name} {c.last_name}
                  </td>
                  <td style={{ padding: '0.75rem 0.5rem', color: '#6b7280' }}>
                    {c.company_name || '—'}
                  </td>
                  <td style={{ padding: '0.75rem 0.5rem' }}>
                    <span style={typeBadge(c.contact_type)}>
                      {c.contact_type === 'client' ? 'Client' : 'Lead'}
                    </span>
                  </td>
                  <td style={{ padding: '0.75rem 0.5rem' }}>
                    <span style={statusBadge(c.status)}>
                      {c.status.charAt(0).toUpperCase() + c.status.slice(1)}
                    </span>
                  </td>
                  <td style={{ padding: '0.75rem 0.5rem', color: '#6b7280' }}>{c.email || '—'}</td>
                  <td style={{ padding: '0.75rem 0.5rem', color: '#6b7280' }}>{c.phone || '—'}</td>
                  {canEdit && (
                    <td style={{ padding: '0.75rem 0.5rem' }}>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <a
                          href={`/dashboard/contacts/${c.id}/edit`}
                          style={{ color: '#2563eb', textDecoration: 'none', fontSize: '0.875rem' }}
                        >
                          Edit
                        </a>
                        <button
                          onClick={() => handleDelete(c.id, `${c.first_name} ${c.last_name}`)}
                          disabled={deleting === c.id}
                          style={{
                            color: '#dc2626',
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: '0.875rem',
                            padding: 0,
                          }}
                        >
                          {deleting === c.id ? '...' : 'Delete'}
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
