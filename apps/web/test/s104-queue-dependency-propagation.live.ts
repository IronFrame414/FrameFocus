import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { claimDue } from '@/lib/quickbooks/queue';

/**
 * ⚠️ A DEPENDANT OF A DEAD DEPENDENCY MUST REACH A TERMINAL STATE [RULED Josh, S104].
 *
 * ----------------------------------------------------------------------------
 * WHAT WAS WRONG, AND WHY NOTHING SURFACED IT
 * ----------------------------------------------------------------------------
 * `claimDue()` admitted a dependant only when its dependency was `pushed`.
 * Every other dependency status filtered the dependant out — including
 * `failed_terminal`, which can never change. The dependant then sat at
 * `status='queued'`, `attempts=0`, `last_error=NULL`, `next_attempt_at=NULL`:
 * **byte-identical to a row that has simply not had its turn yet.**
 *
 * ⚠️ THE TEST THEREFORE ASSERTS THE DIFFERENCE, NOT JUST THE OUTCOME. Josh's
 * ruling rejected parking it precisely because *"Option 2 keeps it in queued,
 * which is the defect."* A fix that leaves a dead row and a waiting row looking
 * alike is not a fix — it is the S181 collapse (`countWaiting()`'s reason for
 * existing) rebuilt one level down. So case 3 checks a live waiting row is
 * UNTOUCHED in the same call that kills the dead one.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const admin: SupabaseClient = createClient(url, key, { auth: { persistSession: false } });

let companyId: string;
const made: string[] = [];

/** A queue row, created directly. `entity_id` is a throwaway uuid — nothing in
 *  `claimDue()` dereferences it, and the handlers are never reached here. */
async function makeRow(fields: Record<string, unknown>): Promise<string> {
  const { data, error } = await admin
    .from('qb_sync_queue')
    .insert({
      company_id: companyId,
      realm_id: 'S104-TEST',
      entity_id: crypto.randomUUID(),
      status: 'queued',
      ...fields,
    })
    .select('id')
    .single();
  if (error) throw new Error(`makeRow: ${error.message}`);
  made.push(data!.id as string);
  return data!.id as string;
}

async function statusOf(id: string) {
  const { data } = await admin
    .from('qb_sync_queue')
    .select('status, attempts, last_error, next_attempt_at')
    .eq('id', id)
    .single();
  return data as {
    status: string; attempts: number; last_error: string | null; next_attempt_at: string | null;
  };
}

beforeAll(async () => {
  const { data, error } = await admin
    .from('companies').select('id').eq('qb_connection_state', 'connected').limit(1).single();
  if (error || !data) throw new Error('no connected company on this database');
  companyId = data.id as string;
});

afterAll(async () => {
  // ⚠️ Deletes ONLY the ids this file created. A cleanup scoped by company_id
  // would erase the tenant's real queue — s149-A's class exactly (a test that
  // destroyed live data and then passed on the second run).
  if (made.length) await admin.from('qb_sync_queue').delete().in('id', made);
});

describe('S104 — terminal dependency failure propagates', () => {
  it('1. a dependant of a failed_terminal row becomes failed_terminal, naming the cause', async () => {
    const dep = await makeRow({ entity_type: 'customer', operation: 'create' });
    await admin.from('qb_sync_queue')
      .update({ status: 'failed_terminal', last_error: 'Intuit said the name is taken.' })
      .eq('id', dep);
    const dependant = await makeRow({
      entity_type: 'invoice', operation: 'create', depends_on_id: dep,
    });

    const claimed = await claimDue(admin, companyId, 25);
    expect(claimed.map((r) => r.id), 'a dead dependant was handed to the worker')
      .not.toContain(dependant);

    const after = await statusOf(dependant);
    expect(after.status, 'the dependant is still queued — it will sit forever').toBe('failed_terminal');
    expect(after.last_error).toMatch(/never ran/i);
    expect(after.last_error, 'the message does not say WHICH step died').toMatch(/customer:create/);
    expect(after.last_error, "the dependency's own error is not carried through")
      .toMatch(/name is taken/);
    // Nothing was attempted, so nothing may claim it was.
    expect(after.attempts).toBe(0);
    expect(after.next_attempt_at).toBeNull();
  });

  it('2. a DELETED dependency RELEASES its dependant — the FK, not a forever-wait', async () => {
    // ⚠️ THIS TEST ASSERTED THE OPPOSITE WHEN IT WAS WRITTEN, AND IT WENT RED.
    // It is inverted rather than deleted, because the wrong version is the
    // record of what was believed [CLAUDE.md, S157].
    //
    // _Superseded assertion:_ _"a dependant whose dependency row no longer
    // EXISTS is terminated too … `depends_on_id` carries no foreign key, so a
    // missing dependency produced the identical forever-wait."_
    //
    // `pg_constraint` says otherwise:
    //     depends_on_id uuid REFERENCES qb_sync_queue(id) ON DELETE SET NULL
    // Deleting the dependency NULLs the child's link and the child becomes
    // unconditionally claimable. There is no second forever-wait door; there is
    // a silent RELEASE, which is what this now pins.
    const dep = await makeRow({ entity_type: 'customer', operation: 'create' });
    const dependant = await makeRow({
      entity_type: 'invoice', operation: 'create', depends_on_id: dep,
    });

    const { error: delError } = await admin.from('qb_sync_queue').delete().eq('id', dep);
    expect(delError, 'the delete failed, so this test proves nothing').toBeNull();

    const { data: relinked } = await admin
      .from('qb_sync_queue').select('depends_on_id').eq('id', dependant).single();
    expect(
      (relinked as { depends_on_id: string | null }).depends_on_id,
      'ON DELETE SET NULL did not fire — re-read the FK before trusting this file'
    ).toBeNull();

    const claimed = await claimDue(admin, companyId, 25);
    expect(claimed.map((r) => r.id), 'a released dependant was not claimable').toContain(dependant);
    expect((await statusOf(dependant)).status, 'a released dependant was wrongly terminated')
      .toBe('queued');
  });

  it('3. a dependant of a LIVE dependency is left completely alone', async () => {
    // ⚠️ THE HALF THAT STOPS THE FIX FROM BEING WORSE THAN THE BUG. If a
    // legitimate wait were terminated, every invoice queued behind its customer
    // would die on the first drain.
    const dep = await makeRow({ entity_type: 'customer', operation: 'create' });
    const dependant = await makeRow({
      entity_type: 'invoice', operation: 'create', depends_on_id: dep,
    });

    const claimed = await claimDue(admin, companyId, 25);
    expect(claimed.map((r) => r.id), 'the dependency itself should be claimable').toContain(dep);
    expect(claimed.map((r) => r.id), 'a waiting dependant was handed out early')
      .not.toContain(dependant);

    const after = await statusOf(dependant);
    expect(after.status, 'a legitimate wait was killed').toBe('queued');
    expect(after.last_error).toBeNull();
  });

  it('4. once the dependency is pushed, the dependant becomes claimable', async () => {
    const dep = await makeRow({ entity_type: 'customer', operation: 'create' });
    const dependant = await makeRow({
      entity_type: 'invoice', operation: 'create', depends_on_id: dep,
    });
    await admin.from('qb_sync_queue').update({ status: 'pushed' }).eq('id', dep);

    const claimed = await claimDue(admin, companyId, 25);
    expect(claimed.map((r) => r.id), 'a released dependant was not claimed').toContain(dependant);
    expect((await statusOf(dependant)).status).toBe('queued');
  });
});
