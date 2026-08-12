'use client';

import { color, font } from '@/lib/theme';
import type { SwitcherProject, SwitcherThread } from '@/lib/chat/switcher';
import type { ThreadKind } from '@/lib/chat/threads';

/** A project as the switcher route reports it — threads plus available segments. */
export type SwitcherEntry = SwitcherProject & { kinds: ThreadKind[] };

/**
 * §7.1e — thread selection within a surface.
 *
 * ⚠️ TWO SEGMENTS ONLY WHERE BOTH EXIST. Where only one does there is **no
 * segmented control at all — and not a disabled second segment**. A control
 * with one option is not a control, and a disabled second one advertises a
 * conversation the viewer can never open (ND-25: no thread, not an empty one).
 *
 * `kinds` is computed by the server from the role rules and ND-25; this
 * component renders what it is given and decides nothing.
 */
export function ThreadSegments({
  kinds,
  value,
  onChange,
  threads,
}: {
  kinds: ThreadKind[];
  value: ThreadKind;
  onChange: (k: ThreadKind) => void;
  threads: SwitcherThread[];
}) {
  if (kinds.length < 2) return null;

  return (
    <div
      data-testid="chat-thread-segments"
      style={{
        display: 'flex',
        gap: '6px',
        padding: '9px 14px',
        borderBottom: `1px solid ${color.cardBorder}`,
      }}
    >
      {kinds.map((k) => {
        const selected = k === value;
        // Each segment carries its own unread dot — §7.1e. Unread is per
        // thread (A-C4), so reading the crew thread must leave this one lit.
        const unread = threads.find((t) => t.kind === k)?.unreadCount ?? 0;
        return (
          <button
            key={k}
            type="button"
            data-testid={`chat-segment-${k}`}
            data-selected={selected}
            aria-pressed={selected}
            onClick={() => onChange(k)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '5px 12px',
              borderRadius: '20px',
              border: `1px solid ${selected ? color.primary : color.inputBorder}`,
              backgroundColor: selected ? color.blueTint : '#fff',
              color: selected ? color.primary : color.body,
              fontFamily: font.sans,
              fontSize: '12.5px',
              fontWeight: selected ? 700 : 500,
              cursor: 'pointer',
            }}
          >
            {k === 'crew' ? 'Crew' : 'Subs'}
            {unread > 0 && (
              <span
                data-testid={`chat-segment-unread-${k}`}
                style={{
                  minWidth: '17px',
                  borderRadius: '999px',
                  backgroundColor: color.primary,
                  color: '#fff',
                  fontFamily: font.mono,
                  fontSize: '10px',
                  fontWeight: 700,
                  lineHeight: '17px',
                  textAlign: 'center',
                }}
              >
                {unread > 9 ? '9+' : unread}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

