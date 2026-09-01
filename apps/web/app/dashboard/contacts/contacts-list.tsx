'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { Contact } from '@/lib/services/contacts';
import { CONTACT_TYPE_LABELS } from '@framefocus/shared/constants';
import { ContactDetailSheet } from './contact-detail-sheet';
import {
  FilterChips,
  ListPageHeader,
  ListSearchInput,
} from '@/components/list-screen/list-screen';
import { badgeStyle, cardStyle, color, font, microLabelStyle, primaryButtonStyle, secondaryButtonStyle } from '@/lib/theme';

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
  /** §8.3 Jobs — distinct projects per contact, BOTH arms (projects.contact_id
   *  + the project_contacts junction), server-grouped. */
  jobs: Record<string, number>;
  /** §8.3 Client portal — profiles.client_access_state by contact_id, with
   *  'invited' for an invitation that has no profile yet. Absent = never
   *  invited (the derived fifth state). */
  portal: Record<string, string>;
}

// The four stored states, the derived pair, and their display copy.
const PORTAL_LABELS: Record<string, { label: string; bg: string; fg: string }> = {
  active: { label: 'Active', bg: color.successBg, fg: color.successOnBg },
  deactivated: { label: 'Deactivated', bg: color.neutralBadgeBg, fg: color.neutralBadgeText },
  signed_documents_only: { label: 'Signed docs only', bg: color.blueTintAlt, fg: color.primary },
  documents_for_signature: { label: 'Docs for signature', bg: color.warningBg, fg: color.warning },
  invited: { label: 'Invited', bg: color.warningBg, fg: color.warning },
};

export function ContactsList({ contacts, canEdit, jobs, portal }: ContactsListProps) {
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

  const typeBadge = (type: string) => ({
    ...badgeStyle,
    backgroundColor: type === 'client' ? color.blueTintAlt : color.warningBg,
    color: type === 'client' ? color.primary : color.warning,
  });

  const statusBadge = (status: string) => ({
    ...badgeStyle,
    backgroundColor:
      status === 'active' ? color.successBg : status === 'inactive' ? color.neutralBadgeBg : '#fdf1f0',
    color:
      status === 'active' ? color.successOnBg : status === 'inactive' ? color.neutralBadgeText : color.danger,
  });

  const th: React.CSSProperties = { ...microLabelStyle, padding: '10px 12px', textAlign: 'left' };
  const td: React.CSSProperties = { padding: '11px 12px', fontSize: '13px', color: color.bodyAlt };

  return (
    <div>
      <ListPageHeader
        title="Contacts"
        subtitle={`${filtered.length} contact${filtered.length === 1 ? '' : 's'} · leads and clients`}
      >
        <ListSearchInput value={search} onChange={setSearch} placeholder="Search contacts…" />
        {/* The way into the trash [S158 · Finding 2]. Ungated: reading the
            deleted list needs no more permission than reading the live one,
            and the Restore button inside is what carries the role gate. */}
        <Link href="/dashboard/contacts/trash" style={secondaryButtonStyle}>
          Trash
        </Link>
        {canEdit && (
          <Link href="/dashboard/contacts/new" style={primaryButtonStyle}>
            + Add Contact
          </Link>
        )}
      </ListPageHeader>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <FilterChips
          options={[
            { value: 'all', label: 'All' },
            { value: 'lead', label: 'Leads' },
            { value: 'client', label: 'Clients' },
          ]}
          selected={filterType}
          onSelect={setFilterType}
        />
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
          No contacts found. {canEdit && 'Click "+ Add Contact" to get started.'}
        </div>
      ) : (
        <div style={{ ...cardStyle, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ backgroundColor: color.tableHeadBg, borderBottom: `1px solid ${color.neutralBadgeBg}`, textAlign: 'left' }}>
                  <th style={{ ...th, paddingLeft: '20px' }}>Name</th>
                  <th style={th}>Company</th>
                  <th style={th}>Type</th>
                  <th style={th}>Status</th>
                  <th style={th}>Email</th>
                  <th style={th}>Phone</th>
                  <th style={th}>Jobs</th>
                  <th style={{ ...th, paddingRight: '20px' }}>Client portal</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => {
                  const portalState = portal[c.id];
                  const portalBadge = portalState ? PORTAL_LABELS[portalState] : undefined;
                  return (
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
                      style={{ borderBottom: `1px solid ${color.rowDivider}`, cursor: 'pointer' }}
                    >
                      <td style={{ ...td, paddingLeft: '20px', fontWeight: 600, color: color.navy }}>
                        {c.first_name} {c.last_name}
                      </td>
                      <td style={td}>{c.company_name || '—'}</td>
                      <td style={td}>
                        <span style={typeBadge(c.contact_type)}>
                          {CONTACT_TYPE_LABELS[c.contact_type] ?? c.contact_type}
                        </span>
                      </td>
                      <td style={td}>
                        <span style={statusBadge(c.status)}>
                          {c.status.charAt(0).toUpperCase() + c.status.slice(1)}
                        </span>
                      </td>
                      <td style={td}>{c.email || '—'}</td>
                      <td style={td}>{c.phone || '—'}</td>
                      {/* §8.3 Jobs — both arms, counted server-side. */}
                      <td style={{ ...td, fontFamily: font.mono, fontSize: '12.5px' }}>
                        {(jobs[c.id] ?? 0) > 0 ? jobs[c.id] : '—'}
                      </td>
                      {/* §8.3 Client portal — stored state, or the derived pair:
                          'Invited' (invitation, no profile) / 'Not invited'
                          (neither). Leads render the em-dash: a lead has no
                          portal to be invited to. */}
                      <td style={{ ...td, paddingRight: '20px' }}>
                        {c.contact_type !== 'client' ? (
                          '—'
                        ) : portalBadge ? (
                          <span style={{ ...badgeStyle, backgroundColor: portalBadge.bg, color: portalBadge.fg }}>
                            {portalBadge.label}
                          </span>
                        ) : (
                          <span style={{ fontSize: '12.5px', color: color.faint }}>Not invited</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
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
