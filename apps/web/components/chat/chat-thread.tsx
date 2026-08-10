'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { RotateCw } from 'lucide-react';
import { color, font } from '@/lib/theme';
import type { ChatMessageRow } from '@/lib/chat/messages';
import type { ThreadKind } from '@/lib/chat/threads';
import { useChatThread } from './use-chat-thread';
import { ChatComposer } from './chat-composer';

/**
 * THE thread view. One component, both desktop surfaces — A-C28.
 *
 * Spec: chat-spec.md §7.2, §7.3, ND-32, ND-38.
 *
 * ---------------------------------------------------------------------------
 * THE PANEL AND THE TAB DIFFER IN ONE NUMBER, AND THAT IS ALL — A-C28
 * ---------------------------------------------------------------------------
 * `surface` picks ND-38's page size — 50 in the tab, 25 in a panel — and
 * nothing else branches on it. #129 is what two implementations of one surface
 * cost: two markup editors that both "worked" and silently disagreed about what
 * a save produces. A second thread renderer for the tab would be that again,
 * written in the form that looks like agreement.
 *
 * ND-32: messages render as BUBBLES, a named D-4 exception. A conversation is
 * genuinely not a list of records — author, time and adjacency carry meaning
 * that card geometry throws away. The exception is scoped to the message list;
 * everything around it stays on card geometry.
 */

interface ChatThreadViewProps {
  projectId: string;
  /** Whose messages align right. The caller knows; this component does not ask. */
  myProfileId: string;
  surface: 'tab' | 'panel';
  kind?: ThreadKind;
}

