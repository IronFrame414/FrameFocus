'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { Subcontractor } from '@/lib/services/subcontractors';
import { SubcontractorDetailSheet } from './subcontractor-detail-sheet';
import {
  AlertStrip,
  FilterChips,
  ListPageHeader,
  ListSearchInput,
} from '@/components/list-screen/list-screen';
import {
  badgeStyle,
  cardStyle,
  color,
  font,
  microLabelStyle,
  primaryButtonStyle,
  secondaryButtonStyle,
} from '@/lib/theme';

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
  /** §8.4 compliance alert counts — NULL for gated roles, whose read was
   *  SKIPPED server-side rather than rendered empty (an empty list reads as
   *  "no problems", a false statement). */
  compliance: { expired: number; expiringSoon: number } | null;
  /** §8.4 W-9 on file per sub id — NULL for gated roles (read skipped). */
  w9: Record<string, boolean> | null;
  /** §8.4 — committed remaining per SUBCONTRACTOR (payables-shared maths over
   *  one company-wide getBillsAndCommitments). Vendors are deliberately
   *  absent: their names are free text with no FK, so no join is trusted. */
  committedOpen: Record<string, number>;
  spend12mo: Record<string, number>;
}

function money(value: number | undefined): string {
  if (value === undefined) return '—';
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

export function SubcontractorsList({
  subcontractors,
  canEdit,
  canSeeCompliance,
  compliance,
  w9,
  committedOpen,
  spend12mo,
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

  // §2's purple token — the subcontractor category colour.
  const typeBadge = (type: string) => ({
    ...badgeStyle,
    backgroundColor: type === 'subcontractor' ? color.purpleBg : '#fce7f3',
    color: type === 'subcontractor' ? color.purple : '#9d174d',
  });

  const stars = (rating: number | null) => {
    if (!rating) return '—';
    return '★'.repeat(rating) + '☆'.repeat(5 - rating);
  };

  const th: React.CSSProperties = { ...microLabelStyle, padding: '10px 12px', textAlign: 'left' };
  const td: React.CSSProperties = { padding: '11px 12px', fontSize: '13px', color: color.bodyAlt };
  const monoCell: React.CSSProperties = { ...td, fontFamily: font.mono, fontSize: '12.5px' };

  return (
    <div>
      <ListPageHeader
        title="Subs & Vendors"
        subtitle={`${filtered.length} record${filtered.length === 1 ? '' : 's'} · subcontractors and vendors`}
      >
        <ListSearchInput value={search} onChange={setSearch} placeholder="Search subs & vendors…" />
        {/* The way into the trash [S158 · Finding 2]. Ungated: reading the
            deleted list needs no more permission than reading the live one,
            and the Restore button inside is what carries the role gate. */}
        <Link href="/dashboard/subcontractors/trash" style={secondaryButtonStyle}>
          Trash
        </Link>
        {canEdit && (
          <Link href="/dashboard/subcontractors/new" style={primaryButtonStyle}>
            + Add Sub / Vendor
          </Link>
        )}
      </ListPageHeader>

      {/* §8.4 compliance alert — already built and TYPE-BLIND (covers COIs,
          licenses, W-9s alike). Renders only for Owner/Admin, whose read
          actually ran; and only when there is something to say. */}
      {compliance && compliance.expired + compliance.expiringSoon > 0 && (
        <AlertStrip>
          {compliance.expired > 0 && (
            <>
              <strong>{compliance.expired}</strong> sub{compliance.expired === 1 ? ' has' : 's have'}{' '}
              expired compliance documents
            </>
          )}
          {compliance.expired > 0 && compliance.expiringSoon > 0 && ' · '}
          {compliance.expiringSoon > 0 && (
            <>
              <strong>{compliance.expiringSoon}</strong> expiring within 30 days
            </>
          )}
        </AlertStrip>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <FilterChips
          options={[
            { value: 'all', label: 'All' },
            { value: 'subcontractor', label: 'Subcontractors' },
            { value: 'vendor', label: 'Vendors' },
          ]}
          selected={filterType}
          onSelect={setFilterType}
        />
        {/* Walks `subcontractors.status` only — "All Statuses" is all THREE of
            these, not "including deleted". A deleted sub is in Trash. Same note
            as the contacts list, and for the same reason [S158]. */}
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          style={{
            padding: '7px 10px',
            border: `1px solid ${color.inputBorder}`,
            borderRadius: '8px',
            fontSize: '13px',
            fontFamily: font.sans,
            color: color.bodyAlt,
            backgroundColor: '#fff',
          }}
        >
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="archived">Archived</option>
          <option value="all">All Statuses</option>
        </select>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div style={{ ...cardStyle, padding: '48px', textAlign: 'center', color: color.muted }}>
          No subs or vendors found. {canEdit && 'Click "+ Add Sub / Vendor" to get started.'}
        </div>
      ) : (
        <div style={{ ...cardStyle, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr
                  style={{
                    backgroundColor: color.tableHeadBg,
                    borderBottom: `1px solid ${color.neutralBadgeBg}`,
                    textAlign: 'left',
                  }}
                >
                  <th style={{ ...th, paddingLeft: '20px' }}>Company</th>
                  <th style={th}>Contact</th>
                  <th style={th}>Type</th>
                  <th style={th}>Trade</th>
                  <th style={th}>Rating</th>
                  <th style={th}>Phone</th>
                  <th style={th}>W-9</th>
                  <th style={th}>Committed open</th>
                  <th style={{ ...th, paddingRight: '20px' }}>12-mo spend</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => {
                  const isSub = s.sub_type === 'subcontractor';
                  return (
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
                      style={{ borderBottom: `1px solid ${color.rowDivider}`, cursor: 'pointer' }}
                    >
                      {/* The company name is PLAIN TEXT now. It was an <a> to the
                          detail page; a link inside a row that is itself a control
                          gives the same click two meanings. */}
                      <td style={{ ...td, paddingLeft: '20px', fontWeight: 600, color: color.navy }}>
                        {s.company_name}
                      </td>
                      <td style={td}>
                        {s.contact_first_name || s.contact_last_name
                          ? `${s.contact_first_name ?? ''} ${s.contact_last_name ?? ''}`.trim()
                          : '—'}
                      </td>
                      <td style={td}>
                        <span style={typeBadge(s.sub_type)}>
                          {s.sub_type === 'subcontractor' ? 'Sub' : 'Vendor'}
                        </span>
                      </td>
                      <td style={td}>{s.trade_type || '—'}</td>
                      <td style={{ ...td, color: color.amber, letterSpacing: '1px' }}>
                        {stars(s.rating)}
                      </td>
                      <td style={td}>{s.phone || '—'}</td>
                      {/* W-9 — Owner/Admin only; the read was skipped for other
                          roles, so the em-dash means "not yours to know", never
                          "missing". The docs table is empty on live data today,
                          so "missing" is the honest state for every sub. */}
                      <td style={{ ...td, fontSize: '12.5px' }}>
                        {w9 === null ? (
                          '—'
                        ) : w9[s.id] ? (
                          <span style={{ color: color.successOnBg, fontWeight: 600 }}>On file</span>
                        ) : (
                          <span style={{ color: color.warning, fontWeight: 600 }}>Missing</span>
                        )}
                      </td>
                      {/* Money columns — SUBS ONLY. A vendor figure would be a
                          string-match on free text, and is not invented (§8.4). */}
                      <td style={monoCell}>{isSub ? money(committedOpen[s.id]) : '—'}</td>
                      <td style={{ ...monoCell, paddingRight: '20px' }}>
                        {isSub ? money(spend12mo[s.id]) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
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
