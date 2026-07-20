'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  createChangeOrder,
  softDeleteChangeOrder,
  type ChangeOrderStatus,
  type ChangeOrderType,
  type ChangeOrderWithAuthor,
} from '@/lib/services/change-orders-client';
import {
  badgeStyle,
  cardStyle,
  color,
  font,
  microLabelStyle,
  primaryButtonStyle,
  secondaryButtonStyle,
} from '@/lib/theme';

// ui-06 — 1a CO list. Badge map locked round 2: sent → "Awaiting sig.",
// signed → "Signed", voided → "Voided" (visible), draft → "Draft". Negative
// COs (credits) render RED per §S4 — this deliberately changes the previously
// shipped green. Financial floor (ui-01 §11): the Amount column and all $
// captions are Owner/Admin only; the grid REFLOWS for gated roles.

const STATUS_BADGES: Record<ChangeOrderStatus, { label: string; bg: string; fg: string }> = {
  sent: { label: 'Awaiting sig.', bg: '#fdece0', fg: '#b45309' },
  signed: { label: 'Signed', bg: '#e4f0e6', fg: '#3d7a4b' },
  voided: { label: 'Voided', bg: '#eef1f6', fg: '#c0362c' },
  draft: { label: 'Draft', bg: '#eef1f6', fg: '#6b7280' },
};

const CO_TYPE_OPTIONS: Array<{ value: ChangeOrderType; label: string }> = [
  { value: 'fixed_price', label: 'Fixed Price' },
  { value: 'time_and_materials', label: 'Time & Materials' },
  { value: 'cost_plus', label: 'Cost Plus' },
];

