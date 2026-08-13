/**
 * S97CT-REPLYTO — +REPLY-TO resolution against real rows (Josh, S97).
 *
 * The wiring (header set, never the recipient, degrades to no header) is unit-
 * tested in reply-to.test.ts. What is proven HERE is the RESOLUTION ORDER
 * against the real schema:
 *
 *   companies.email  ->  the OWNER's profile email  ->  null
 *
 * and that it works for EVERY company, not just Bishop Contracting — the
 * ruling is platform-wide.
 *
 * NOTHING IS EMAILED. Only the resolver is called.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { admin, assertRebuildTest } from './live-session';

const MARKER = 'S97REPLYTO';

let bishopId: string;
let ridgelineId: string;
/** A company with NO owner and no email — the "neither" case. */
let orphanCompanyId: string;
let bishopEmailBefore: string | null = null;

const must = (label: string, error: { message: string } | null) => {
  if (error) throw new Error(`${label}: ${error.message}`);
};

/** Fresh module per call — the resolver memoises per process. */
async function resolve(companyId: string): Promise<string | null> {
  vi.resetModules();
  const { resolveCompanyReplyTo } = await import('@/lib/services/email-service');
  return resolveCompanyReplyTo(companyId);
}

/**
 * Delete every `MARKER%` company AND the rows that pin it. [S146, #4-s146]
 *
 * ⚠️ DELETING THE COMPANY ALONE DOES NOT WORK, AND DID NOT FAIL LOUDLY.
 * 7F's seed trigger (`20260922000000`) creates 8 `lien_release_templates` on
 * every new company, and `lien_release_templates_company_id_fkey` is NO ACTION:
 *
 *   23503: update or delete on table "companies" violates foreign key
 *   constraint "lien_release_templates_company_id_fkey" on table
 *   "lien_release_templates"
 *
 * The old teardown deleted the company by id, pushed that error into a list, and
 * only `console.log`-ged it — which vitest suppresses for a PASSING file. So the
 * orphan survived, and the NEXT run died in this `beforeAll` on
 * `companies_slug_key`, because the slug is a CONSTANT. The file passed once
 * after a manual clear and never twice in a row.
 *
 * A seed change broke this harness's CLEANUP rather than its assertions, which
 * is why nothing caught it. Called from BOTH ends: self-healing on the way in so
 * a crashed run cannot poison the next one, and complete on the way out.
 */
async function purgeMarkerCompanies(): Promise<void> {
  const { data: stale } = await admin
    .from('companies')
    .select('id')
    .like('name', `${MARKER}%`);
  const ids = (stale ?? []).map((c) => (c as { id: string }).id);
  if (!ids.length) return;

  must(
    'purge boxes',
    (await admin.from('lien_release_template_boxes').delete().in('company_id', ids)).error
  );
  must(
    'purge templates',
    (await admin.from('lien_release_templates').delete().in('company_id', ids)).error
  );
  must('purge companies', (await admin.from('companies').delete().in('id', ids)).error);
}

beforeAll(async () => {
  assertRebuildTest();
  await purgeMarkerCompanies();

  const { data: bishop } = await admin
    .from('companies').select('id, email').eq('name', 'Bishop Contracting').single();
  bishopId = bishop!.id;
  bishopEmailBefore = bishop!.email;

  // ⚠️ BY NAME, NOT SLUG [S136]. S136's backfill (20260917000000) rewrote
  // company slugs to drop the hex suffix, so `slug` is no longer a stable
  // lookup key — it is the email local part. Bishop above was already resolved
  // by name; this line was the inconsistent one.
  const { data: ridgeline } = await admin
    .from('companies').select('id').eq('name', 'Ridgeline Builders (TEST CO 2)').single();
  ridgelineId = ridgeline!.id;

  const { data: orphan, error } = await admin
    .from('companies')
    .insert({ name: `${MARKER} Orphan Co`, slug: `${MARKER.toLowerCase()}-orphan` })
    .select('id').single();
  must('orphan company', error);
  orphanCompanyId = orphan!.id;
}, 180_000);