function timeLabel(iso: string): string {
  // Formatting a server timestamp for display is not a clock comparison — the
  // value stays the database's, and only its presentation is local.
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function dayLabel(iso: string): string {
  return new Date(iso).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

export function ChatThreadView({
  projectId,
  myProfileId,
  surface,
  kind = 'crew',
}: ChatThreadViewProps) {
  const {
    thread,
    messages,
    pending,
    status,
    error,
    hasOlder,
    setHasOlder,
    pageSize,
    canPost,
    send,
    retry,
    markRead,
  } = useChatThread({ projectId, surface, kind });

  const scrollRef = useRef<HTMLDivElement>(null);
  const [older, setOlder] = useState<ChatMessageRow[]>([]);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const lastSeenCount = useRef(0);

  // Older pages live beside the live list rather than inside it: the poll's
  // watermark is built from the END of `messages`, and prepending history to
  // that array would leave the watermark correct only by luck.
  const all = [...older, ...messages];

  // §7.2 — scrolled to bottom on open, and kept there as messages arrive.
  useEffect(() => {
    if (status !== 'ready') return;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [status, messages.length]);

  // A message that arrived while the thread is open on screen has been seen.
  // Without this the badge lights for something the user is looking at.
  useEffect(() => {
    if (status !== 'ready') return;
    if (messages.length > lastSeenCount.current) {
      lastSeenCount.current = messages.length;
      void markRead();
    }
  }, [messages.length, status, markRead]);

  const loadOlder = useCallback(async () => {
    const first = all[0];
    if (!thread || !first || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const url = new URL('/api/chat/messages', window.location.origin);
      url.searchParams.set('thread_id', thread.id);
      url.searchParams.set('before', first.created_at);
      url.searchParams.set('surface', surface);
      const res = await fetch(url.toString());
      const json = res.ok ? await res.json() : { messages: [] };
      const page: ChatMessageRow[] = json.messages ?? [];
      // Short page means we have reached the start of the thread.
      if (pageSize !== null && page.length < pageSize) setHasOlder(false);
      if (page.length > 0) setOlder((current) => [...page, ...current]);
    } finally {
      setLoadingOlder(false);
    }
  }, [all, thread, loadingOlder, surface, pageSize, setHasOlder]);

  if (status === 'loading' || status === 'idle') {
    return <Centered>Opening…</Centered>;
  }

  if (status === 'denied') {
    return <Centered>{error ?? 'You do not have access to this conversation.'}</Centered>;
  }

  if (status === 'error') {
    return <Centered>{error ?? 'Something went wrong.'}</Centered>;
  }

  return (
    <div
      data-testid="chat-thread"
      data-thread-id={thread?.id}
      style={{ display: 'flex', minHeight: 0, flex: 1, flexDirection: 'column' }}
    >
      <div
        ref={scrollRef}
        data-testid="chat-messages"
        style={{ flex: 1, overflowY: 'auto', padding: '14px' }}
      >
        {/* §7.2 — no infinite history in v1, and the control appears only when
            a full page came back, i.e. when older messages can actually exist. */}
        {hasOlder && (
          <button
            type="button"
            data-testid="chat-load-older"
            onClick={() => void loadOlder()}
            disabled={loadingOlder}
            style={{
              display: 'block',
              margin: '0 auto 12px',
              padding: '5px 12px',
              borderRadius: '20px',
              border: `1px solid ${color.inputBorder}`,
              backgroundColor: color.cardBg,
              fontFamily: font.sans,
              fontSize: '12px',
              color: color.muted,
              cursor: 'pointer',
            }}
          >
            {loadingOlder ? 'Loading…' : 'Load older messages'}
          </button>
        )}

        {all.length === 0 && (
          <p
            data-testid="chat-empty"
            style={{ ...mutedStyle, textAlign: 'center', marginTop: '24px' }}
          >
            No messages yet. Say something.
          </p>
        )}

        {all.map((m, i) => {
          const mine = m.author_profile_id === myProfileId;
          const author = m.author
            ? `${m.author.first_name} ${m.author.last_name}`.trim()
            : 'Someone';
          const prev = all[i - 1];
          const newDay =
            !prev || new Date(prev.created_at).toDateString() !== new Date(m.created_at).toDateString();

          return (
            <div key={m.id}>
              {newDay && (
                <p style={{ ...mutedStyle, textAlign: 'center', margin: '10px 0' }}>
                  {dayLabel(m.created_at)}
                </p>
              )}
              <div
                data-testid="chat-message"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: mine ? 'flex-end' : 'flex-start',
                  marginBottom: '10px',
                }}
              >
                <div style={{ display: 'flex', gap: '7px', alignItems: 'baseline' }}>
                  <span style={{ fontFamily: font.sans, fontSize: '12px', fontWeight: 700, color: color.navy }}>
                    {mine ? 'You' : author}
                  </span>
                  <span style={mutedStyle}>{timeLabel(m.created_at)}</span>
                </div>
                <div
                  style={{
                    maxWidth: '82%',
                    marginTop: '3px',
                    padding: '8px 11px',
                    borderRadius: mine ? '13px 13px 3px 13px' : '13px 13px 13px 3px',
                    backgroundColor: mine ? color.primary : color.tableHeadBg,
                    color: mine ? '#fff' : color.body,
                    fontFamily: font.sans,
                    fontSize: '13px',
                    lineHeight: 1.45,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}
                >
                  {m.body}
                </div>
              </div>
            </div>
          );
        })}

        {/* ND-24 / A-C21 — in flight or failed, and NEVER shown as sent. No
            timestamp, no bubble colour of a delivered message, and a failure
            carries an explicit retry rather than vanishing. */}
        {pending.map((p) => (
          <div
            key={p.tempId}
            data-testid={p.state === 'failed' ? 'chat-message-failed' : 'chat-message-sending'}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', marginBottom: '10px' }}
          >
            <div
              style={{
                maxWidth: '82%',
                padding: '8px 11px',
                borderRadius: '13px 13px 3px 13px',
                border: `1px dashed ${p.state === 'failed' ? color.danger : color.faint}`,
                backgroundColor: '#fff',
                color: p.state === 'failed' ? color.danger : color.muted,
                fontFamily: font.sans,
                fontSize: '13px',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {p.body}
            </div>
            {p.state === 'failed' ? (
              <button
                type="button"
                data-testid="chat-retry"
                onClick={() => void retry(p.tempId)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  marginTop: '3px',
                  border: 'none',
                  background: 'none',
                  padding: 0,
                  fontFamily: font.sans,
                  fontSize: '12px',
                  fontWeight: 600,
                  color: color.danger,
                  cursor: 'pointer',
                }}
              >
                <RotateCw size={12} strokeWidth={2.2} aria-hidden />
                Not sent — retry
              </button>
            ) : (
              <span style={{ ...mutedStyle, marginTop: '3px' }}>Sending…</span>
            )}
          </div>
        ))}
      </div>

      {/* ---------------------------------------------------------------------
          §7.4 / A-C7 / M6M D-54 — THE COMPOSER IS ABSENT, NOT DISABLED.

          `canPost` comes from `chat_can_post`, which mirrors the INSERT policy.
          A disabled composer would still be in the DOM, and D-54 is explicit
          that a hidden button is not a permission — A-C7 asserts the render
          side ("no composer element in the DOM") and A-C6 asserts the policy
          side, and both are required because either alone is satisfiable by a
          build that gets the other wrong.
          ------------------------------------------------------------------ */}
      {canPost ? (
        <ChatComposer projectId={projectId} kind={kind} onSend={send} />
      ) : (
        <ReadOnlyBanner kind={kind} />
      )}
    </div>
  );
}

/**
 * §7.4 — what a crew member sees instead of a composer in the sub thread.
 *
 * Josh's requirement at Q24 was *"don't post here, subs can see this"*,
 * delivered *"cleaner and more professional."* Three constraints, and the third
 * is the one easiest to lose:
 *
 *   · say they cannot post;
 *   · say WHY — the sub audience is the reason, and a crew member who does not
 *     know that will file it as a bug;
 *   · do NOT scold. It is a normal thread they are welcome to read.
 *
 * The `sub` wording is §7.4's proposed text. The `crew` arm is the fallback for
 * a role that cannot post in a CREW thread — no role can reach it today (the
 * only reader excluded from posting there is a subcontractor, who cannot read
 * it either), so it exists so the component cannot render an empty footer if
 * that ever changes.
 */
function ReadOnlyBanner({ kind }: { kind: ThreadKind }) {
  return (
    <div
      data-testid="chat-readonly-banner"
      style={{
        borderTop: `1px solid ${color.cardBorder}`,
        backgroundColor: color.tableHeadBg,
        padding: '12px 14px',
      }}
    >
      <p
        style={{
          margin: 0,
          fontFamily: font.sans,
          fontSize: '12.5px',
          lineHeight: 1.5,
          color: color.bodyAlt,
        }}
      >
        {kind === 'sub' ? (
          <>
            <strong style={{ fontWeight: 700, color: color.navy }}>Read-only</strong> — this
            thread includes subcontractors. You can follow along here; post in the crew thread
            instead.
          </>
        ) : (
          <>
            <strong style={{ fontWeight: 700, color: color.navy }}>Read-only</strong> — you can
            follow this conversation but not post in it.
          </>
        )}
      </p>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div
      data-testid="chat-thread-status"
      style={{
        display: 'flex',
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        textAlign: 'center',
      }}
    >
      <p style={mutedStyle}>{children}</p>
    </div>
  );
}

const mutedStyle: React.CSSProperties = {
  margin: 0,
  fontFamily: font.sans,
  fontSize: '12px',
  color: color.muted,
};
