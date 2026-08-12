import { describe, it, expect, vi } from 'vitest';
import { createChatPoll } from '@/lib/chat/poll';
import { groupByProject, type SwitcherThread } from '@/lib/chat/switcher';

// ============================================================================
// ND-26 — the poll controller. A-C39, A-C40, A-C41.
// ============================================================================
//
// A-C39 ("polling stops when the thread is not open") is the rule whose failure
// is INVISIBLE: nothing on screen is wrong while a backgrounded tab polls all
// day. That is exactly why the controller takes injectable timers and
// visibility — a rule verifiable only by watching a network tab is a rule that
// regresses.

/** A fake clock: nothing here waits on real time. */
function harness(opts: { visible?: boolean } = {}) {
  let visible = opts.visible ?? true;
  let listener: (() => void) | null = null;
  const timers = new Map<number, () => void>();
  let nextId = 1;
  const fetchSince = vi.fn(async () => {});

  const poll = createChatPoll({
    fetchSince,
    intervalMs: 12_000,
    setIntervalFn: (fn) => {
      const id = nextId++;
      timers.set(id, fn);
      return id;
    },
    clearIntervalFn: (h) => {
      timers.delete(h as number);
    },
    isVisible: () => visible,
    onVisibilityChange: (cb) => {
      listener = cb;
      return () => {
        listener = null;
      };
    },
  });

  return {
    poll,
    fetchSince,
    armedTimers: () => timers.size,
    hasListener: () => listener !== null,
    /** Fire every armed timer once. */
    tick: () => [...timers.values()].forEach((fn) => fn()),
    setVisible(v: boolean) {
      visible = v;
      listener?.();
    },
  };
}

describe('A-C39 — polling runs only while the thread is open AND visible', () => {
  it('does not poll before start()', () => {
    const h = harness();
    h.tick();
    expect(h.fetchSince).not.toHaveBeenCalled();
    expect(h.poll.isRunning()).toBe(false);
  });

  it('polls after start(), and stops dead after stop()', async () => {
    const h = harness();
    h.poll.start();
    expect(h.poll.isRunning()).toBe(true);
    h.tick();
    await Promise.resolve();
    expect(h.fetchSince).toHaveBeenCalledTimes(1);

    h.poll.stop();
    expect(h.poll.isRunning()).toBe(false);
    expect(h.armedTimers()).toBe(0);
    h.tick();
    expect(h.fetchSince).toHaveBeenCalledTimes(1); // unchanged — nothing fired
  });

  it('⚠️ a HIDDEN document stops the timer, and becoming visible resumes it', async () => {
    // The expensive failure, and the invisible one: a backgrounded tab that
    // keeps asking. Nothing on screen is wrong while it happens.
    const h = harness();
    h.poll.start();
    expect(h.poll.isRunning()).toBe(true);

    h.setVisible(false);
    expect(h.poll.isRunning()).toBe(false);
    h.tick();
    await Promise.resolve();
    expect(h.fetchSince).not.toHaveBeenCalled();

    h.setVisible(true);
    expect(h.poll.isRunning()).toBe(true);
    h.tick();
    await Promise.resolve();
    expect(h.fetchSince).toHaveBeenCalledTimes(1);
  });

  it('does not start while already hidden', () => {
    const h = harness({ visible: false });
    h.poll.start();
    expect(h.poll.isRunning()).toBe(false);
  });

  it('stop() removes the visibility listener, so a refocus cannot resurrect it', () => {
    // Without this, stop() leaves a listener that re-arms the timer the next
    // time the tab is focused — a poll for a thread nobody has open.
    const h = harness();
    h.poll.start();
    expect(h.hasListener()).toBe(true);
    h.poll.stop();
    expect(h.hasListener()).toBe(false);

    h.setVisible(false);
    h.setVisible(true);
    expect(h.poll.isRunning()).toBe(false);
  });

  it('start() is idempotent — two opens do not double the rate', async () => {
    const h = harness();
    h.poll.start();
    h.poll.start();
    expect(h.armedTimers()).toBe(1);
    h.tick();
    await Promise.resolve();
    expect(h.fetchSince).toHaveBeenCalledTimes(1);
  });
});

describe('the poll does not stack when the network is slow', () => {
  it('a tick arriving mid-flight is DROPPED, not queued', async () => {
    let release: () => void = () => {};
    const slow = vi.fn(
      () =>
        new Promise<void>((r) => {
          release = r;
        })
    );
    const timers: Array<() => void> = [];
    const poll = createChatPoll({
      fetchSince: slow,
      setIntervalFn: (fn) => {
        timers.push(fn);
        return timers.length;
      },
      clearIntervalFn: () => {},
      isVisible: () => true,
      onVisibilityChange: () => () => {},
    });

    poll.start();
    timers[0]();
    timers[0]();
    timers[0]();
    // On a slow connection a queue turns a 12-second poll into a backlog that
    // keeps firing after the thread has closed.
    expect(slow).toHaveBeenCalledTimes(1);

    release();
    await Promise.resolve();
    await Promise.resolve();
    timers[0]();
    expect(slow).toHaveBeenCalledTimes(2);
  });
});

describe('A-C41 — the controller knows nothing about the transport', () => {
  it('takes fetchSince as a parameter and imports no Supabase client', async () => {
    // The property that keeps §9.1c's Realtime swap at one file. Asserted on the
    // source because "it happens not to import one today" is what regresses.
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const src = readFileSync(
      fileURLToPath(new URL('../lib/chat/poll.ts', import.meta.url)),
      'utf8'
    );
    expect(src).not.toContain('supabase');
    expect(src).not.toContain('@/lib/chat/messages');
    expect(src).not.toContain("'server-only'");
  });
});

describe('groupByProject — one pass over an ordered list', () => {
  const t = (
    projectId: string,
    kind: 'crew' | 'sub',
    unread: number,
    last: string | null
  ): SwitcherThread => ({
    projectId,
    projectName: projectId === 'p1' ? 'Alvarez' : 'Hendricks',
    threadId: `${projectId}-${kind}`,
    kind,
    lastMessageAt: last,
    unreadCount: unread,
  });

  it('groups adjacent threads and sums unread across them', () => {
    const g = groupByProject([
      t('p1', 'crew', 2, '2026-08-10T10:00:00Z'),
      t('p1', 'sub', 1, '2026-08-10T11:00:00Z'),
      t('p2', 'crew', 0, null),
    ]);
    expect(g).toHaveLength(2);
    expect(g[0].unreadCount).toBe(3);
    // The project's timestamp is the NEWEST of its threads, not the first seen.
    expect(g[0].lastMessageAt).toBe('2026-08-10T11:00:00Z');
    expect(g[1].unreadCount).toBe(0);
    expect(g[1].lastMessageAt).toBeNull();
  });

  it('preserves the SQL ordering rather than re-sorting', () => {
    // The RPC already ordered by the project's most recent activity. Re-sorting
    // here would be a second ordering rule that could disagree with it.
    const g = groupByProject([t('p2', 'crew', 0, null), t('p1', 'crew', 1, 'x')]);
    expect(g.map((p) => p.projectId)).toEqual(['p2', 'p1']);
  });
});
