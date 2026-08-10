'use client';

import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, MessageSquare, X } from 'lucide-react';
import { color, font } from '@/lib/theme';
import type { ThreadKind } from '@/lib/chat/threads';
import { ChatThreadView } from './chat-thread';
import { ThreadSegments, type SwitcherEntry } from './chat-segments';

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
 * The interview's actual problem lives here. Q4's "text just sits" is a failure
 * of REACHABILITY, and a surface you must navigate into to answer is one more
 * reason not to answer.
 */

interface ChatPanelProps {
  myProfileId: string;
}

export function ChatPanel({ myProfileId }: ChatPanelProps) {
  const [open, setOpen] = useState(false);
  const [projects, setProjects] = useState<SwitcherEntry[] | null>(null);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  /** Which segment is open. Reset to the project's first available on switch. */
  const [kind, setKind] = useState<ThreadKind>('crew');
  const [totalUnread, setTotalUnread] = useState(0);

  const loadSwitcher = useCallback(async () => {
    try {
      const res = await fetch('/api/chat/threads');
      if (!res.ok) {
        setProjects([]);
        return;
      }
      const json = (await res.json()) as { projects?: SwitcherEntry[] };
      const list = json.projects ?? [];
      setProjects(list);
      setTotalUnread(list.reduce((sum, p) => sum + p.unreadCount, 0));
    } catch {
      setProjects([]);
    }
  }, []);

  // The badge is the reason to open the panel, so it has to be right before it
  // is opened. Loaded once on mount; refreshed whenever the list is shown.
  useEffect(() => {
    void loadSwitcher();
  }, [loadSwitcher]);

  useEffect(() => {
    if (open && activeProjectId === null) void loadSwitcher();
  }, [open, activeProjectId, loadSwitcher]);

  const active = projects?.find((p) => p.projectId === activeProjectId) ?? null;

  return (
    <>
      {/* ---- the launcher: fixed, bottom-right, on every dashboard page ---- */}
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

      {!open ? null : (
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
          <header
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '9px',
              padding: '12px 14px',
              borderBottom: `1px solid ${color.cardBorder}`,
            }}
          >
            {active && (
              <button
                type="button"
                data-testid="chat-back"
                aria-label="Back to projects"
                onClick={() => setActiveProjectId(null)}
                style={{
                  display: 'flex',
                  border: 'none',
                  background: 'none',
                  padding: 0,
                  color: color.muted,
                  cursor: 'pointer',
                }}
              >
                <ArrowLeft size={17} strokeWidth={2.1} aria-hidden />
              </button>
            )}
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
              {active ? active.projectName : 'Chat'}
            </h2>
          </header>

          {/* ---- the switcher (ND-34) ---- */}
          {!active && (
            <div data-testid="chat-switcher" style={{ flex: 1, overflowY: 'auto' }}>
              {projects === null && <p style={emptyStyle}>Loading…</p>}

              {projects !== null && projects.length === 0 && (
                <p data-testid="chat-switcher-empty" style={emptyStyle}>
                  No active projects to chat about.
                </p>
              )}

              {(projects ?? []).map((p) => (
                <button
                  key={p.projectId}
                  type="button"
                  data-testid="chat-switcher-project"
                  data-project-id={p.projectId}
                  data-unread={p.unreadCount}
                  // A-C26 — this changes state, it does not navigate. No Link,
                  // no router.push: the page underneath keeps everything.
                  onClick={() => {
                    setActiveProjectId(p.projectId);
                    // A subcontractor's only segment is `sub`, so defaulting to
                    // 'crew' would open a thread RLS refuses them and show the
                    // 403 state instead of their conversation.
                    setKind(p.kinds[0] ?? 'crew');
                  }}
                  style={{
                    display: 'flex',
                    width: '100%',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '11px 14px',
                    border: 'none',
                    borderBottom: `1px solid ${color.rowDivider}`,
                    background: 'none',
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                >
                  <span
                    style={{
                      flex: 1,
                      fontFamily: font.sans,
                      fontSize: '13px',
                      fontWeight: p.unreadCount > 0 ? 700 : 500,
                      color: color.navy,
                    }}
                  >
                    {p.projectName}
                  </span>
                  {p.unreadCount > 0 && (
                    <span
                      data-testid="chat-switcher-unread"
                      style={{
                        minWidth: '20px',
                        borderRadius: '999px',
                        backgroundColor: color.primary,
                        color: '#fff',
                        fontFamily: font.mono,
                        fontSize: '11px',
                        fontWeight: 700,
                        lineHeight: '20px',
                        textAlign: 'center',
                      }}
                    >
                      {p.unreadCount > 9 ? '9+' : p.unreadCount}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* ---- the thread: the SAME component the tab renders (A-C28) ---- */}
          {active && (
            <>
              <ThreadSegments
                kinds={active.kinds}
                value={kind}
                onChange={setKind}
                threads={active.threads}
              />
              <ChatThreadView
                key={`${active.projectId}:${kind}`}
                projectId={active.projectId}
                myProfileId={myProfileId}
                surface="panel"
                kind={kind}
              />
            </>
          )}
        </section>
      )}
    </>
  );
}

const emptyStyle: React.CSSProperties = {
  margin: 0,
  padding: '18px 14px',
  fontFamily: font.sans,
  fontSize: '12px',
  color: color.muted,
};