function money(value: number): string {
  return Math.abs(value).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

interface ChangesPanelProps {
  projectId: string;
  projectType: string;
  changeOrders: ChangeOrderWithAuthor[];
  canManage: boolean;
  canDelete: boolean;
  /** Financial floor (ui-01 §11): CO dollar amounts are Owner/Admin only. */
  canSeeFinancials: boolean;
}

export function ChangesPanel({
  projectId,
  projectType,
  changeOrders,
  canManage,
  canDelete,
  canSeeFinancials,
}: ChangesPanelProps) {
  const router = useRouter();
  const [formOpen, setFormOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [coType, setCoType] = useState<ChangeOrderType>(
    (CO_TYPE_OPTIONS.some((o) => o.value === projectType)
      ? projectType
      : 'fixed_price') as ChangeOrderType
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inputStyle: React.CSSProperties = {
    padding: '9px 12px',
    border: `1px solid ${color.inputBorder}`,
    borderRadius: '9px',
    fontFamily: font.sans,
    fontSize: '13px',
    color: color.body,
    boxSizing: 'border-box',
  };

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    setError(null);

    const result = await createChangeOrder({
      project_id: projectId,
      title: title.trim(),
      co_type: coType,
    });

    setBusy(false);
    if (!result.success || !result.id) {
      setError(result.error ?? 'Could not create the change order');
      return;
    }
    router.push(`/dashboard/projects/${projectId}/changes/${result.id}`);
  }

  async function handleDelete(co: ChangeOrderWithAuthor) {
    if (!window.confirm(`Move ${co.co_number} to trash?`)) return;
    const result = await softDeleteChangeOrder(co.id);
    if (!result.success) {
      setError(result.error ?? 'Delete failed');
      return;
    }
    router.refresh();
  }

  // Summary sources (§S2): counts for all roles; $ sums Owner/Admin only.
  const sent = changeOrders.filter((co) => co.status === 'sent');
  const signed = changeOrders.filter((co) => co.status === 'signed');
  const drafts = changeOrders.filter((co) => co.status === 'draft');
  const sentSum = sent.reduce((sum, co) => sum + co.net_delta, 0);
  const signedSum = signed.reduce((sum, co) => sum + co.net_delta, 0);

  const summaryCards: { label: string; value: number; valueColor: string; caption: string }[] = [
    {
      label: 'Awaiting Signature',
      value: sent.length,
      valueColor: color.warning,
      caption: canSeeFinancials
        ? `${sentSum < 0 ? '−' : ''}${money(sentSum)} pending`
        : 'sent to clients',
    },
    {
      label: 'Signed',
      value: signed.length,
      valueColor: color.success,
      caption: canSeeFinancials
        ? `${signedSum < 0 ? '−' : ''}${money(signedSum)} added`
        : 'signed by clients',
    },
    { label: 'Draft', value: drafts.length, valueColor: color.navy, caption: 'Not yet sent' },
  ];

  // Grid — reflow per financial floor; a trailing auto column carries the
  // delete action for Owner/Admin.
  const gridTemplate = canSeeFinancials
    ? `0.7fr 2.3fr 1.2fr 1fr 1.3fr${canDelete ? ' auto' : ''}`
    : '0.7fr 2.9fr 1.1fr 1.3fr';

  return (
    <div>
      {/* Header actions */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
        {canManage && !formOpen && (
          <button type="button" onClick={() => setFormOpen(true)} style={primaryButtonStyle}>
            + New Change Order
          </button>
        )}
      </div>

      {error && (
        <div
          style={{
            padding: '12px 16px',
            borderRadius: '9px',
            marginBottom: '14px',
            backgroundColor: '#fef2f2',
            color: color.dangerAlt,
            fontSize: '13px',
          }}
        >
          {error}
        </div>
      )}

      {formOpen && (
        <form
          onSubmit={handleCreate}
          style={{
            ...cardStyle,
            padding: '16px',
            marginBottom: '14px',
            display: 'flex',
            gap: '12px',
            flexWrap: 'wrap',
            alignItems: 'flex-end',
          }}
        >
          <div style={{ flex: '1 1 240px' }}>
            <label style={{ ...microLabelStyle, display: 'block', marginBottom: '4px' }}>
              Title
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Kitchen cabinet upgrade"
              style={{ ...inputStyle, width: '100%' }}
              autoFocus
            />
          </div>
          <div>
            <label style={{ ...microLabelStyle, display: 'block', marginBottom: '4px' }}>
              CO type
            </label>
            <select
              value={coType}
              onChange={(e) => setCoType(e.target.value as ChangeOrderType)}
              style={inputStyle}
            >
              {CO_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            disabled={busy || !title.trim()}
            style={{
              ...primaryButtonStyle,
              backgroundColor: busy || !title.trim() ? color.faintAlt : color.primary,
              cursor: busy || !title.trim() ? 'not-allowed' : 'pointer',
            }}
          >
            {busy ? 'Creating…' : 'Create Draft'}
          </button>
          <button type="button" onClick={() => setFormOpen(false)} style={secondaryButtonStyle}>
            Cancel
          </button>
        </form>
      )}

      {/* Summary — 3 cards (ui-06 §4) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '14px',
          marginBottom: '18px',
        }}
      >
        {summaryCards.map((card) => (
          <div key={card.label} style={{ ...cardStyle, padding: '16px 17px' }}>
            <div style={microLabelStyle}>{card.label}</div>
            <div
              style={{
                fontFamily: font.mono,
                fontSize: '28px',
                fontWeight: 600,
                color: card.valueColor,
                margin: '4px 0 2px',
              }}
            >
              {card.value}
            </div>
            <div style={{ fontSize: '12px', color: color.muted }}>{card.caption}</div>
          </div>
        ))}
      </div>

      {/* CO table */}
      {changeOrders.length === 0 ? (
        <div style={{ ...cardStyle, padding: '48px', textAlign: 'center', color: color.muted }}>
          No change orders yet.
          {canManage && ' Create one to record added or removed scope.'}
        </div>
      ) : (
        <div style={{ ...cardStyle, overflow: 'hidden' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: gridTemplate,
              gap: '12px',
              padding: '12px 20px',
              backgroundColor: color.tableHeadBg,
              borderBottom: `1px solid ${color.neutralBadgeBg}`,
            }}
          >
            <span style={microLabelStyle}>CO #</span>
            <span style={microLabelStyle}>Description</span>
            {canSeeFinancials && (
              <span style={{ ...microLabelStyle, textAlign: 'right' }}>Amount</span>
            )}
            <span style={microLabelStyle}>Status</span>
            <span style={microLabelStyle}>Sent</span>
            {canSeeFinancials && canDelete && <span />}
          </div>

          {changeOrders.map((co, i) => {
            const badge = STATUS_BADGES[co.status];
            return (
              <div
                key={co.id}
                onClick={() => router.push(`/dashboard/projects/${projectId}/changes/${co.id}`)}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = color.tableHeadBg)}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                style={{
                  display: 'grid',
                  gridTemplateColumns: gridTemplate,
                  gap: '12px',
                  alignItems: 'center',
                  padding: '15px 20px',
                  borderBottom:
                    i === changeOrders.length - 1 ? 'none' : `1px solid ${color.rowDivider}`,
                  cursor: 'pointer',
                }}
              >
                <span style={{ fontFamily: font.mono, fontSize: '13px', fontWeight: 600, color: color.faint }}>
                  {co.co_number}
                </span>
                <span style={{ fontFamily: font.sans, fontSize: '14px', fontWeight: 600, color: color.navy }}>
                  {co.title}
                </span>
                {canSeeFinancials && (
                  <span
                    style={{
                      fontFamily: font.mono,
                      fontSize: '14px',
                      fontWeight: 600,
                      textAlign: 'right',
                      // Negative COs (credits) render RED per §S4 (round 2).
                      color: co.net_delta < 0 ? color.danger : color.navy,
                    }}
                  >
                    {co.net_delta < 0 ? '−' : ''}
                    {money(co.net_delta)}
                  </span>
                )}
                <span>
                  <span style={{ ...badgeStyle, backgroundColor: badge.bg, color: badge.fg }}>
                    {badge.label}
                  </span>
                </span>
                <span
                  style={{
                    fontFamily: font.mono,
                    fontSize: '12px',
                    fontWeight: 500,
                    color: co.sent_at ? color.muted : color.faintAlt,
                  }}
                >
                  {co.sent_at ? new Date(co.sent_at).toLocaleDateString() : '—'}
                </span>
                {canSeeFinancials && canDelete && (
                  <span onClick={(e) => e.stopPropagation()}>
                    {co.status !== 'signed' && (
                      <button
                        type="button"
                        onClick={() => handleDelete(co)}
                        style={{
                          padding: '4px 10px',
                          fontSize: '12px',
                          fontWeight: 600,
                          color: color.dangerAlt,
                          backgroundColor: '#fff',
                          border: '1px solid #fecaca',
                          borderRadius: '8px',
                          cursor: 'pointer',
                        }}
                      >
                        Delete
                      </button>
                    )}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
