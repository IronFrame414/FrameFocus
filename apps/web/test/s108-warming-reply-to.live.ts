/**
 * S108 C1 — WARMING REPLY-TO IS ON THE WARMING DOMAIN, FOR BOTH COMPANIES.
 *
 * ⚠️ WHAT THIS EXISTS TO CATCH, in one sentence: arming the warming sender
 * before this fix would have mailed a REAL PERSON — `tristanhhsr@gmail.com`,
 * the owner of `h-h-signature-renovations`, a friend of Josh's who never asked
 * for warming mail — because that company's `companies.email` is NULL and
 * `resolveCompanyReplyTo()` falls back to the OWNER'S PROFILE EMAIL.
 *
 * ⚠️ AND WHY THE NULL CASE IS THE WHOLE POINT. A test that only covered a
 * company WITH `companies.email` set would have been green against the broken
 * code, because that arm resolves to a company address that at least looks
 * plausible. The failure lived entirely in the FALLBACK. So case 2 below is
 * not "another company for coverage" — it is the case that was broken, and it
 * is constructed deliberately: company email NULL, owner email on gmail.com.
 *
 * NOTHING IS EMAILED. `sendEmail` and `logEmail` are mocked, and the mock on
 * `logEmail` is load-bearing beyond politeness: `runEmailWarming` counts this
 * week's sends by reading `email_logs`, so a real write would change the
 * pacing decision on the second company in the same run.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { admin, assertRebuildTest, deleteCompanies, TEST_PASSWORD } from './live-session';
import { SENDING_DOMAIN } from '@/lib/services/email-service';

const MARKER = 'S108WARMREPLY';

/** Deliberately OFF the warming domain — the address that must never appear. */
const OWNER_PERSONAL_EMAIL = `${MARKER.toLowerCase()}-owner@gmail.com`;
const COMPANY_SETTINGS_EMAIL = `${MARKER.toLowerCase()}-office@worthprop.com`;

interface Captured {
  from: string;
  to: string;
  replyTo?: string | null;
  replyToCompanyId?: string | null;
}

const sent: Captured[] = [];

// ⚠️ MOCKED AT THE MODULE BOUNDARY, not at the call site. `warming-email.ts`
// imports `sendEmail` and `logEmail` at module load, so intercepting the module
// is the only way to see what the REAL call site passes — which is precisely
// what is under test. `SENDING_DOMAIN` and `buildSenderAddress` are passed
// through to the real implementations: faking them would let this file agree
// with itself about the domain while the product disagreed.
vi.mock('@/lib/services/email-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/services/email-service')>();
  return {
    ...actual,
    sendEmail: vi.fn(async (params: Captured) => {
      sent.push({
        from: params.from,
        to: params.to,
        replyTo: params.replyTo ?? null,
        replyToCompanyId: params.replyToCompanyId ?? null,
      });
      return { messageId: `${MARKER}-mock`, error: null };
    }),
    logEmail: vi.fn(async () => `${MARKER}-log`),
  };
});

let withEmailId = '';
let nullEmailId = '';
let ownerUserId = '';

const must = (label: string, error: { message: string } | null) => {
  if (error) throw new Error(`${label}: ${error.message}`);
};

/**
 * ⚠️ PURGE GOES THROUGH `deleteCompanies`, NOT A HAND-WRITTEN LIST.
 *
 * `COMPANY_CHILDREN` is enumerated from the live catalogue and is the one place
 * that list is allowed to go stale — `s97ct-reply-to.live.ts` records what
 * hand-rolling it costs (7F's seed trigger creates 8 `lien_release_templates`
 * per company on a NO ACTION FK, so deleting the company alone raises 23503,
 * and the old teardown only `console.log`-ged that, which vitest suppresses for
 * a PASSING file — the file passed once and never twice in a row).
 *
 * The AUTH USER is deleted separately and LAST: `profiles.user_id` is
 * `ON DELETE CASCADE` from `auth.users`, so removing the user first would take
 * the profile out from under `deleteCompanies` and leave the order ambiguous.
 *
 * Called from BOTH ends so a crashed run cannot poison the next one.
 */
