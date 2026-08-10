'use client';

import { useCallback, useEffect, useState } from 'react';
import { MessageSquare, X } from 'lucide-react';
import { color, font } from '@/lib/theme';
import type { SwitcherProject } from '@/lib/chat/switcher';
import { ChatBody, ChatBackButton } from './chat-body';

/**
 * The global chat panel — ND-33, §7.1a.
 *
 * ===========================================================================
 * GLOBAL, AND MOUNTED ONCE. NOT PER PAGE.
 * ===========================================================================
 * §7.1a: a persistent chat icon on EVERY dashboard page — Contacts, Estimates,
 * Settings, Billing, everywhere in /dashboard — opening a panel OVER whatever
 * the user is on. No navigation, no route change, no loss of the form they were
 * filling in (A-C24, A-C25).
 *
 * That is why this mounts in `dashboard-shell.tsx` and nowhere else. §7.1a says
 * it in as many words: "A per-page mount would be a second implementation of
 * the same surface — #129's shape."
 *
 * ⚠️ THE CHROME IS ALL THIS FILE OWNS [slice 5]. Everything chat DOES — the
 * switcher, the segments, the thread, what a send produces — lives in
 * `ChatBody`, shared with the mobile overlay. See that file for why.
 */

interface ChatPanelProps {
  myProfileId: string;
}

export function ChatPanel({ myProfileId }: ChatPanelProps) {
  const [open, setOpen] = useState(false);
  const [totalUnread, setTotalUnread] = useState(0);

  // Fetched here as well as inside ChatBody, because the badge must be right
  // while the panel is CLOSED and ChatBody is not mounted. It is the reason to
  // open the panel at all.
  const loadBadge = useCallback(async () => {
    try {
      const res = await fetch('/api/chat/threads');
      if (!res.ok) return;
      const json = (await res.json()) as { projects?: SwitcherProject[] };
      setTotalUnread((json.projects ?? []).reduce((sum, p) => sum + p.unreadCount, 0));
    } catch {
      /* a failed count hides the badge rather than breaking the shell */
    }
  }, []);

  useEffect(() => {
    void loadBadge();
  }, [loadBadge]);

  // Refreshed when the panel closes, so reading a thread clears the badge
  // without a page reload.
  useEffect(() => {
    if (!open) void loadBadge();
  }, [open, loadBadge]);

  return (
    <>
      <button
        type="button"
        data-testid="chat-launcher"
        aria-label={open ? 'Close chat' : 'Open chat'}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        style={{
          position: 'fixed',
          right: '24px',
          bottom: '24px',
          zIndex: 60,
          display: 'flex',
          height: '54px',
          width: '54px',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '50%',
          border: 'none',
          backgroundColor: color.primary,
          color: '#fff',
          boxShadow: '0 6px 18px rgba(20,33,61,0.28)',
          cursor: 'pointer',
        }}
      >
        {open ? (
          <X size={22} strokeWidth={2.2} aria-hidden />
        ) : (
          <MessageSquare size={22} strokeWidth={2.1} aria-hidden />
        )}
        {/* Nothing at 0 — an always-present "0" trains people to ignore the
            badge, the same reasoning as the sidebar's notification count. */}
        {!open && totalUnread > 0 && (
          <span
            data-testid="chat-launcher-badge"
            style={{
              position: 'absolute',
              top: '-2px',
              right: '-2px',
              minWidth: '20px',
              borderRadius: '999px',
              backgroundColor: color.amber,
              color: color.navy,
              fontFamily: font.mono,
              fontSize: '11px',
              fontWeight: 700,
              lineHeight: '20px',
              textAlign: 'center',
            }}
          >
            {totalUnread > 9 ? '9+' : totalUnread}
          </span>
        )}
      </button>

      {open && (
        <section
          data-testid="chat-panel"
          aria-label="Chat"
          style={{
            position: 'fixed',
            right: '24px',
            bottom: '88px',
            zIndex: 60,
            display: 'flex',
            width: '384px',
            maxWidth: 'calc(100vw - 48px)',
            height: '560px',
            maxHeight: 'calc(100vh - 128px)',
            flexDirection: 'column',
            overflow: 'hidden',
            backgroundColor: color.cardBg,
            border: `1px solid ${color.cardBorder}`,
            borderRadius: '13px',
            boxShadow: '0 18px 44px rgba(20,33,61,0.22)',
          }}
        >
          <ChatBody
            myProfileId={myProfileId}
            renderHeader={({ title, onBack }) => (
              <header
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '9px',
                  padding: '12px 14px',
                  borderBottom: `1px solid ${color.cardBorder}`,
                }}
              >
                {onBack && <ChatBackButton onClick={onBack} />}
                <h2
                  data-testid="chat-panel-title"
                  style={{
                    margin: 0,
                    fontFamily: font.sans,
                    fontSize: '14px',
                    fontWeight: 700,
                    color: color.navy,
                  }}
                >
                  {title}
                </h2>
              </header>
            )}
          />
        </section>
      )}
    </>
  );
}
