/**
 * ND-26 — the 12-second poll, as a controller.
 *
 * Spec: chat-spec.md §9.1, §9.1d, A-C39/A-C40/A-C41.
 *
 * ---------------------------------------------------------------------------
 * NOT `server-only`, AND IT TOUCHES NO SUPABASE CLIENT — THAT IS A-C41
 * ---------------------------------------------------------------------------
 * The transport must stay behind the service function or §9.1c's "one file plus
 * a migration" Realtime swap stops being true. So this file knows how to run
 * something on an interval and when to stop; it does NOT know what it is
 * running. `fetchSince` is injected, and swapping to Realtime means replacing
 * the thing that calls this — not rewriting it.
 *
 * ---------------------------------------------------------------------------
 * EVERY DEPENDENCY IS INJECTABLE BECAUSE A-C39 IS THE CRITERION THAT MATTERS
 * ---------------------------------------------------------------------------
 * "Polling stops when the thread is not open" is the rule whose failure is
 * INVISIBLE — nothing on screen is wrong while a backgrounded tab quietly polls
 * all day. A rule that can only be verified by watching a network tab is a rule
 * that regresses. Timers and visibility are therefore parameters, so the whole
 * lifecycle is exercisable in a unit test with no browser and no clock.
 */

export interface PollDeps {
  /** Injected transport. Returns the number of new messages, for the caller's own use. */
  fetchSince: () => Promise<void>;
  /** Defaults to `setInterval`; injected so tests need no real clock. */
  setIntervalFn?: (fn: () => void, ms: number) => unknown;
  clearIntervalFn?: (handle: unknown) => void;
  /** Defaults to `document.visibilityState`. */
  isVisible?: () => boolean;
  /** Subscribe to visibility changes; returns an unsubscribe. */
  onVisibilityChange?: (cb: () => void) => () => void;
  /** ND-26: twelve seconds. Overridable only so tests need not wait. */
  intervalMs?: number;
  /** Surfaced rather than swallowed — a poll that always throws is a dead thread. */
  onError?: (err: unknown) => void;
}

export interface PollController {
  /** Idempotent: starting an already-running poll does not double it. */
  start: () => void;
  stop: () => void;
  isRunning: () => boolean;
  /** Test/diagnostic seam — how many times the transport has actually been called. */
  tickCount: () => number;
}

const DEFAULT_INTERVAL_MS = 12_000;

function defaultIsVisible(): boolean {
  if (typeof document === 'undefined') return true;
  return document.visibilityState !== 'hidden';
}

function defaultOnVisibilityChange(cb: () => void): () => void {
  if (typeof document === 'undefined') return () => {};
  document.addEventListener('visibilitychange', cb);
  return () => document.removeEventListener('visibilitychange', cb);
}

export function createChatPoll(deps: PollDeps): PollController {
  const intervalMs = deps.intervalMs ?? DEFAULT_INTERVAL_MS;
  const setIntervalFn =
    deps.setIntervalFn ?? ((fn, ms) => setInterval(fn, ms) as unknown);
  const clearIntervalFn =
    deps.clearIntervalFn ?? ((h) => clearInterval(h as ReturnType<typeof setInterval>));
  const isVisible = deps.isVisible ?? defaultIsVisible;
  const onVisibilityChange = deps.onVisibilityChange ?? defaultOnVisibilityChange;

  let handle: unknown = null;
  /** The caller's intent — distinct from whether the timer is currently armed. */
  let wanted = false;
  let unsubscribe: (() => void) | null = null;
  let ticks = 0;
  /** Guards against overlap when a fetch takes longer than the interval. */
  let inFlight = false;

  function arm() {
    if (handle !== null) return;
    handle = setIntervalFn(() => {
      // A tick that arrives while the previous fetch is still running is
      // dropped, not queued. On a slow connection a queue would turn a 12-second
      // poll into a backlog that keeps firing after the thread closes.
      if (inFlight) return;
      inFlight = true;
      ticks += 1;
      void deps
        .fetchSince()
        .catch((err) => deps.onError?.(err))
        .finally(() => {
          inFlight = false;
        });
    }, intervalMs);
  }

  function disarm() {
    if (handle === null) return;
    clearIntervalFn(handle);
    handle = null;
  }

  /** The timer runs only when the caller wants it AND the document is visible. */
  function reconcile() {
    if (wanted && isVisible()) arm();
    else disarm();
  }

  return {
    start() {
      if (wanted) return; // idempotent — two opens must not double the rate
      wanted = true;
      // Subscribed only while wanted, so a stopped poll leaves no listener
      // behind to resurrect it when the tab is refocused.
      unsubscribe = onVisibilityChange(reconcile);
      reconcile();
    },

    stop() {
      wanted = false;
      disarm();
      unsubscribe?.();
      unsubscribe = null;
    },

    // Reports whether the timer is ARMED, not whether the caller asked for it.
    // A backgrounded tab is `wanted && !running`, and that distinction is the
    // whole of A-C39.
    isRunning: () => handle !== null,
    tickCount: () => ticks,
  };
}
