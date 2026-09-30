/**
 * S120 1-F — TECH_DEBT #180: a trial-deletion retry still deletes the auth user
 * whose delete failed, and `auth_done` never claims otherwise.
 *
 * The defect: user ids were re-read from `profiles` on every run. Run 1 deletes
 * `profiles`, then deleteUser fails for one login → job pending. Run 2 read []
 * from `profiles`, deleted nobody, and completed with auth_done = true over an
 * orphaned login. Migration 20262115000000 + lib/trial/deletion.ts persist the
 * ids on the job at the first run.
 *
 * A STATEFUL fake stands in for the service-role client across two runs: the
 * `deletion_jobs` row, deleted tables and existing auth users persist between
 * runs, so the second run sees exactly what the first left behind.
 * `banAuthUsers` must still run first on every run (S119 A-1) — asserted too.
 */
import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import { runTrialDeletion } from '@/lib/trial/deletion';

type Call = { kind: string; table?: string; detail?: unknown };
type Job = Record<string, unknown> & { id: string };

function world(opts: { failDeleteFor: Set<string> }) {
  const calls: Call[] = [];
  const authUsers = new Set(['user-1', 'user-2']);
  const deleted = new Set<string>();
  let job: Job | null = null;

  function builder(table: string) {
    const state: { op: string; payload?: unknown } = { op: 'select' };
    const result = () => {
      if (table === 'trial_lifecycle' && state.op === 'select') {
        return {
          data: [{ company_id: 'co-1', delete_after: '2000-01-01', postponed_until: null }],
          error: null,
        };
      }
      if (table === 'profiles' && state.op === 'select' && !deleted.has(table)) {
        return { data: [{ user_id: 'user-1' }, { user_id: 'user-2' }], error: null };
      }
      if (table === 'deletion_jobs' && state.op === 'update' && job) {
        Object.assign(job, state.payload as object);
      }
      return { data: [], error: null, count: 0 };
    };
    const b: Record<string, unknown> = {};
    const chain =
      (name: string) =>
      (...args: unknown[]) => {
        if (['delete', 'update', 'insert', 'upsert'].includes(name)) {
          state.op = name;
          state.payload = args[0];
          calls.push({ kind: name, table, detail: args[0] });
          if (name === 'delete') deleted.add(table);
        }
        return b;
      };
    for (const m of [
      'select',
      'eq',
      'neq',
      'in',
      'is',
      'not',
      'lte',
      'gte',
      'lt',
      'gt',
      'order',
      'limit',
      'range',
      'like',
      'ilike',
      'contains',
      'filter',
      'or',
      'match',
      'delete',
      'update',
      'insert',
      'upsert',
    ]) {
      b[m] = chain(m);
    }
    b.single = async () => {
      if (table === 'deletion_jobs' && state.op === 'insert') {
        job = { id: 'job-1', ...(state.payload as object) };
        return { data: { id: 'job-1' }, error: null };
      }
      return { data: null, error: null };
    };
    b.maybeSingle = async () => {
      if (table === 'deletion_jobs' && state.op === 'select')
        return { data: job && job.state !== 'complete' ? { ...job } : null, error: null };
      if (table === 'companies' && state.op === 'select')
        return { data: { id: 'co-1', name: 'Fake Co' }, error: null };
      return { data: null, error: null };
    };
    b.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
      Promise.resolve(result()).then(res, rej);
    return b;
  }

  const gone = { message: 'User not found', status: 404, code: 'user_not_found' };
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
        updateUserById: async (id: string) => {
          calls.push({ kind: 'ban', detail: id });
          return authUsers.has(id)
            ? { data: { user: { id } }, error: null }
            : { data: null, error: gone };
        },
        deleteUser: async (id: string) => {
          calls.push({ kind: 'deleteUser', detail: id });
          if (!authUsers.has(id)) return { data: null, error: gone };
          if (opts.failDeleteFor.has(id))
            return { data: null, error: { message: 'boom', status: 500 } };
          authUsers.delete(id);
          return { data: null, error: null };
        },
      },
    },
  };
  return {
    admin: admin as unknown as SupabaseClient<Database>,
    calls,
    authUsers,
    job: () => job,
    deletedTables: deleted,
  };
}