describe('S97CT-REPLYTO — resolution order against the real schema', () => {
  it('1. companies.email is the source of truth when it is set', async () => {
    must('set email', (await admin
      .from('companies').update({ email: 'office@bishopcontracting.com' }).eq('id', bishopId)).error);

    expect(await resolve(bishopId)).toBe('office@bishopcontracting.com');
  });

  it('2. FALLS BACK to the OWNER when companies.email is empty — the branch that runs today', async () => {
    // The column exists but no company on rebuild-test has filled it in, so
    // this is the path that actually executes. No company column was invented.
    must('clear email', (await admin
      .from('companies').update({ email: null }).eq('id', bishopId)).error);

    const resolved = await resolve(bishopId);
    expect(resolved).toBe('josh+test50@worthprop.com');

    // and it really is the OWNER, not just any profile
    const { data: owner } = await admin
      .from('profiles').select('email')
      .eq('company_id', bishopId).eq('role', 'owner').eq('is_deleted', false).single();
    expect(resolved).toBe(owner!.email);
  });

  it('3. PLATFORM-WIDE — the second company resolves to ITS OWN owner, not Bishop\'s', async () => {
    // The ruling is not Bishop-specific. A cross-company leak here would send
    // one company's client replies to another company's inbox.
    const resolved = await resolve(ridgelineId);
    expect(resolved).toBe('josh+qa-b-owner@worthprop.com');
    expect(resolved).not.toBe('josh+test50@worthprop.com');
  });

  it('4. a company with NEITHER an email nor an owner resolves to null', async () => {
    // Must not throw and must not invent an address — the send goes without a
    // Reply-To header.
    expect(await resolve(orphanCompanyId)).toBeNull();
  });

  it('5. the resolved address is never a CLIENT address', async () => {
    // Guards the failure the unit trace also covers, but against real data:
    // every contact email in the company must differ from the reply-to.
    const resolved = await resolve(bishopId);
    const { data: contacts } = await admin
      .from('contacts').select('email').eq('company_id', bishopId).not('email', 'is', null);
    for (const c of contacts ?? []) {
      expect(resolved, 'reply-to resolved to a client address').not.toBe(c.email);
    }
  });
});

afterAll(async () => {
  const errors: string[] = [];
  const check = (label: string, error: { message: string } | null) => {
    if (error) errors.push(`${label}: ${error.message}`);
  };

  // Restore Bishop's email to EXACTLY what it was before this run.
  check('restore bishop email', (await admin
    .from('companies').update({ email: bishopEmailBefore }).eq('id', bishopId)).error);
  const { data: after } = await admin
    .from('companies').select('email').eq('id', bishopId).single();
  if (after!.email !== bishopEmailBefore) {
    errors.push(`restore FAILED: email is ${after!.email}, expected ${bishopEmailBefore}`);
  }

  // Clears the seeded templates first — see purgeMarkerCompanies. Keyed on the
  // NAME rather than on `orphanCompanyId`, so a run that died before the insert
  // still cleans up whatever a previous one left.
  try {
    await purgeMarkerCompanies();
  } catch (e) {
    errors.push((e as Error).message);
  }

  const { count } = await admin
    .from('companies').select('id', { count: 'exact', head: true }).like('name', `${MARKER}%`);
  console.log(`\n[${MARKER} TEARDOWN] rows left: ${count}; errors: ${errors.length ? JSON.stringify(errors) : 'NONE'}`);

  // ⚠️ ASSERTED, NOT JUST LOGGED. The previous version reported the failed
  // delete to stdout and vitest swallowed it for a passing file, so the leak was
  // invisible for four sessions and surfaced as an unrelated-looking
  // `companies_slug_key` error in the NEXT run's beforeAll. A cleanup that
  // cannot fail its own run is not a cleanup.
  expect(count, `${MARKER} companies left behind — cleanup did not work`).toBe(0);
  expect(errors, 'teardown errors').toEqual([]);
}, 180_000);
