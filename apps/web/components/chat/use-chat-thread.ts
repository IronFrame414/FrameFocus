'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createChatPoll } from '@/lib/chat/poll';
import type { ChatMessageWithPhotos } from '@/lib/chat/photos';
import type { ChatThread, ThreadKind } from '@/lib/chat/threads';

/**
 * One thread's state: open it, hold its messages, keep it current, send to it.
 *
 * Spec: chat-spec.md §7.2, §7.3, ND-24, ND-26, A-C39/A-C40/A-C41.
 *
 * ---------------------------------------------------------------------------
 * THE TRANSPORT IS `createChatPoll` AND `/api/chat/messages`. NOTHING ELSE.
 * ---------------------------------------------------------------------------
 * A-C41: nothing above the service function knows how messages arrive. This
 * hook asks "give me messages since X" on an interval it does not own — the
 * interval, the visibility rule and the overlap guard all live in
 * `lib/chat/poll.ts`, which is already unit-tested against a fake clock. A
 * component that reached for `setInterval` itself, or subscribed to Realtime
 * directly, would destroy §9.1c's "one file plus a migration" property.
 *
 * ---------------------------------------------------------------------------
 * ⚠️ `since` IS A DATABASE TIMESTAMP. THE BROWSER NEVER MINTS ONE.
 * ---------------------------------------------------------------------------
 * Every value `sinceRef` ever holds is a `created_at` Postgres stamped and the
 * server handed back. `new Date().toISOString()` must never appear in this
 * file. The two clocks are not the same clock, and a browser running even
 * slightly fast would ask for messages newer than a moment that has not
 * happened yet: it would receive nothing, forever, and show no error at all.
 * That is not hypothetical — it is what `markThreadRead` did until migration
 * 20260908000000, and unread state is what this hook renders.
 */

export type ThreadStatus = 'idle' | 'loading' | 'ready' | 'denied' | 'error';

/** ND-24 — a send in flight or failed. Never merged into the real message list. */
export interface PendingMessage {
  tempId: string;
  body: string;
  state: 'sending' | 'failed';
  /** ND-22 — carried so a RETRY re-attaches the same references (§7.3). */
  fileIds?: string[];
}

export interface SendOutcome {
  ok: boolean;
  /** Tokens that matched nobody or matched more than one person. */
  unresolved: string[];
}

interface UseChatThreadArgs {
  projectId: string | null;
  surface: 'tab' | 'panel';
  kind?: ThreadKind;
}

