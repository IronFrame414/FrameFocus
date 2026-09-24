/**
 * S97CT-REPLYTO — +REPLY-TO resolution against real rows (Josh, S97).
 *
 * The wiring (header set, never the recipient, degrades to no header) is unit-
 * tested in reply-to.test.ts. What is proven HERE is the RESOLUTION ORDER
 * against the real schema:
 *
 *   companies.email  ->  the OWNER's profile email  ->  null
 *
 * and that it works for EVERY company, not just Sabal Point Construction — the
 * ruling is platform-wide.
 *
 * ⚠️ AMENDED [Josh, 2026-09-24 — companies.email is REQUIRED]. Cases 2 and 4
 * USED to prove the fallback arms against real rows: case 2 cleared Bishop's
 * email and expected the OWNER's address; case 4 inserted an "Orphan Co" with
 * neither and expected null. Both states are now impossible —
 * `companies_email_required_check` (20261760000000) refuses a blank email on
 * INSERT and on UPDATE. So both cases are INVERTED, not deleted: they now assert
 * the refusal, and are the live regression guard for the ruling.
 *
 * The fallback arms themselves still exist in `resolveCompanyReplyTo` (ruling 2
 * keeps them as a safety net if the constraint is ever dropped). Their coverage
 * moved to a unit test against a mocked row:
 * `lib/services/company-reply-to-resolver.test.ts`. With the constraint in place
 * they are unreachable in practice — not a live path.
 *
 * NOTHING IS EMAILED. Only the resolver is called.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { admin, assertRebuildTest } from './live-session';

const MARKER = 'S97REPLYTO';

let bishopId: string;
let ridgelineId: string;
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
  // 20261039 — file_categories are trigger-seeded on every company insert,
  // exactly like the lien templates above; this inline purge is its own list
  // (COMPANY_CHILDREN carries the same entry) and needs it too.
  must(
    'purge file categories',
    (await admin.from('file_categories').delete().in('company_id', ids)).error
  );
  must('purge companies', (await admin.from('companies').delete().in('id', ids)).error);
}

beforeAll(async () => {
  assertRebuildTest();
  await purgeMarkerCompanies();

  const { data: bishop } = await admin
    .from('companies').select('id, email').eq('name', 'Sabal Point Construction').single();
  bishopId = bishop!.id;
  bishopEmailBefore = bishop!.email;

  // ⚠️ BY NAME, NOT SLUG [S136]. S136's backfill (20260917000000) rewrote
  // company slugs to drop the hex suffix, so `slug` is no longer a stable
  // lookup key — it is the email local part. Bishop above was already resolved
  // by name; this line was the inconsistent one.
  const { data: ridgeline } = await admin
    .from('companies').select('id').eq('name', 'Ridgeline Builders (TEST CO 2)').single();
  ridgelineId = ridgeline!.id;
}, 180_000);

/** PostgREST surfaces a CHECK violation as SQLSTATE 23514. */
const CHECK_VIOLATION = '23514';

