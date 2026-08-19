'use client';

import { useState } from 'react';
import type { Subcontractor } from '@/lib/services/subcontractors';
import { SubcontractorDetailSheet } from './subcontractor-detail-sheet';

// ===========================================================================
// THE ROW IS THE WAY IN — SAME AS CONTACTS. [S159 · RULED Josh]
// ===========================================================================
//
// _Superseded, quoted rather than rewritten._ The row used to offer THREE
// different ways out, and all three were different from the contacts list one
// nav item away:
//
//   * the company name was a link to `/dashboard/subcontractors/[id]` — added
//     at S140 with the comment *"the name is now the way IN to the sub record.
//     Until this run the only link on the row was 'Edit', so looking at a sub
//     meant opening the form that changes them (TECH_DEBT #13 / #108(c))"*;
//   * an `Edit` link in an Actions cell;
//   * a `Delete` button beside it.
//
// **S140's fix was right and is not being undone — it is being finished.** The
// name link solved exactly the problem S158's Finding 1 solved for contacts, a
// session apart and in a different shape, and the result was two interaction
// models sitting next to each other under one nav group. That is the defect
// Josh ruled on: *"subs should match contacts with a panel."*
//
// So the whole row opens the SHEET, and Edit and Delete live inside it. The
// detail page keeps its job — the Owner/Admin compliance section — and the
// sheet links out to it. See `subcontractor-detail-sheet.tsx` for why that one
// piece did NOT move, which is the only real difference from Contacts.
//
// ⚠️ `deleteSubcontractor` IS NO LONGER IMPORTED HERE. One home for the delete,
// same as contacts.

interface SubcontractorsListProps {
  subcontractors: Subcontractor[];
  canEdit: boolean;
  /** owner / admin — gates the sheet's link to the compliance section. */
  canSeeCompliance: boolean;
}

export function SubcontractorsList({
  subcontractors,
  canEdit,
  canSeeCompliance,
}: SubcontractorsListProps) {
  const [filterType, setFilterType] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('active');
  const [search, setSearch] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

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

  // Resolved from the full list, not the filtered one, so changing a filter
  // while the sheet is open does not blink it out. Same as contacts.
  const openSub = openId ? (subcontractors.find((s) => s.id === openId) ?? null) : null;

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
        {/* Walks `subcontractors.status` only — "All Statuses" is all THREE of
            these, not "including deleted". A deleted sub is in Trash. Same note
            as the contacts list, and for the same reason [S158]. */}
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
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr
                  key={s.id}
                  onClick={() => setOpenId(s.id)}
                  // A clickable `<tr>` is invisible to the keyboard without
                  // these three. Same as the contacts list.
                  tabIndex={0}
                  role="button"
                  aria-label={`Open ${s.company_name}`}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setOpenId(s.id);
                    }
                  }}
                  data-testid={`sub-row-${s.id}`}
                  style={{ borderBottom: '1px solid #f3f4f6', cursor: 'pointer' }}
                >
                  {/* The company name is PLAIN TEXT now. It was an <a> to the
                      detail page; a link inside a row that is itself a control
                      gives the same click two meanings. */}
                  <td style={{ padding: '0.75rem 0.5rem', fontWeight: 500 }}>{s.company_name}</td>
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {openSub && (
        <SubcontractorDetailSheet
          subcontractor={openSub}
          canEdit={canEdit}
          canSeeCompliance={canSeeCompliance}
          onClose={() => setOpenId(null)}
        />
      )}
    </div>
  );
}
