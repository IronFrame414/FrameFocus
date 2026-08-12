'use client';

import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { color, font } from '@/lib/theme';
import type { ThreadKind } from '@/lib/chat/threads';
import { ChatThreadView } from './chat-thread';
import { ThreadSegments, type SwitcherEntry } from './chat-segments';

/**
 * THE WHOLE OF CHAT'S BEHAVIOUR, ONCE — switcher, segments, thread.
 *
 * ===========================================================================
 * WHY THIS EXISTS: PARITY IS SHARING THE MECHANISM, NOT THE INTENT
 * ===========================================================================
 * Desktop wraps this in a floating panel (ND-33); mobile wraps it in a
 * full-width overlay above the tab bar (ND-37). Those two chromes genuinely
 * differ — a phone is not a desktop — and CLAUDE.md's parity ruling permits
 * exactly that: "Layout, spacing and input affordances may differ. What must
 * not differ is behaviour."
 *
 * So the chrome is the only thing either surface owns. Which projects are
 * listed, which segments a project offers, what opening a thread does to unread
 * state, what a send produces — all of it is here, in one component, reached
 * identically from both.
 *
 * ⚠️ THE ALTERNATIVE IS #129, AND #129 IS WHY THE RULE EXISTS. Two markup
 * editors "both worked" and quietly disagreed about what a save produces, so a
 * photo annotated on desktop rendered on mobile as an unannotated original with
 * no indication the markup existed. A second switcher implementation that "does
 * the same thing" is that divergence, written in the form that looks like
 * agreement.
 */

export interface ChatBodyProps {
  myProfileId: string;
  /**
   * Open straight into this project, skipping the list — ND-40's `?chat=1`
   * landing on a project screen. `null` opens the switcher.
   */
  initialProjectId?: string | null;
  /** Rendered by the surface, given the current title and a back handler. */
  renderHeader: (args: { title: string; onBack: (() => void) | null }) => React.ReactNode;
}

export function ChatBody({ myProfileId, initialProjectId = null, renderHeader }: ChatBodyProps) {
  const [projects, setProjects] = useState<SwitcherEntry[] | null>(null);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(initialProjectId);
  const [kind, setKind] = useState<ThreadKind>('crew');

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/chat/threads');
      if (!res.ok) {
        setProjects([]);
        return;
      }
      const json = (await res.json()) as { projects?: SwitcherEntry[] };
      setProjects(json.projects ?? []);
    } catch {
      setProjects([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Returning to the list refetches, so unread counts are the DATABASE's answer
  // rather than a number the client decremented for itself.
  useEffect(() => {
    if (activeProjectId === null) void load();
  }, [activeProjectId, load]);

  const active = projects?.find((p) => p.projectId === activeProjectId) ?? null;

  // A project opened by deep link (?chat=1) arrives before the list does, so
  // the segment default has to be applied once the entry is known.
  useEffect(() => {
    if (active) setKind((k) => (active.kinds.includes(k) ? k : (active.kinds[0] ?? 'crew')));
  }, [active]);

  return (
    <>
      {renderHeader({
        title: active ? active.projectName : 'Chat',
        onBack: active ? () => setActiveProjectId(null) : null,
      })}

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
              // A-C26 — state, not navigation. The page underneath keeps
              // everything; on mobile the screen behind the overlay likewise.
              onClick={() => {
                setActiveProjectId(p.projectId);
                setKind(p.kinds[0] ?? 'crew');
              }}
              style={rowStyle}
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
                <span data-testid="chat-switcher-unread" style={badge}>
                  {p.unreadCount > 9 ? '9+' : p.unreadCount}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

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
            // ND-38: the mobile panel uses the PANEL number (25), not a third
            // one. "It is the same component and a smaller canvas; inventing a
            // mobile-specific size would be a third constant to keep in step
            // for no observable gain."
            surface="panel"
            kind={kind}
          />
        </>
      )}
    </>
  );
}

/** The back affordance both surfaces put in their own header. */
export function ChatBackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      data-testid="chat-back"
      aria-label="Back to projects"
      onClick={onClick}
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
  );
}

const emptyStyle: React.CSSProperties = {
  margin: 0,
  padding: '18px 14px',
  fontFamily: font.sans,
  fontSize: '12px',
  color: color.muted,
};

const rowStyle: React.CSSProperties = {
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
};

const badge: React.CSSProperties = {
  minWidth: '20px',
  borderRadius: '999px',
  backgroundColor: color.primary,
  color: '#fff',
  fontFamily: font.mono,
  fontSize: '11px',
  fontWeight: 700,
  lineHeight: '20px',
  textAlign: 'center',
};
