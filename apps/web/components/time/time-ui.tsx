// Module 6A shared UI bits (6A-1 timeclock + 6A-2 timesheets). Semantic
// tokens from the M6 handoff README (§4.5 of the 6A-2 spec) — segment color
// bars, session status badges, mono time formatting.

import { badgeStyle, color, font } from '@/lib/theme';
import type { SegmentType, SessionApprovalStatus } from '@framefocus/shared/utils/time-tracking';

/** Segment color bar (handoff): work = blue, break = grey, travel/shop =
 *  amber. material_run/warranty are project-bearing work — blue (judgment
 *  call; the handoff names only the three). */
export function segmentBarColor(type: SegmentType): string {
  if (type === 'break') return '#c3c9d4';
  if (type === 'travel' || type === 'shop') return '#e88a52';
  return color.primary;
}

/** 6px rounded bar left of a segment row. */
export function SegmentBar({ type }: { type: SegmentType }) {
  return (
    <span
      style={{
        display: 'inline-block',
        width: '6px',
        alignSelf: 'stretch',
        borderRadius: '3px',
        backgroundColor: segmentBarColor(type),
      }}
    />
  );
}

/** Session status badge. NULL status = the Owner "no approval state" case. */
export function StatusBadge({ status }: { status: SessionApprovalStatus }) {
  if (status === 'approved') {
    return (
      <span style={{ ...badgeStyle, backgroundColor: '#e4f0e6', color: '#3d7a4b' }}>Approved</span>
    );
  }
  if (status === 'pending') {
    return (
      <span style={{ ...badgeStyle, backgroundColor: '#fdece0', color: '#b45309' }}>Pending</span>
    );
  }
  return (
    <span style={{ ...badgeStyle, backgroundColor: '#eef1f6', color: '#6b7280' }}>
      No approval / Owner — n/a
    </span>
  );
}

/** Small faint caption for derived / read-only values (handoff convention). */
export function ReadOnlyCaption({ children }: { children: React.ReactNode }) {
  return <span style={{ fontSize: '11px', color: color.faint }}>{children}</span>;
}

const TIME_FMT = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' });

export function fmtTime(iso: string | null): string {
  if (!iso) return '—';
  return TIME_FMT.format(new Date(iso));
}

export function fmtHours(hours: number): string {
  return `${hours.toFixed(2)}h`;
}

export function fmtDuration(hours: number): string {
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${m.toString().padStart(2, '0')}m`;
}

/** Monospace value style (all hours/dates/IDs render in IBM Plex Mono). */
export const monoValue: React.CSSProperties = { fontFamily: font.mono };
