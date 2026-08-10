'use client';

import { X } from 'lucide-react';
import { color, font } from '@/lib/theme';
import { ChatBody, ChatBackButton } from './chat-body';

/**
 * Mobile chat — ND-36, ND-37, §7.1d.
 *
 * ===========================================================================
 * AN OVERLAY. IT OWNS NO ROUTE, AND THAT IS THE RULING.
 * ===========================================================================
 * ND-37: "Tapping Chat opens a panel over the current screen. It does not
 * navigate", matching the desktop shape. ND-40 then rules where a mention
 * LANDS: `/m/p/{id}?chat=1` — a param on a screen that already exists, never a
 * `/m/p/{id}/chat` route. A thin route "just for the link" would put a chat
 * page back in the tree and make ND-37 half-true, which is worse than either
 * whole answer. A-C42 asserts both halves.
 *
 * ---------------------------------------------------------------------------
 * ⚠️ IT MUST NOT COVER THE TAB BAR — A-C35, and M6M A-1
 * ---------------------------------------------------------------------------
 * "With the overlay open, the tab bar is STILL IN THE DOM and the Chat slot is
 * still tappable", because the Chat slot is how the overlay is closed. A panel
 * that covered the bar would both fail M6M A-1 ("the tab bar renders on every
 * /m/** route and does not scroll out of view") and TRAP the user in one move.
 *
 * That guarantee is LAYOUT, not z-index: this renders inside the shell's
 * content region, which sits above the `<nav>` as a sibling — the same
 * technique the hamburger sheet uses and for the same reason. A stacking-order
 * fix would work until someone added a transform.
 */

export function MobileChatOverlay({
  open,
  onClose,
  myProfileId,
  projectId = null,
}: {
  open: boolean;
  onClose: () => void;
  myProfileId: string;
  /** ND-40 — the project screen underneath, so `?chat=1` lands IN the thread. */
  projectId?: string | null;
}) {
  if (!open) return null;

  return (
    <section
      data-testid="m-chat-overlay"
      aria-label="Chat"
      className="absolute inset-0 z-40 flex flex-col bg-m6m-card"
    >
      <ChatBody
        myProfileId={myProfileId}
        // Landing on a project screen opens THAT project's thread rather than
        // the switcher — §5.6c: the one shape the recipient of "@Josh needs you
        // on Alvarez" must not get is a list they have to search.
        initialProjectId={projectId}
        renderHeader={({ title, onBack }) => (
          <header
            className="flex shrink-0 items-center gap-[9px] border-b border-m6m-border px-[14px] py-[12px]"
            style={{ backgroundColor: color.cardBg }}
          >
            {onBack && <ChatBackButton onClick={onBack} />}
            <h2
              data-testid="m-chat-title"
              style={{
                margin: 0,
                flex: 1,
                fontFamily: font.sans,
                fontSize: '15px',
                fontWeight: 700,
                color: color.navy,
              }}
            >
              {title}
            </h2>
            {/* A second way out, beside the Chat slot. The slot is the ruled
                one (A-C35); this is the one a thumb finds without leaving the
                overlay's own chrome. */}
            <button
              type="button"
              data-testid="m-chat-close"
              aria-label="Close chat"
              onClick={onClose}
              className="flex h-11 w-11 shrink-0 items-center justify-center"
              style={{ border: 'none', background: 'none', color: color.muted }}
            >
              <X size={20} strokeWidth={2.1} aria-hidden />
            </button>
          </header>
        )}
      />
    </section>
  );
}
