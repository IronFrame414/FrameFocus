import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  LINK_KEYS,
  NOTIFICATIONS_HOME,
  resolveClickTarget,
  resolveLink,
} from '@/lib/notify/links';

// ============================================================================
// ND-4 (two workers) and ND-11 (surface-agnostic links).
// Spec: §5.3, §5.4. A-N19..A-N24.
// ============================================================================
//
// The worker assertions are TEXT assertions over public/*.js, for the same
// reason m6m-queue.test.ts asserts the 'm6m-queue-sync' literal in two files: a
// plain JS worker in public/ cannot be imported by the test runner, and cannot
// import from TypeScript. Text is the only seam there is.

function readWorker(name: string): string {
  return readFileSync(
    fileURLToPath(new URL(`../public/${name}`, import.meta.url)),
    'utf8'
  );
}

const mobileWorker = readWorker('sw.js');
const dashboardWorker = readWorker('sw-dashboard.js');

describe('ND-4 — both workers carry all three push handlers', () => {
  const handlers = ['push', 'notificationclick', 'pushsubscriptionchange'];

  for (const handler of handlers) {
    it(`the /m worker listens for '${handler}'`, () => {
      expect(mobileWorker).toContain(`addEventListener('${handler}'`);
    });

    it(`the /dashboard worker listens for '${handler}'`, () => {
      expect(dashboardWorker).toContain(`addEventListener('${handler}'`);
    });
  }

  it('A-N23 every push handler shows a notification', () => {
    // Chrome revokes subscriptions that receive pushes and display nothing, so
    // a push handler without showNotification is a slow-acting bug: it works,
    // then one day the subscription is gone and nobody knows why.
    expect(mobileWorker).toContain('showNotification');
    expect(dashboardWorker).toContain('showNotification');
  });
});

describe('A-N21 — the desktop worker cannot serve anything stale', () => {
  it('defines NO fetch handler', () => {
    // THE one property that makes a second worker safe where widening the /m
    // worker's scope would not be. A worker with no fetch handler cannot serve a
    // stale response because it never serves any response at all.
    expect(dashboardWorker).not.toContain("addEventListener('fetch'");
  });

  it('opens no cache', () => {
    expect(dashboardWorker).not.toContain('caches.open');
  });
});

describe('A-N22 — the mobile worker keeps its scope and its cache rule', () => {
  it('still caches only what the origin declares immutable', () => {
    // The S121 regression: stale-while-revalidate served a previous build's
    // chunk against fresh server HTML and a real handset failed to hydrate. The
    // push work is additive and must not have disturbed this.
    expect(mobileWorker).toContain("includes('immutable')");
  });

  it('still carries the offline queue retry hook', () => {
    expect(mobileWorker).toContain("addEventListener('sync'");
    expect(mobileWorker).toContain('m6m-queue-sync');
  });

  it('is still registered at scope /m, not /', () => {
    const register = readFileSync(
      fileURLToPath(new URL('../app/m/register-sw.tsx', import.meta.url)),
      'utf8'
    );
    expect(register).toContain("scope: '/m'");
    // ND-4 exists precisely to keep this from becoming '/'.
    expect(register).not.toContain("scope: '/'");
  });

  it('the desktop registration uses its own worker and scope', () => {
    const register = readFileSync(
      fileURLToPath(new URL('../app/dashboard/register-push-sw.tsx', import.meta.url)),
      'utf8'
    );
    expect(register).toContain("'/sw-dashboard.js'");
    expect(register).toContain("scope: '/dashboard'");
  });
});

describe('ND-11 — one row, two destinations', () => {
  it('A-N19 the same key resolves to a different path per surface', () => {
    const params = { projectId: 'p1' };
    expect(resolveLink('chat', params, 'mobile')).toBe('/m/p/p1/chat');
    expect(resolveLink('chat', params, 'desktop')).toBe('/dashboard/projects/p1/chat');
  });

  it('A-N20 a CO notification has no mobile destination and falls back to the list', () => {
    // M6M D-26 cuts change-order money from mobile for EVERY role, Owner
    // included. A mobile CO route would be the leak D-26 exists to prevent.
    const params = { projectId: 'p1', id: 'co1' };
    expect(resolveLink('co', params, 'mobile')).toBeNull();
    expect(resolveClickTarget('co', params, 'mobile')).toBe(NOTIFICATIONS_HOME.mobile);

    // Paired positive — without it, a resolver returning null for everything
    // passes.
    expect(resolveLink('co', params, 'desktop')).toBe('/dashboard/projects/p1/changes/co1');
  });

  it('an unlinked notification stays unlinked — ND-8 is not a lookup failure', () => {
    // A non-author PM gets a CO notification with NO link because the S121 read
    // floor makes the row unreadable to them and a link would 404. resolveLink
    // must report that faithfully so §10.1 can render the row non-interactive.
    expect(resolveLink(null, {}, 'desktop')).toBeNull();
    expect(resolveLink(undefined, {}, 'mobile')).toBeNull();
  });

  it('a click target is never null — a push has already interrupted the user', () => {
    for (const surface of ['mobile', 'desktop'] as const) {
      expect(resolveClickTarget(null, {}, surface)).toBe(NOTIFICATIONS_HOME[surface]);
      expect(resolveClickTarget('nonexistent-key', {}, surface)).toBe(
        NOTIFICATIONS_HOME[surface]
      );
    }
  });

  it('a key missing its params resolves to null rather than a broken path', () => {
    // The failure this prevents is `/dashboard/projects/undefined/chat`, which
    // is a 404 that looks like a real URL.
    expect(resolveLink('chat', {}, 'desktop')).toBeNull();
    expect(resolveLink('delivery', { projectId: 'p1' }, 'desktop')).toBeNull();
  });

  it('every key resolves on at least one surface', () => {
    // Catches a key added to the table with two null resolvers, which would be
    // storable, unreachable, and silent.
    for (const key of LINK_KEYS) {
      const mobile = resolveLink(key, { projectId: 'p', id: 'i', week: '2026-08-09' }, 'mobile');
      const desktop = resolveLink(
        key,
        { projectId: 'p', id: 'i', week: '2026-08-09' },
        'desktop'
      );
      expect(mobile ?? desktop).not.toBeNull();
    }
  });
});
