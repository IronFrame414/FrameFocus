/**
 * S119 ITEM A-1 — the trial-deletion walk revokes every login BEFORE any row goes.
 *
 * `runTrialDeletion` deletes `profiles` in deleteRows and the auth users after.
 * A failure between the two left a login with no profile — the caller S118 item
 * 9 showed could insert its own Admin profile. Deleting the auth user first is
 * not possible (193 NO ACTION FKs to auth.users from tenant tables), so the walk
 * now bans every login first and holds the job if a ban fails.
 *
 * A recording fake stands in for the service-role client: every call is logged
 * in order, so the assertion is about ORDER, which a live run cannot observe.
 */
import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import { runTrialDeletion } from '@/lib/trial/deletion';

type Call = { kind: string; table?: string; detail?: unknown };

function fakeAdmin(opts: { failBanFor?: string }) {
  const calls: Call[] = [];
  const USERS = ['user-1', 'user-2'];
  // A table answers with nothing once deleted from, or deleteTableChunked (which
  // loops until a select is empty) never ends.
  const deleted = new Set<string>();

  function builder(table: string) {
    const state: { op: string; payload?: unknown } = { op: 'select' };
    const result = () => {
      if (table === 'trial_lifecycle' && state.op === 'select') {
        return { data: [{ company_id: 'co-1', delete_after: '2000-01-01', postponed_until: null }], error: null };
      }
      if (table === 'profiles' && state.op === 'select' && !deleted.has(table)) {
        return { data: USERS.map((u) => ({ user_id: u })), error: null };
      }
      return { data: [], error: null, count: 0 };
    };
    const b: Record<string, unknown> = {};
    const chain = (name: string) =>
      (...args: unknown[]) => {
        if (name === 'delete' || name === 'update' || name === 'insert' || name === 'upsert') {
          state.op = name;
          state.payload = args[0];
          calls.push({ kind: name, table, detail: args[0] });
          if (name === 'delete') deleted.add(table);
        }
        return b;
      };
    for (const m of ['select', 'eq', 'neq', 'in', 'is', 'not', 'lte', 'gte', 'lt', 'gt', 'order', 'limit', 'range', 'like', 'ilike', 'contains', 'filter', 'or', 'match', 'delete', 'update', 'insert', 'upsert']) {
      b[m] = chain(m);
    }
    b.single = async () => {
      if (table === 'deletion_jobs' && state.op === 'insert') return { data: { id: 'job-1' }, error: null };
      return { data: null, error: null };
    };
    b.maybeSingle = async () =>
      table === 'companies' && state.op === 'select'
        ? { data: { id: 'co-1', name: 'Fake Co' }, error: null }
        : { data: null, error: null };
    b.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
      Promise.resolve(result()).then(res, rej);
    return b;
  }

  const storageBucket = {
    list: async () => ({ data: [], error: null }),
    remove: async () => ({ data: [], error: null }),
    upload: async () => ({ data: null, error: null }),
    download: async () => ({ data: null, error: null }),
  };

  const admin = {
    from: (table: string) => builder(table),
    rpc: async () => ({ data: null, error: null }),
    storage: { from: () => storageBucket, listBuckets: async () => ({ data: [], error: null }) },
    auth: {
      admin: {
        updateUserById: async (id: string, attrs: unknown) => {
          calls.push({ kind: 'ban', detail: { id, attrs } });
          return id === opts.failBanFor
            ? { data: null, error: { message: 'boom' } }
            : { data: { user: { id } }, error: null };
        },
        deleteUser: async (id: string) => {
          calls.push({ kind: 'deleteUser', detail: id });
          return { data: null, error: null };
        },
      },
    },
  };
  return { admin: admin as unknown as SupabaseClient<Database>, calls };
}

const rowDelete = (c: Call) => c.kind === 'delete' && c.table !== 'deletion_jobs';

describe('S119 A-1 — runTrialDeletion bans every login before the first row delete', () => {
  it('both logins are banned (100 years), and every ban precedes the first row delete and every deleteUser', async () => {
    const { admin, calls } = fakeAdmin({});
    await runTrialDeletion(admin, new Date('2026-09-29T00:00:00Z'));

    const bans = calls.filter((c) => c.kind === 'ban');
    expect(bans.map((b) => (b.detail as { id: string }).id)).toEqual(['user-1', 'user-2']);
    for (const b of bans) {
      expect((b.detail as { attrs: { ban_duration: string } }).attrs.ban_duration).toBe('876000h');
    }
    const lastBan = calls.lastIndexOf(bans[bans.length - 1]);
    const firstDelete = calls.findIndex(rowDelete);
    const firstDeleteUser = calls.findIndex((c) => c.kind === 'deleteUser');
    // The run must actually have reached both — else "before" is vacuous.
    expect(firstDelete, 'no row was ever deleted — the ordering claim is vacuous').toBeGreaterThan(-1);
    expect(firstDeleteUser, 'no auth user was ever deleted').toBeGreaterThan(-1);
    expect(lastBan).toBeLessThan(firstDelete);
    expect(lastBan).toBeLessThan(firstDeleteUser);
    // The profiles table in particular.
    expect(calls.findIndex((c) => c.kind === 'delete' && c.table === 'profiles')).toBeGreaterThan(lastBan);
  });

  it('a ban that FAILS deletes nothing and holds the job pending with the reason', async () => {
    const { admin, calls } = fakeAdmin({ failBanFor: 'user-2' });
    await runTrialDeletion(admin, new Date('2026-09-29T00:00:00Z'));

    expect(calls.filter(rowDelete), 'rows were deleted after a login could not be revoked').toEqual([]);
    expect(calls.filter((c) => c.kind === 'deleteUser')).toEqual([]);
    const held = calls.filter(
      (c) => c.kind === 'update' && c.table === 'deletion_jobs' &&
        typeof (c.detail as { last_error?: string }).last_error === 'string' &&
        (c.detail as { last_error: string }).last_error.includes('ban user-2: boom')
    );
    expect(held).toHaveLength(1);
    expect((held[0].detail as { state: string }).state).toBe('pending');
  });
});
