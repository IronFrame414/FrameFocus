'use client';

import type React from 'react';
import { primaryButtonStyle, secondaryButtonStyle } from '@/lib/theme';

// ASK-11 [S121] — the hours changed on an APPROVED day: say so, and offer
// Approve. Extracted from the week sheet [S122 0-B-4] so the older day page's
// clock correction shows THE SAME notice rather than a second one that "does
// the same thing" (PARITY: share the mechanism, not the intent). The database
// decides whether the day reopened (`returned_to_pending`); this only reports
// it.
export function HoursChangedNotice({
  dayText,
  canApprove,
  busy,
  onApprove,
  onClose,
  style,
}: {
  /** e.g. "Mon 28 Sep" — the day that went back to pending. */
  dayText: string;
  /** Whether THIS viewer may approve that member (can_approve_member / Owner-Admin). */
  canApprove: boolean;
  busy: boolean;
  onApprove: () => void;
  onClose: () => void;
  style?: React.CSSProperties;
}) {
  return (
    <div
      role="alertdialog"
      aria-labelledby="ts-reopened-title"
      data-testid="ts-reopened"
      style={{
        border: '1px solid #f3c77e',
        backgroundColor: '#fff8eb',
        borderRadius: '10px',
        padding: '12px',
        ...style,
      }}
    >
      <p
        id="ts-reopened-title"
        style={{ margin: '0 0 8px', fontSize: '14px', fontWeight: 700, color: '#8a5a12' }}
      >
        Hours changed — {dayText} is back to pending and must be approved again.
      </p>
      <div style={{ display: 'flex', gap: '8px' }}>
        {canApprove ? (
          <button
            type="button"
            data-testid="ts-reopened-approve"
            style={primaryButtonStyle}
            disabled={busy}
            onClick={onApprove}
          >
            Approve
          </button>
        ) : null}
        <button
          type="button"
          data-testid="ts-reopened-close"
          style={secondaryButtonStyle}
          onClick={onClose}
        >
          {canApprove ? 'Later' : 'OK'}
        </button>
      </div>
    </div>
  );
}