async function purge(): Promise<void> {
  const { data: stale } = await admin.from('companies').select('id').like('name', `${MARKER}%`);
  const ids = (stale ?? []).map((c) => (c as { id: string }).id);
  if (ids.length) await deleteCompanies(admin, ids);

  const { data: users } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  for (const u of users?.users ?? []) {
    if (u.email?.toLowerCase() === OWNER_PERSONAL_EMAIL.toLowerCase()) {
      await admin.auth.admin.deleteUser(u.id);
    }
  }
}

/**
 * Drive one tick with warming forced ON for our two companies only.
 *
 * ⚠️ `random: () => 0` forces `shouldSendNow` to fire on every slot rather than
 * leaving the assertion at the mercy of a probability. The pacing maths has its
 * own unit tests (`email-warming.test.ts`); what is under test HERE is the
 * Reply-To on the send that results.
 */
async function runTick(): Promise<void> {
  sent.length = 0;
  vi.resetModules();
  const { runEmailWarming } = await import('@/lib/services/warming-email');
  // A Tuesday, 14:00 UTC — inside the ruled slot window `13-22 * * 1-5`.
  await runEmailWarming(admin as never, new Date('2026-09-22T14:00:00.000Z'), () => 0);
}

beforeAll(async () => {
  assertRebuildTest();
  await purge();

  // Case 1 — companies.email SET. The arm that always looked fine.
  const { data: a, error: aErr } = await admin
    .from('companies')
    .insert({
      name: `${MARKER} With Email`,
      slug: `${MARKER.toLowerCase()}-with-email`,
      email: COMPANY_SETTINGS_EMAIL,
      email_warming_enabled: true,
    })
    .select('id')
    .single();
  must('company with email', aErr);
  withEmailId = (a as { id: string }).id;

  // ── Case 2 — ⚠️ THE CASE THAT WAS BROKEN ────────────────────────────────
  // companies.email NULL, and a REAL OWNER PROFILE carrying a personal address
  // the resolver falls back to.
  //
  // ⚠️ BUILT THROUGH THE APP'S OWN SIGNUP PATH, not by inserting a profile.
  // `profiles.user_id` is NOT NULL with a UNIQUE index and an FK to
  // `auth.users`, so a synthetic profile is impossible without an auth user —
  // and creating one fires `on_auth_user_created` (`handle_new_user`), whose
  // OWNER PATH creates the company AND the owner profile itself. Fighting that
  // would mean reproducing it; using it means the fixture is the real shape.
  const { data: created, error: userErr } = await admin.auth.admin.createUser({
    email: OWNER_PERSONAL_EMAIL,
    password: TEST_PASSWORD,
    email_confirm: true,
    user_metadata: { company_name: `${MARKER} Null Email`, first_name: MARKER, last_name: 'Owner' },
  });
  must('auth user for the NULL-email company', userErr);
  ownerUserId = created!.user!.id;

  const { data: prof, error: profErr } = await admin
    .from('profiles')
    .select('company_id, email, role')
    .eq('user_id', ownerUserId)
    .single();
  must('profile created by handle_new_user', profErr);
  nullEmailId = (prof as { company_id: string }).company_id;

  // The fixture's own preconditions, asserted rather than assumed — if
  // handle_new_user ever stops writing the owner's email onto the profile, the
  // fallback this file is about would not exist and cases 2/4 would pass
  // vacuously.
  expect((prof as { role: string }).role, 'handle_new_user did not make them owner').toBe('owner');
  expect((prof as { email: string }).email.toLowerCase()).toBe(OWNER_PERSONAL_EMAIL.toLowerCase());

  must(
    'arm the NULL-email company',
    (
      await admin
        .from('companies')
        .update({
          email: null,
          email_warming_enabled: true,
          slug: `${MARKER.toLowerCase()}-null-email`,
        })
        .eq('id', nullEmailId)
    ).error
  );
}, 180_000);

