'use client';

// 7A §5.1 — the mandatory material-run prompt, shared by BOTH segment-end
// paths (S90 Q1: clock-out in ClockModal and switch in timeclock-client).
// Renders inside the host's existing modal card. The prompt fires BEFORE the
// segment ends (S90 Q2) because the decline rides the segment's end note —
// there is no post-end note write path (expenses-client.ts, withDeclineNote).
// "No purchase made" is an explicit tap (Q10), never a default.

import { color, primaryButtonStyle, secondaryButtonStyle } from '@/lib/theme';

interface MaterialRunPromptProps {
  busy: boolean;
  /** Explicit decline — the host composes withDeclineNote() into the end
   *  note and proceeds with the segment end. */
  onNoPurchase: () => void;
  /** The host ends the segment, then opens the capture sheet pre-filled. */
  onLogExpense: () => void;
}

export function MaterialRunPrompt({ busy, onNoPurchase, onLogExpense }: MaterialRunPromptProps) {
  return (
    <div>
      <p style={{ fontSize: '14px', fontWeight: 600, color: color.navy, margin: '0 0 6px' }}>
        Did you buy anything on this material run?
      </p>
      <p style={{ fontSize: '12px', color: color.muted, margin: '0 0 16px' }}>
        Log the receipt now while you have it — or record that no purchase was made.
      </p>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
        <button style={secondaryButtonStyle} disabled={busy} onClick={onNoPurchase}>
          No purchase made
        </button>
        <button
          style={{ ...primaryButtonStyle, opacity: busy ? 0.6 : 1 }}
          disabled={busy}
          onClick={onLogExpense}
        >
          Log expense
        </button>
      </div>
    </div>
  );
}
