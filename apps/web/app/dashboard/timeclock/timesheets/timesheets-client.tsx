'use client';

// 6A-2 §4.4 — approval queue (handoff 4a authoritative layout): week
// selector + scope note, 4-up KPI row, member table grid
// 1.6fr 1fr 1fr 1fr 1fr 1.2fr (plus a leading checkbox column), footer OT
// note. Labor Cost card is Owner/Admin only and renders an em-dash until a
// pay-rate source exists (§S-6 — no employee rate column in the schema; the
// effective-dated pay-rate backend is a logged follow-up). "Approve selected"
// is week-atomic PER MEMBER via the approve_member_week RPC.

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { approveMemberWeek } from '@/lib/services/time-tracking-client';
import { canApproveByRank } from '@framefocus/shared/utils/time-tracking';
import { ROLE_LABELS, type CompanyRole } from '@framefocus/shared';
import { StatusBadge, fmtHours, fmtTime, monoValue } from '@/components/time/time-ui';
import {
  cardStyle,
  color,
  font,
  h2Style,
  microLabelStyle,
  primaryButtonStyle,
  secondaryButtonStyle,
} from '@/lib/theme';
import { LiveBoard } from './live-board';

export interface QueueSessionRow {
  id: string;
  clock_in: string;
  clock_out: string | null;
  status: 'pending' | 'approved' | null;
  dayKey: string; // YYYY-MM-DD in the company timezone
  paidHours: number;
}

export interface MemberWeekRow {
  memberId: string;
  displayName: string;
  /** Profile role; null = profile-less subcontractor member (crew tier). */
  role: string | null;
  paidHours: number;
  workedHours: number;
  otHours: number;
  pendingCount: number;
  dayCount: number;
  approvedDayCount: number;
  approverNames: string[];
  isOwnerRow: boolean;
  sessions: QueueSessionRow[];
}

interface TimesheetsClientProps {
  rows: MemberWeekRow[];
  weekLabel: string;
  weekStartIso: string;
  weekEndIso: string;
  prevAnchor: string;
  nextAnchor: string;
  viewerRole: string;
  viewerMemberId: string | null;
  canSeeLaborCost: boolean;
  /** Owner/Admin only; null for other roles. priced = members whose whole
   *  week is rate-covered (snapshot or live). */
  laborCost: { total: number; priced: number; totalMembers: number } | null;
  /** Company timezone (companies.timezone) — all wall-clock rendering. */
  timeZone: string;
  /** companies.ot_threshold_hours [S86] — footer label only; OT math is server-side. */
  otThresholdHours: number;
}

const GRID = '36px 1.6fr 1fr 1fr 1fr 1fr 1.2fr';

function KpiCard({
  label,
  value,
  caption,
  valueColor,
}: {
  label: string;
  value: string;
  caption?: string;
  valueColor?: string;
}) {
  return (
    <div style={{ ...cardStyle, padding: '16px 18px', flex: 1, minWidth: '150px' }}>
      <p style={microLabelStyle}>{label}</p>
      <p
        style={{
          ...monoValue,
          fontSize: '23px',
          fontWeight: 600,
          color: valueColor ?? color.navy,
          margin: '6px 0 0',
        }}
      >
        {value}
      </p>
      {caption && <p style={{ margin: '3px 0 0', fontSize: '11px', color: color.faint }}>{caption}</p>}
    </div>
  );
}

function dayLabel(dayKey: string): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(new Date(`${dayKey}T12:00:00`));
}