afterAll(async () => {
  await purge();
}, 180_000);

describe('S108 C1 — warming Reply-To never leaves the warming domain', () => {
  it('0 — the fixture is real: BOTH companies are enabled and the tick considered them', async () => {
    await runTick();
    // ⚠️ A test that passes on zero sends is a failure. This case exists so the
    // three below cannot be vacuously green on an empty `sent` array.
    const ours = sent.filter((s) => s.from.includes(MARKER.toLowerCase()));
    expect(ours.length, 'the tick sent nothing for either seeded company').toBe(2);
  });

  it('1 — the company WITH a settings email replies to the warming domain', async () => {
    await runTick();
    const row = sent.find((s) => s.from.includes(`${MARKER.toLowerCase()}-with-email`));
    expect(row, 'no send for the with-email company').toBeTruthy();
    expect(row!.replyTo).toBe(row!.from);
    expect(row!.replyTo).toContain(`@${SENDING_DOMAIN}`);
    expect(row!.replyTo, 'the company settings email reached Reply-To').not.toContain(
      COMPANY_SETTINGS_EMAIL
    );
  });

  it("2 — ⚠️ the NULL-company-email case replies to the warming domain, NOT the owner's personal inbox", async () => {
    await runTick();
    const row = sent.find((s) => s.from.includes(`${MARKER.toLowerCase()}-null-email`));
    expect(row, 'no send for the null-email company').toBeTruthy();
    expect(row!.replyTo).toBe(row!.from);
    expect(row!.replyTo).toContain(`@${SENDING_DOMAIN}`);
    // The whole reason this file exists.
    expect(row!.replyTo, 'warming mail would reach a real person').not.toContain(
      OWNER_PERSONAL_EMAIL
    );
  });

  it('3 — NO warming send resolves Reply-To through the company resolver at all', async () => {
    await runTick();
    for (const row of sent) {
      // `replyToCompanyId` is what the broken version passed. An explicit
      // Reply-To wins inside sendEmail(), so leaving BOTH set would still pass
      // cases 1-2 while re-introducing the resolver on the next refactor.
      expect(row.replyToCompanyId, 'warming still passes replyToCompanyId').toBeNull();
      expect(row.replyTo, 'a warming send carried no Reply-To at all').toBeTruthy();
      expect(row.replyTo!.endsWith(`@${SENDING_DOMAIN}>`) || row.replyTo!.endsWith(`@${SENDING_DOMAIN}`)).toBe(true);
    }
  });
});

describe('S108 C1 — and NO OTHER email type changed', () => {
  it('4 — ⚠️ the shared resolver is UNTOUCHED: it still falls back to the owner, off-domain', async () => {
    // The counterfactual that makes cases 1-3 meaningful. If this went green by
    // the resolver having been "fixed" to return a domain address, every real
    // client email — proposals, invoices, change orders, the three reminder
    // crons — would silently stop reaching the contractor. C1 is a CALL-SITE
    // override precisely so this stays true.
    vi.resetModules();
    const { resolveCompanyReplyTo } = await vi.importActual<
      typeof import('@/lib/services/email-service')
    >('@/lib/services/email-service');

    const resolved = await resolveCompanyReplyTo(nullEmailId);
    expect(resolved, 'the resolver no longer falls back to the owner').toBe(OWNER_PERSONAL_EMAIL);
    expect(resolved, 'the resolver was rewritten to the sending domain').not.toContain(
      SENDING_DOMAIN
    );
  });

  it('5 — and it still prefers companies.email when one is set', async () => {
    vi.resetModules();
    const { resolveCompanyReplyTo } = await vi.importActual<
      typeof import('@/lib/services/email-service')
    >('@/lib/services/email-service');
    expect(await resolveCompanyReplyTo(withEmailId)).toBe(COMPANY_SETTINGS_EMAIL);
  });
});