const NOW = new Date('2026-09-30T00:00:00Z');

describe('#180 — a retry still deletes the login whose delete failed', () => {
  it('run 1: deleteUser fails for user-2 → job pending, auth_done FALSE, user_ids persisted', async () => {
    const w = world({ failDeleteFor: new Set(['user-2']) });
    await runTrialDeletion(w.admin, NOW);
    const job = w.job()!;
    expect(w.deletedTables.has('profiles'), 'run 1 never reached deleteRows').toBe(true);
    expect(job.user_ids).toEqual(['user-1', 'user-2']);
    expect(job.state).toBe('pending');
    expect(job.auth_done).toBe(false);
    expect([...w.authUsers]).toEqual(['user-2']);
  });

  it('run 2 (profiles already gone): user-2 IS retried and deleted; the job completes with auth_done TRUE', async () => {
    const w = world({ failDeleteFor: new Set(['user-2']) });
    await runTrialDeletion(w.admin, NOW);
    w.calls.length = 0;
    // The failure clears (e.g. GoTrue was down); profiles stays deleted.
    const w2 = w;
    (
      w2 as unknown as {
        admin: { auth: { admin: { deleteUser: (id: string) => Promise<unknown> } } };
      }
    ).admin.auth.admin.deleteUser = async (id: string) => {
      w2.calls.push({ kind: 'deleteUser', detail: id });
      if (!w2.authUsers.has(id))
        return {
          data: null,
          error: { message: 'User not found', status: 404, code: 'user_not_found' },
        };
      w2.authUsers.delete(id);
      return { data: null, error: null };
    };
    await runTrialDeletion(w2.admin, NOW);
    const deletes = w2.calls.filter((c) => c.kind === 'deleteUser').map((c) => c.detail);
    console.log(
      `[S120F] run 2 deleteUser calls: ${JSON.stringify(deletes)}; auth users left: ${JSON.stringify([...w2.authUsers])}`
    );
    expect(deletes).toContain('user-2');
    expect([...w2.authUsers]).toEqual([]);
    expect(w2.job()!.auth_done).toBe(true);
    expect(w2.job()!.state).toBe('complete');
  });

  it('run 2 while user-2 STILL fails: auth_done stays FALSE and the job stays pending (never a false completion)', async () => {
    const w = world({ failDeleteFor: new Set(['user-2']) });
    await runTrialDeletion(w.admin, NOW);
    await runTrialDeletion(w.admin, NOW);
    console.log(
      `[S120F] run 2 still failing: state=${String(w.job()!.state)} auth_done=${String(w.job()!.auth_done)}`
    );
    expect(w.job()!.auth_done).toBe(false);
    expect(w.job()!.state).toBe('pending');
    expect([...w.authUsers]).toEqual(['user-2']);
  });

  it('S119 A-1 still holds on the retry: the persisted logins are banned BEFORE any deleteUser', async () => {
    const w = world({ failDeleteFor: new Set(['user-2']) });
    await runTrialDeletion(w.admin, NOW);
    w.calls.length = 0;
    await runTrialDeletion(w.admin, NOW);
    const bans = w.calls.filter((c) => c.kind === 'ban').map((c) => c.detail);
    const firstDelete = w.calls.findIndex((c) => c.kind === 'deleteUser');
    const lastBan = w.calls.map((c) => c.kind).lastIndexOf('ban');
    expect(bans).toEqual(['user-1', 'user-2']);
    expect(firstDelete).toBeGreaterThan(-1);
    expect(lastBan).toBeLessThan(firstDelete);
  });
});
