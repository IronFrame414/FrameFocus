'use client';

import { useState } from 'react';
import type { Contact } from '@/lib/services/contacts';
import { CONTACT_TYPE_LABELS } from '@framefocus/shared/constants';
import { ContactDetailSheet } from './contact-detail-sheet';

// ===========================================================================
// THE ROW IS THE WAY IN. [S158 · Finding 1, RULED Josh]
// ===========================================================================
//
// _Superseded, quoted rather than rewritten:_ every row ended in an `Actions`
// cell holding an `Edit` link and a `Delete` button, and those two were the
// ONLY things a row could do. Looking at a contact meant opening the form that
// changes them, and deleting one — a record carrying FKs from estimates,
// projects, invoices, payments, refunds and contracts — was a single click on a
// table row, behind nothing but a `confirm()`.
//
// Now: clicking ANYWHERE on a row opens the detail SHEET, and both actions live
// inside it. The Actions column is gone, `canEdit` no longer decides whether a
// column renders — it decides what the sheet offers.
//
// ⚠️ `deleteContact` IS NO LONGER IMPORTED HERE, deliberately. The delete lives
// in one place now. A list that keeps its own copy "for convenience" is how the
// two paths come to disagree about what a delete does.

interface ContactsListProps {
  contacts: Contact[];
  canEdit: boolean;
}

export function ContactsList({ contacts, canEdit }: ContactsListProps) {
  const [filterType, setFilterType] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('active');
  const [search, setSearch] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

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

  // Resolved from `contacts`, not from `filtered`: if a filter changes while
  // the sheet is open the sheet should keep showing the contact it was opened
  // for, rather than blinking out because the row behind it no longer matches.
  const openContact = openId ? (contacts.find((c) => c.id === openId) ?? null) : null;

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
        {/* ⚠️ THIS DROPDOWN WALKS `contacts.status` AND NOTHING ELSE, and "All
            Statuses" means all THREE of these — not "including deleted".
            `is_deleted` is a different column answering a different question,
            and a deleted contact is reachable only from Trash. Josh checked this
            dropdown for a deleted row at the S157 click-test and reasonably
            expected one; the answer is a separate view, not a fourth option
            here. [S158 · Finding 2] */}
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
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr
                  key={c.id}
                  // The whole row, per the ruling — not a link on the name cell,
                  // which is the shape the subs list uses and which leaves most
                  // of the row inert.
                  onClick={() => setOpenId(c.id)}
                  // A clickable `<tr>` is invisible to the keyboard on its own.
                  // These three are what make the row an actual control rather
                  // than a mouse-only affordance.
                  tabIndex={0}
                  role="button"
                  aria-label={`Open ${c.first_name} ${c.last_name}`}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setOpenId(c.id);
                    }
                  }}
                  data-testid={`contact-row-${c.id}`}
                  style={{ borderBottom: '1px solid #f3f4f6', cursor: 'pointer' }}
                >
                  <td style={{ padding: '0.75rem 0.5rem', fontWeight: 500 }}>
                    {c.first_name} {c.last_name}
                  </td>
                  <td style={{ padding: '0.75rem 0.5rem', color: '#6b7280' }}>
                    {c.company_name || '—'}
                  </td>
                  <td style={{ padding: '0.75rem 0.5rem' }}>
                    <span style={typeBadge(c.contact_type)}>
                      {CONTACT_TYPE_LABELS[c.contact_type] ?? c.contact_type}
                    </span>
                  </td>
                  <td style={{ padding: '0.75rem 0.5rem' }}>
                    <span style={statusBadge(c.status)}>
                      {c.status.charAt(0).toUpperCase() + c.status.slice(1)}
                    </span>
                  </td>
                  <td style={{ padding: '0.75rem 0.5rem', color: '#6b7280' }}>{c.email || '—'}</td>
                  <td style={{ padding: '0.75rem 0.5rem', color: '#6b7280' }}>{c.phone || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {openContact && (
        <ContactDetailSheet
          contact={openContact}
          canEdit={canEdit}
          onClose={() => setOpenId(null)}
        />
      )}
    </div>
  );
}