export function TimesheetsClient({
  rows,
  weekLabel,
  weekStartIso,
  weekEndIso,
  prevAnchor,
  nextAnchor,
  viewerRole,
  viewerMemberId,
  canSeeLaborCost,
  laborCost,
  timeZone,
  otThresholdHours,
}: TimesheetsClientProps) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const approvable = useMemo(
    () =>
      new Set(
        rows
          .filter(
            (r) =>
              r.pendingCount > 0 &&
              canApproveByRank(viewerRole, r.role, r.memberId === viewerMemberId)
          )
          .map((r) => r.memberId)
      ),
    [rows, viewerRole, viewerMemberId]
  );

  const kpis = useMemo(
    () => ({
      pending: rows.reduce((n, r) => n + r.pendingCount, 0),
      paid: rows.reduce((n, r) => n + r.paidHours, 0),
      ot: rows.reduce((n, r) => n + r.otHours, 0),
    }),
    [rows]
  );

  function toggle(set: Set<string>, id: string): Set<string> {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  }

  async function approveMembers(memberIds: string[]) {
    setBusy(true);
    setError(null);
    const failures: string[] = [];
    for (const memberId of memberIds) {
      const res = await approveMemberWeek(memberId, weekStartIso, weekEndIso);
      if (!res.success) {
        const name = rows.find((r) => r.memberId === memberId)?.displayName ?? memberId;
        failures.push(`${name}: ${res.error ?? 'failed'}`);
      }
    }
    setBusy(false);
    setSelected(new Set());
    if (failures.length > 0) setError(`Some weeks were not approved — ${failures.join(' · ')}`);
    router.refresh();
  }

  return (
    <div>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          marginBottom: '16px',
          gap: '16px',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h2 style={h2Style}>Timesheets</h2>
          <p style={{ color: color.muted, fontSize: '14px', margin: '4px 0 0' }}>
            Week of {weekLabel} · you may approve roles strictly below you
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <Link
            href={`/dashboard/timeclock/timesheets?week=${prevAnchor}`}
            style={secondaryButtonStyle}
          >
            ‹ Prev
          </Link>
          <Link
            href={`/dashboard/timeclock/timesheets?week=${nextAnchor}`}
            style={secondaryButtonStyle}
          >
            Next ›
          </Link>
          <button
            style={{
              ...primaryButtonStyle,
              opacity: busy || selected.size === 0 ? 0.55 : 1,
            }}
            disabled={busy || selected.size === 0}
            onClick={() => void approveMembers([...selected])}
          >
            {busy ? 'Approving…' : `Approve selected${selected.size > 0 ? ` (${selected.size})` : ''}`}
          </button>
        </div>
      </div>

      {error && (
        <div
          style={{
            ...cardStyle,
            borderColor: '#f3c4c4',
            backgroundColor: '#fdf0f0',
            color: color.dangerAlt,
            padding: '12px 16px',
            marginBottom: '14px',
            fontSize: '13px',
          }}
        >
          {error}
        </div>
      )}

      <LiveBoard timeZone={timeZone} />

      {/* 4-up KPI row. Labor Cost absent (not blanked) for gated roles — the
          row reflows (§2 [S84]). */}
      <div style={{ display: 'flex', gap: '14px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <KpiCard label="Pending" value={String(kpis.pending)} caption="sessions awaiting approval" />
        <KpiCard label="Paid Hours (wk)" value={fmtHours(kpis.paid)} />
        <KpiCard
          label="Overtime (derived)"
          value={fmtHours(kpis.ot)}
          valueColor={kpis.ot > 0 ? color.warning : undefined}
          caption="derived"
        />
        {canSeeLaborCost && (
          <KpiCard
            label="Labor Cost (wk)"
            value={
              laborCost && laborCost.priced > 0
                ? laborCost.total.toLocaleString('en-US', {
                    style: 'currency',
                    currency: 'USD',
                  })
                : '—'
            }
            caption={
              !laborCost || laborCost.totalMembers === 0
                ? 'no time this week'
                : laborCost.priced === 0
                  ? 'no pay rates yet'
                  : laborCost.priced < laborCost.totalMembers
                    ? `priced for ${laborCost.priced} of ${laborCost.totalMembers} members`
                    : 'incl. 1.5× OT past 40h'
            }
          />
        )}
      </div>

      {/* Member table (handoff 4a grid) */}
      <div style={{ ...cardStyle, overflow: 'hidden' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: GRID,
            gap: '12px',
            padding: '11px 20px',
            backgroundColor: color.tableHeadBg,
            borderBottom: `1px solid ${color.cardBorder}`,
          }}
        >
          <span />
          <span style={microLabelStyle}>Member</span>
          <span style={microLabelStyle}>Paid hrs</span>
          <span style={microLabelStyle}>Worked</span>
          <span style={microLabelStyle}>OT</span>
          <span style={microLabelStyle}>Status</span>
          <span style={microLabelStyle}>Action</span>
        </div>

        {rows.length === 0 && (
          <p style={{ padding: '22px 20px', margin: 0, fontSize: '14px', color: color.muted }}>
            No time in this week.
          </p>
        )}

        {rows.map((row) => {
          const canApprove = approvable.has(row.memberId);
          const isExpanded = expanded.has(row.memberId);
          return (
            <div key={row.memberId} style={{ borderBottom: `1px solid ${color.rowDivider}` }}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: GRID,
                  gap: '12px',
                  alignItems: 'center',
                  padding: '13px 20px',
                }}
              >
                <span>
                  {canApprove && (
                    <input
                      type="checkbox"
                      checked={selected.has(row.memberId)}
                      onChange={() => setSelected((s) => toggle(s, row.memberId))}
                    />
                  )}
                </span>
                <button
                  onClick={() => setExpanded((s) => toggle(s, row.memberId))}
                  style={{
                    border: 'none',
                    background: 'none',
                    padding: 0,
                    textAlign: 'left',
                    cursor: 'pointer',
                    display: 'flex',
                    gap: '10px',
                    alignItems: 'center',
                  }}
                >
                  <span
                    style={{
                      width: '30px',
                      height: '30px',
                      borderRadius: '8px',
                      backgroundColor: color.blueTint,
                      color: color.primary,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 700,
                      fontSize: '12px',
                      fontFamily: font.sans,
                      flexShrink: 0,
                    }}
                  >
                    {row.displayName
                      .split(/\s+/)
                      .map((p) => p[0])
                      .slice(0, 2)
                      .join('')
                      .toUpperCase()}
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <span
                      style={{
                        display: 'block',
                        fontSize: '14px',
                        fontWeight: 600,
                        color: color.navy,
                        fontFamily: font.sans,
                      }}
                    >
                      {row.displayName}
                    </span>
                    <span style={{ display: 'block', fontSize: '11px', color: color.muted }}>
                      {row.role
                        ? (ROLE_LABELS[row.role as CompanyRole] ?? row.role)
                        : 'Subcontractor'}
                    </span>
                  </span>
                </button>
                <span style={{ ...monoValue, fontSize: '13px', color: color.navy }}>
                  {fmtHours(row.paidHours)}
                </span>
                <span style={{ ...monoValue, fontSize: '13px', color: color.bodyAlt }}>
                  {fmtHours(row.workedHours)}
                </span>
                <span
                  style={{
                    ...monoValue,
                    fontSize: '13px',
                    color: row.otHours > 0 ? color.warning : color.faint,
                  }}
                >
                  {row.otHours > 0 ? fmtHours(row.otHours) : '—'}
                </span>
                <span style={{ fontSize: '12px' }}>
                  {row.isOwnerRow ? (
                    <StatusBadge status={null} />
                  ) : row.pendingCount === 0 ? (
                    <span>
                      <StatusBadge status="approved" />
                      {row.approverNames.length > 0 && (
                        <span
                          style={{ display: 'block', marginTop: '3px', fontSize: '11px', color: color.faint }}
                        >
                          by {row.approverNames.join(', ')}
                        </span>
                      )}
                    </span>
                  ) : row.approvedDayCount > 0 ? (
                    <span>
                      <StatusBadge status="pending" />
                      <span
                        style={{ display: 'block', marginTop: '3px', fontSize: '11px', color: color.faint }}
                      >
                        {row.approvedDayCount} of {row.dayCount} days approved
                      </span>
                    </span>
                  ) : (
                    <StatusBadge status="pending" />
                  )}
                </span>
                <span style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  {canApprove && (
                    <button
                      style={{ ...secondaryButtonStyle, padding: '6px 12px', fontSize: '12px' }}
                      disabled={busy}
                      onClick={() => void approveMembers([row.memberId])}
                    >
                      Approve week
                    </button>
                  )}
                  <button
                    onClick={() => setExpanded((s) => toggle(s, row.memberId))}
                    style={{
                      border: 'none',
                      background: 'none',
                      color: color.primary,
                      fontWeight: 600,
                      fontSize: '12px',
                      cursor: 'pointer',
                      padding: '4px 0',
                    }}
                  >
                    {isExpanded ? 'Hide days' : 'Days'}
                  </button>
                </span>
              </div>

              {isExpanded && (
                <div style={{ backgroundColor: color.tableHeadBg, padding: '4px 20px 10px 68px' }}>
                  {row.sessions.map((s) => (
                    <div
                      key={s.id}
                      style={{
                        display: 'flex',
                        gap: '16px',
                        alignItems: 'center',
                        padding: '7px 0',
                        borderBottom: `1px solid ${color.rowDivider}`,
                        fontSize: '13px',
                      }}
                    >
                      <span style={{ width: '110px', color: color.body, fontWeight: 600 }}>
                        {dayLabel(s.dayKey)}
                      </span>
                      <span style={{ ...monoValue, color: color.bodyAlt, width: '150px' }}>
                        {fmtTime(s.clock_in, timeZone)} –{' '}
                        {s.clock_out ? fmtTime(s.clock_out, timeZone) : 'open'}
                      </span>
                      <span style={{ ...monoValue, color: color.bodyAlt, width: '70px' }}>
                        {fmtHours(s.paidHours)}
                      </span>
                      <span style={{ flex: 1 }}>
                        <StatusBadge status={s.status} />
                      </span>
                      <Link
                        href={`/dashboard/timeclock/timesheets/${s.id}`}
                        style={{ color: color.primary, fontWeight: 600, textDecoration: 'none' }}
                      >
                        Detail →
                      </Link>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p style={{ fontSize: '12px', color: color.faint, margin: '12px 0 0' }}>
        OT is derived from weekly paid hours over the {otThresholdHours}h threshold, never
        selected.
      </p>
    </div>
  );
}
