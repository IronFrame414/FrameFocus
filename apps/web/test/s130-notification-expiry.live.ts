import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { admin, assertRebuildTest } from './live-session';
import { runNotificationExpiry } from '@/lib/notify/crons/notification-expiry';

// ============================================================================
// ND-41 — the notification expiry cron. Parent R2, A-N39, A-N40, and A-C23.
// ============================================================================
//
// This is NOTIFICATIONS-CORE work landing in the chat module. Until now parent
// R2 described something unbuilt: six cron routes existed and none was this one,
// and nothing anywhere read `notifications.expires_at`.

const COMPANY = '03bb903f-1084-4ab4-afb8-03192cb58d30';
const PROJECT = '4a4f8567-67f8-4394-baae-181229974bd9';

let recipient: string;
const made: string[] = [];

/** A notification with an explicit expiry, so the boundary is driven not waited. */
async function makeNotification(opts: {
  expiresAt: string | null;
  starred?: boolean;
  title?: string;
}): Promise<string> {
  const { data, error } = await admin
    .from('notifications')
    .insert({
      company_id: COMPANY,
      recipient_profile_id: recipient,
      type: 'mention',
      title: opts.title ?? 'expiry fixture',
      link_key: 'chat',
      link_params: { projectId: PROJECT },
      expires_at: opts.expiresAt,
      starred: opts.starred ?? false,
    })
    .select('id')
    .single();
  if (error) throw new Error(`makeNotification: ${error.message}`);
  const id = (data as { id: string }).id;
  made.push(id);
  return id;
}

async function cleanup() {
  if (made.length > 0) await admin.from('notifications').delete().in('id', made);
  made.length = 0;
  await admin.from('chat_threads').delete().eq('project_id', PROJECT);
}

beforeAll(async () => {
  assertRebuildTest();
  const { data } = await admin
    .from('profiles')
    .select('id')
    .eq('email', 'josh+test50@worthprop.com')
    .single();
  recipient = (data as { id: string }).id;
  await cleanup();
});

afterAll(cleanup);

const LONG_AGO = new Date('2020-01-01T00:00:00Z').toISOString();
const FAR_OFF = new Date('2099-01-01T00:00:00Z').toISOString();

describe('A-N39 — the retention PAIR', () => {
  it('⚠️ an unstarred row past expiry is deleted; a STARRED one is not', async () => {
    // The pair IS the criterion. A job that deletes everything past the date
    // passes any "expired rows are removed" assertion and quietly destroys the
    // rows a user deliberately kept — which is the only reason starring exists.
    const doomed = await makeNotification({ expiresAt: LONG_AGO, title: 'unstarred, expired' });
    const kept = await makeNotification({
      expiresAt: LONG_AGO,
      starred: true,
      title: 'starred, expired',
    });
    const future = await makeNotification({ expiresAt: FAR_OFF, title: 'unstarred, not expired' });

    const outcome = await runNotificationExpiry(admin, new Date());

    expect(outcome.deleted).toBeGreaterThanOrEqual(1);
    expect(outcome.spared, 'the starred expired row must be counted as spared').toBeGreaterThanOrEqual(1);

    const survivors = await admin
      .from('notifications')
      .select('id')
      .in('id', [doomed, kept, future]);
    const ids = ((survivors.data ?? []) as Array<{ id: string }>).map((r) => r.id);

    expect(ids, 'the unstarred expired row must be gone').not.toContain(doomed);
    expect(ids, 'a STARRED row is never deleted').toContain(kept);
    expect(ids, 'an unexpired row is untouched').toContain(future);
  });

  it('a row with a NULL expires_at is never touched', async () => {
    // Starring nulls the column (A-N40), so this is the shape a starred row
    // actually has in production — the `starred = false` filter and the
    // `expires_at < now()` filter must BOTH have to be true.
    const nulled = await makeNotification({ expiresAt: null, title: 'no expiry' });
    await runNotificationExpiry(admin, new Date());
    const { data } = await admin.from('notifications').select('id').eq('id', nulled);
    expect((data ?? []).length).toBe(1);
  });
});