describe('S97CT-REPLYTO — resolution order against the real schema', () => {
  it('1. companies.email is the source of truth when it is set', async () => {
    must('set email', (await admin
      .from('companies').update({ email: 'office@bishopcontracting.com' }).eq('id', bishopId)).error);

    expect(await resolve(bishopId)).toBe('office@bishopcontracting.com');
  });

  // ⚠️ INVERTED [2026-09-24]. Was: "2. FALLS BACK to the OWNER when
  // companies.email is empty — the branch that runs today". It cleared Bishop's
  // email and expected the owner's. Clearing is now refused (ruling 3), which is
  // the whole fix: the blank that stranded a real client's reply cannot be
  // written, by any role, including the service role used here.
  it('2. CLEARING companies.email is REFUSED — NULL, empty and whitespace alike', async () => {
    must('set a known email', (await admin
      .from('companies').update({ email: 'office@bishopcontracting.com' }).eq('id', bishopId)).error);

    for (const blank of [null, '', '   ']) {
      const { error } = await admin.from('companies').update({ email: blank }).eq('id', bishopId);
      expect(error?.code, `clearing to ${JSON.stringify(blank)} was accepted`).toBe(CHECK_VIOLATION);
      expect(error?.message).toContain('companies_email_required_check');
    }

    // The row really is unchanged — the refusal is the fact, not the error text.
    const { data: after } = await admin
      .from('companies').select('email').eq('id', bishopId).single();
    expect(after!.email).toBe('office@bishopcontracting.com');
  });

  it('3. PLATFORM-WIDE — the second company resolves to ITS OWN address, not Bishop\'s', async () => {
    // The ruling is not Bishop-specific. A cross-company leak here would send
    // one company's client replies to another company's inbox.
    //
    // [2026-09-24] Ridgeline's companies.email was NULL until 20261760000000
    // backfilled it with its owner's address, so the value is unchanged; it now
    // arrives through the FIRST arm (companies.email), not the fallback.
    const resolved = await resolve(ridgelineId);
    expect(resolved).toBe('josh+qa-b-owner@worthprop.com');
    expect(resolved).not.toBe('office@bishopcontracting.com');
  });

  // ⚠️ INVERTED [2026-09-24]. Was: "4. a company with NEITHER an email nor an
  // owner resolves to null", built on an inserted "Orphan Co" with no email.
  // That company can no longer be created (ruling 1). The null arm is unit-
  // tested in company-reply-to-resolver.test.ts.
  it('4. INSERTING a company with no email is REFUSED — NULL, empty and whitespace alike', async () => {
    const attempts: Array<{ label: string; email?: string | null }> = [
      { label: 'omitted' },
      { label: 'null', email: null },
      { label: 'empty', email: '' },
      { label: 'whitespace', email: '   ' },
    ];
    for (const a of attempts) {
      const slug = `${MARKER.toLowerCase()}-blank-${a.label}`;
      const row: { name: string; slug: string; email?: string | null } = {
        name: `${MARKER} Blank ${a.label}`,
        slug,
      };
      if ('email' in a) row.email = a.email;
      const { error } = await admin.from('companies').insert(row);
      expect(error?.code, `an insert with email ${a.label} was accepted`).toBe(CHECK_VIOLATION);

      // Counted, not inferred from the error.
      const { data: landed } = await admin.from('companies').select('id').eq('slug', slug);
      expect(landed, `a company with email ${a.label} landed`).toEqual([]);
    }

    // ⚠️ THE CONTROL THAT MUST SUCCEED. Without it every refusal above passes
    // on an insert that fails for some unrelated reason (a slug clash, a new
    // NOT NULL column) — a probe that cannot fail.
    const { error: okErr } = await admin.from('companies').insert({
      name: `${MARKER} Has Email`,
      slug: `${MARKER.toLowerCase()}-has-email`,
      email: `${MARKER.toLowerCase()}-office@qa-noreply.ezcontractorbinder.com`,
    });
    expect(okErr, 'the control insert WITH an email was refused').toBeNull();
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
  // NAME rather than on an id, so a run that died mid-case still cleans up
  // whatever a previous one left — including a blank-email company, should the
  // constraint ever be dropped and case 4's inserts land.
  try {
    await purgeMarkerCompanies();
  } catch (e) {
    errors.push((e as Error).message);
  }

  const { count } = await admin
    .from('companies').select('id', { count: 'exact', head: true }).like('name', `${MARKER}%`);
  console.log(`\n[${MARKER} TEARDOWN] rows left: ${count}; errors: ${errors.length ? JSON.stringify(errors) : 'NONE'}`);
  // ⚠️ [S168] THIS THROW IS THE POINT. The teardown has always collected
  // `errors` and only PRINTED them, so when the S168 delete boundary began
  // refusing this suite's signed change order the cleanup failed in silence,
  // the project FK-blocked behind it, and the NEXT run died on a duplicate
  // `co_number` in `beforeAll` — a failure reported by a different suite, one
  // run later, with no trace of the cause. A cleanup that cannot fail its own
  // run is not a cleanup.
  if (errors.length) throw new Error(`[${MARKER}] teardown failed: ${JSON.stringify(errors)}`);

  // ⚠️ ASSERTED, NOT JUST LOGGED. The previous version reported the failed
  // delete to stdout and vitest swallowed it for a passing file, so the leak was
  // invisible for four sessions and surfaced as an unrelated-looking
  // `companies_slug_key` error in the NEXT run's beforeAll. A cleanup that
  // cannot fail its own run is not a cleanup.
  expect(count, `${MARKER} companies left behind — cleanup did not work`).toBe(0);
  expect(errors, 'teardown errors').toEqual([]);
}, 180_000);