export function useChatThread({ projectId, surface, kind = 'crew' }: UseChatThreadArgs) {
  const [thread, setThread] = useState<ChatThread | null>(null);
  const [messages, setMessages] = useState<ChatMessageWithPhotos[]>([]);
  const [pending, setPending] = useState<PendingMessage[]>([]);
  const [status, setStatus] = useState<ThreadStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  /** Whether a page older than the one held could exist at all (§7.2). */
  const [hasOlder, setHasOlder] = useState(false);
  /**
   * ND-38's page size for this surface, as the SERVER reported it.
   *
   * Not imported: `PAGE_SIZE` lives in `lib/chat/messages.ts`, which is
   * `server-only`, and a client component importing it would break the build.
   * Re-declaring 50/25 here would be the other failure — a second place the
   * number lives, drifting the moment one is changed.
   */
  const [pageSize, setPageSize] = useState<number | null>(null);
  /**
   * §7.4 / M6M D-54 — may this caller post here?
   *
   * ⚠️ ANSWERED BY THE DATABASE (`chat_can_post`), never inferred from the
   * viewer's role in the browser. Starts FALSE: a composer that renders before
   * permission is known is a composer that can render for someone who does not
   * have it, and "not yet loaded" must not look like "allowed".
   */
  const [canPost, setCanPost] = useState(false);

  // Refs, not state, because the poll's callback is created once when the timer
  // arms. Reading state there would capture the values from that first render
  // and every later poll would ask for messages since the beginning of time.
  const threadRef = useRef<ChatThread | null>(null);
  const sinceRef = useRef<string | null>(null);

  const absorb = useCallback((incoming: ChatMessageWithPhotos[]) => {
    if (incoming.length === 0) return;
    setMessages((current) => {
      const seen = new Set(current.map((m) => m.id));
      const fresh = incoming.filter((m) => !seen.has(m.id));
      if (fresh.length === 0) return current;
      const next = [...current, ...fresh];
      // The newest server timestamp becomes the next `since`. Taken from the
      // merged list rather than from `fresh` so an out-of-order arrival cannot
      // move the watermark backwards.
      sinceRef.current = next[next.length - 1]?.created_at ?? sinceRef.current;
      return next;
    });
  }, []);

  /** One poll: everything newer than what we hold. Not a refetch (A-C40). */
  const pull = useCallback(async () => {
    const open = threadRef.current;
    if (!open) return;
    const url = new URL('/api/chat/messages', window.location.origin);
    url.searchParams.set('thread_id', open.id);
    // ND-22 — the decorator resolves displayUrl through getProjectPhotos(), so
    // it needs the project. Omitting it returns messages with no thumbnails,
    // which is a silent loss rather than an error.
    url.searchParams.set('project_id', open.project_id);
    if (sinceRef.current) url.searchParams.set('since', sinceRef.current);

    const res = await fetch(url.toString());
    if (!res.ok) return;
    const json = (await res.json()) as { messages?: ChatMessageWithPhotos[] };
    absorb(json.messages ?? []);
  }, [absorb]);

  // ---- open the thread -----------------------------------------------------
  useEffect(() => {
    if (!projectId) {
      threadRef.current = null;
      sinceRef.current = null;
      setThread(null);
      setMessages([]);
      setPending([]);
      setStatus('idle');
      setError(null);
      setHasOlder(false);
      setCanPost(false);
      return;
    }

    let cancelled = false;
    setStatus('loading');
    setError(null);
    setMessages([]);
    setPending([]);
    setCanPost(false);
    threadRef.current = null;
    sinceRef.current = null;

    (async () => {
      try {
        const res = await fetch('/api/chat/threads', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ project_id: projectId, kind, surface }),
        });
        const json = await res.json().catch(() => ({}));
        if (cancelled) return;

        if (!res.ok) {
          setStatus(res.status === 403 ? 'denied' : 'error');
          setError(json.error ?? 'Could not open this conversation.');
          return;
        }

        const rows: ChatMessageWithPhotos[] = json.messages ?? [];
        threadRef.current = json.thread;
        sinceRef.current = rows[rows.length - 1]?.created_at ?? null;
        setThread(json.thread);
        setMessages(rows);
        // A page that came back SHORT is the whole thread — there is nothing
        // older to fetch, so the load-more control must not be offered. A
        // control that cannot do anything is worse than no control: it reads as
        // "there is more history here" on a thread with three messages in it.
        setPageSize(json.pageSize ?? null);
        setCanPost(json.canPost === true);
        setHasOlder(rows.length >= (json.pageSize ?? rows.length));
        setStatus('ready');
      } catch {
        if (!cancelled) {
          setStatus('error');
          setError('Could not reach the server.');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [projectId, kind, surface]);

  // ---- the poll ------------------------------------------------------------
  const threadId = thread?.id ?? null;
  useEffect(() => {
    if (status !== 'ready' || !threadId) return;

    const poll = createChatPoll({
      fetchSince: pull,
      // A poll that always throws is a dead thread; surfaced rather than
      // swallowed, but it must not tear the panel down — the messages already
      // on screen are still true.
      onError: (err) => console.error('[chat] poll failed', err),
    });
    poll.start();

    // A-C39: closing the panel, switching project and navigating away all
    // unmount this effect, and each one stops the timer. The document-hidden
    // half is handled inside the controller.
    return () => poll.stop();
  }, [status, threadId, pull]);

  // ---- send ----------------------------------------------------------------
  const send = useCallback(
    async (body: string, fileIds: string[] = []): Promise<SendOutcome> => {
      if (!projectId) return { ok: false, unresolved: [] };

      // ND-24: the optimistic row is kept OUT of `messages` on purpose. A-C21 —
      // a failed message is never displayed as sent — is much easier to hold
      // when the sent list and the trying-to-send list are different lists.
      const tempId = `pending-${crypto.randomUUID()}`;
      setPending((p) => [...p, { tempId, body, state: 'sending', fileIds }]);

      try {
        const res = await fetch('/api/chat/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          // ⚠️ `file_ids` MUST BE THREADED THROUGH. TypeScript permits a
          // handler that takes FEWER parameters than the caller passes, so an
          // earlier version of this function — `send(body)` — type-checked
          // perfectly while silently dropping every attached photo. Nothing
          // failed; the message just arrived with no references.
          body: JSON.stringify({
            project_id: projectId,
            kind,
            body,
            ...(fileIds.length > 0 ? { file_ids: fileIds } : {}),
          }),
        });
        const json = await res.json().catch(() => ({}));

        if (!res.ok) {
          setPending((p) =>
            p.map((m) => (m.tempId === tempId ? { ...m, state: 'failed' } : m))
          );
          setError(json.error ?? 'Message not sent.');
          return { ok: false, unresolved: [] };
        }

        // Pull it back rather than synthesising a row: the server's `created_at`
        // is what the next `since` must be built from, and the POST response
        // deliberately does not carry one.
        await pull();
        setPending((p) => p.filter((m) => m.tempId !== tempId));
        setError(null);
        return { ok: true, unresolved: json.unresolved ?? [] };
      } catch {
        setPending((p) => p.map((m) => (m.tempId === tempId ? { ...m, state: 'failed' } : m)));
        setError('Message not sent.');
        return { ok: false, unresolved: [] };
      }
    },
    [projectId, kind, pull]
  );

  const retry = useCallback(
    async (tempId: string) => {
      const failed = pending.find((m) => m.tempId === tempId);
      if (!failed) return;
      setPending((p) => p.filter((m) => m.tempId !== tempId));
      await send(failed.body, failed.fileIds ?? []);
    },
    [pending, send]
  );

  /** The thread is open on screen and the poll brought something in (§7.2). */
  const markRead = useCallback(async () => {
    const open = threadRef.current;
    if (!open) return;
    await fetch('/api/chat/read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ thread_id: open.id }),
    }).catch(() => {});
  }, []);

  return {
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
  };
}