describe('A-N40 — starring sets expires_at NULL; unstarring restores it', () => {
  it('⚠️ is enforced by a TRIGGER, not by the client', async () => {
    // `setStarred()` updates one column and its comment says "the trigger does
    // the rest". That comment is correct — `notifications_set_expiry` exists and
    // does exactly this. Asserted here because a criterion nothing exercises is
    // indistinguishable from one nothing implements, and this one was very
    // nearly "fixed" in the client on the strength of reading setStarred alone.
    const id = await makeNotification({ expiresAt: FAR_OFF });

    await admin.from('notifications').update({ starred: true }).eq('id', id);
    const starred = await admin.from('notifications').select('expires_at').eq('id', id).single();
    expect((starred.data as { expires_at: string | null }).expires_at).toBeNull();

    await admin.from('notifications').update({ starred: false }).eq('id', id);
    const unstarred = await admin.from('notifications').select('expires_at').eq('id', id).single();
    const restored = (unstarred.data as { expires_at: string | null }).expires_at;
    expect(restored).not.toBeNull();
    // Roughly 30 days out — the trigger uses now() + 30 days rather than the
    // original value, which is the shipped behaviour and not this run's to change.
    const days = (new Date(restored!).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(29);
    expect(days).toBeLessThan(31);
  });
});

describe('A-C23 — R2, and the half that used to test nothing', () => {
  it('⚠️ the cron deletes ZERO chat messages while deleting expired notifications', async () => {
    // This assertion was VACUOUS until now: "running /api/cron/notification-expiry
    // deletes zero chat messages" cannot fail when the route does not exist.
    // Both halves run in one pass, which is what makes it a real interaction
    // rather than an absence.
    const { data: thread } = await admin
      .from('chat_threads')
      .insert({ company_id: COMPANY, project_id: PROJECT, kind: 'crew' })
      .select('id')
      .single();
    const { data: profile } = await admin
      .from('profiles')
      .select('id')
      .eq('email', 'josh+test50@worthprop.com')
      .single();
    await admin.from('chat_messages').insert({
      company_id: COMPANY,
      thread_id: (thread as { id: string }).id,
      author_profile_id: (profile as { id: string }).id,
      body: 'R2 says this is permanent',
    });

    await makeNotification({ expiresAt: LONG_AGO, title: 'to be reaped' });

    const before = await admin
      .from('chat_messages')
      .select('id', { count: 'exact', head: true });
    const outcome = await runNotificationExpiry(admin, new Date());
    const after = await admin.from('chat_messages').select('id', { count: 'exact', head: true });

    expect(outcome.deleted, 'the pass must actually have deleted something').toBeGreaterThanOrEqual(1);
    expect(after.count, 'R2 — the chat log is permanent').toBe(before.count);
  });

  it('chat_messages has no expires_at column at all', async () => {
    // The structural half of R2: chat cannot expire because there is nothing to
    // expire on. A future "tidy" that added the column would fail here first.
    const { error } = await admin.from('chat_messages').select('expires_at').limit(1);
    expect(error, 'chat_messages must not have an expires_at').not.toBeNull();
  });
});

describe('the route is registered and gated', () => {
  const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

  it('⚠️ /api/cron/notification-expiry is in vercel.json', () => {
    // A correct handler that nothing schedules never runs — the exact defect
    // §14.4 records for /api/cron/invoice-reminders, which still has a handler
    // and no schedule. This criterion is why that is not repeated here.
    const vercel = JSON.parse(read('../vercel.json')) as {
      crons: Array<{ path: string; schedule: string }>;
    };
    const entry = vercel.crons.find((c) => c.path === '/api/cron/notification-expiry');
    expect(entry, 'the route is not scheduled').toBeDefined();
    expect(entry!.schedule).toMatch(/^\S+ \S+ \S+ \S+ \S+$/);
  });

  it('and it is gated by CRON_SECRET, answering 401 without it', () => {
    const route = read('../app/api/cron/notification-expiry/route.ts');
    expect(route).toContain('process.env.CRON_SECRET');
    expect(route).toContain("{ status: 401 }");
  });

  it('§14.4 — invoice-reminders STILL has a handler and no schedule', () => {
    // Confirmed, not fixed. Pre-existing and explicitly not this module's to
    // repair; recorded so it is not mistaken for something this run introduced
    // or something this run resolved.
    const vercel = JSON.parse(read('../vercel.json')) as { crons: Array<{ path: string }> };
    expect(vercel.crons.map((c) => c.path)).not.toContain('/api/cron/invoice-reminders');
  });
});
