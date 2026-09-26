import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { notify } from '@/lib/notify/notify';
import baseline from '@/lib/schema-fingerprint-baseline.json';

// ===========================================================================
// S108 C2 — THE DAILY SCHEMA-DRIFT CHECK. The LOOP lives here.
// ===========================================================================
// ⚠️ WHY THIS IS A lib/ MODULE AND NOT THE ROUTE ITSELF, and it is not a
// stylistic preference: A NEXT.JS ROUTE FILE MAY ONLY EXPORT A FIXED SET OF
// NAMES. The first cut of this put `compareFingerprints` and `runSchemaDrift`
// in route.ts; `tsc --noEmit` passed clean and `next build` failed with
// `"compareFingerprints" is not a valid Route export field`. That is exactly
// the class CLAUDE.md records — "a shared constant in a route file
// type-checks clean and fails the build" — and it is why Spec D measured
// whether CI builds every branch (it does).
//
// It is also the split every cron in this repo already uses: the loop in
// lib/, the route as the auth gate and the real clock, so a harness can drive
// the loop directly. See lib/services/warming-email.ts.
// ===========================================================================
// ⚠️ WHY IT EXISTS. Production has been written by hand. Two S104 migrations
// were applied through the SQL Editor, silently truncated, and LEFT LEDGER ROWS
// FOR WORK THAT NEVER RAN. The ledger can lie, so this reads the OBJECTS —
// `public.schema_fingerprint()` (20261620000000) digests RLS policies, trigger
// definitions, function bodies and constraints straight out of pg_catalog.
//
// ⚠️ WHY A CRON ROUTE AND NOT A CI JOB [RULED Josh]. A CI job would need a
// PRODUCTION service-role key in GitHub Actions secrets. That is the exact
// shape S107 removed from this repo — a production `sb_secret_` key living in
// an account-level Codespaces secret, since revoked. Production already holds
// its own service-role key in Vercel; this uses that and adds no new secret
// anywhere.
//
// ⚠️ WHY THE FIFTEENTH CRON RATHER THAN FOLDING INTO AN EXISTING ONE.
// `context104.md:130` records a malformed `vercel.json` failing a deploy with
// eleven migrations already on production, and S104 concluded from that to fold
// new jobs into existing routes. That rule is "fold only when the DOMAIN and
// BLAST RADIUS are shared", and this shares neither: hiding a platform-integrity
// check inside, say, the QuickBooks sync means it stops silently the moment that
// integration breaks — which is precisely when you would want it. The S103
// deploy risk is closed by a TEST instead (`email-warming.test.ts` JSON.parses
// `vercel.json` in CI and now pins this entry's path AND schedule).
//
// ⚠️ THE BASELINE IS IMPORTED, NOT READ FROM DISK, AND NOT FROM `scripts/`.
// Vercel's serverless bundle contains only files traced from inside `apps/web`.
// A `readFileSync('../../scripts/.db-fingerprint.json')` works in the Codespace
// and returns ENOENT in production — the worst possible failure mode for a drift
// detector, because the catch would read as "nothing to report". A static import
// is traced at build time and cannot go missing. `npm run db:fingerprint` writes
// BOTH copies in one pass and `s108-schema-drift.test.ts` asserts they are
// byte-identical.
//
// ⚠️ WHAT THIS CANNOT CATCH, stated because a detector's limits are part of it:
// a statement applied and reverted between two daily runs; DDL executed at
// runtime from a function built with format()/EXECUTE; data drift (it reads no
// tenant row); and a constraint that is WRONG rather than missing, which agrees
// with the tree and reports clean — `#3-deliv`'s class, catchable only by a test
// that performs the operation.
// ===========================================================================

/**
 * The tenant whose Owner is told, read from the environment.
 *
 * ⚠️ BY COMPANY ID, NOT SLUG [RULED Josh, S108 FILL-C6]. `notify()` is
 * tenant-scoped and schema drift is not — a contractor can neither act on a
 * platform-integrity alert nor should be shown one, so this is NOT sent to
 * every tenant's Owner. And a slug is editable from Company Settings, so
 * keying on one means a rename silently stops the reporting with nothing
 * saying so.
 *
 * ⚠️ AN ENV VAR RATHER THAN A LITERAL, AND THE REASON MATTERS. The production
 * company id was NOT available when this was written — production is not
 * readable from the build environment, and inventing a plausible UUID to fill
 * the gap is the precise failure this codebase keeps recording: a value that
 * looks measured and is not. A wrong literal here would resolve no owner, take
 * the `notes` branch below, and report "no owner profile" every single day
 * while looking like it worked.
 *
 * Spec E gives Josh the query that produces the id and the Vercel variable to
 * set. UNSET IS A SUPPORTED STATE: the route still runs, still compares, and
 * still reports drift in its response and its log — it simply writes no
 * notification, and says so in `notes`. A detector that refuses to run because
 * it has nobody to tell is worse than one that runs and records.
 */
const DRIFT_NOTIFY_COMPANY_ID = process.env.SCHEMA_DRIFT_COMPANY_ID ?? '';

type Dimension = 'policies' | 'triggers' | 'functions' | 'constraints';
const DIMENSIONS: readonly Dimension[] = ['policies', 'triggers', 'functions', 'constraints'];

interface DimensionPrint {
  n: number;
  md5: string;
}
interface Fingerprint {
  policies: DimensionPrint;
  triggers: DimensionPrint;
  functions: DimensionPrint;
  constraints: DimensionPrint;
  latest_migration: string | null;
}

export interface DriftFinding {
  dimension: Dimension;
  expected: DimensionPrint;
  actual: DimensionPrint;
  /** True when the COUNT moved too — an object was added or removed, not edited. */
  countChanged: boolean;
}

export interface DriftOutcome {
  ok: boolean;
  checked: number;
  drift: DriftFinding[];
  baselineLatestMigration: string | null;
  liveLatestMigration: string | null;
  /** How many anon-executable functions the catalog reported (allowlisted or not). */
  anonExecutable: number;
  /** Anon-executable functions OUTSIDE the allowlist. Any entry fails the run. */
  anonViolations: string[];
  /** Non-fatal notes — e.g. the notify target not existing on this database. */
  notes: string[];
  notified: number;
  errors: string[];
}

/**
 * Compare a live fingerprint against the committed baseline.
 *
 * Exported and pure so the harness can drive it with a hand-built fingerprint
 * and assert that it FIRES — `#1-deliv`'s lesson is that a detector never seen
 * to fire is not a detector, and the cheapest place to see it fire is here.
 */
export function compareFingerprints(
  expected: Fingerprint,
  actual: Fingerprint
): { drift: DriftFinding[]; checked: number } {
  const drift: DriftFinding[] = [];
  for (const dimension of DIMENSIONS) {
    const e = expected[dimension];
    const a = actual[dimension];
    if (!e || !a) continue;
    if (e.md5 !== a.md5) {
      drift.push({ dimension, expected: e, actual: a, countChanged: e.n !== a.n });
    }
  }
  return { drift, checked: DIMENSIONS.length };
}

// ===========================================================================
// S112 — THE ANON EXECUTE GUARD. A second, independent check in the same tick.
// ===========================================================================
// ⚠️ WHY IT IS HERE. 20261870000000 took anon's EXECUTE from 272 functions to
// 3, and fixed the postgres default that granted it. It could NOT fix
// supabase_admin's default, which still grants anon EXECUTE on every function
// supabase_admin creates in public — `ALTER DEFAULT PRIVILEGES FOR ROLE
// supabase_admin` is refused (42501) to the migration role. See
// 20261900000000 for the measurement. The fingerprint above cannot see this:
// GRANTS are outside it by design. So the grant set is checked on its own.
//
// ⚠️ SIGNATURES, NOT NAMES. An overload `submit_sub_bid_reply(text)` added
// beside the real one would pass a name-only allowlist while exposing a new
// body. Changing an argument list here is a reviewed code change, which is
// exactly the friction a new anon entry point should carry.
export const ANON_EXECUTE_ALLOWLIST: readonly string[] = [
  // app/invite/accept/accept-invite.tsx — both invitation reads, logged out.
  'get_invitation_by_token(invite_token uuid)',
  'get_invitation_status(invite_token uuid)',
  // app/bid/[token]/bid-reply-client.tsx — the sub's bid, logged out.
  'submit_sub_bid_reply(p_token text, p_bid_amount numeric, p_labor_amount numeric, ' +
    'p_material_amount numeric, p_scope_coverage_percent numeric, p_exclusions text, ' +
    'p_holds_until date)',
];

export interface AnonExposureRow {
  signature: string;
  owner: string;
  security_definer: boolean;
  extension: string | null;
}

/** Pure, so the harness can drive it with hand-built rows and see it FIRE. */
export function compareAnonExposure(rows: readonly AnonExposureRow[]): string[] {
  return rows
    .filter((r) => !ANON_EXECUTE_ALLOWLIST.includes(r.signature))
    .map(
      (r) =>
        `${r.signature} [owner ${r.owner}${r.security_definer ? ', SECURITY DEFINER' : ''}` +
        `${r.extension ? `, extension ${r.extension}` : ''}]`
    );
}

export async function runSchemaDrift(admin: SupabaseClient<Database>): Promise<DriftOutcome> {
  const outcome: DriftOutcome = {
    ok: true,
    checked: 0,
    drift: [],
    baselineLatestMigration: (baseline as unknown as Fingerprint).latest_migration ?? null,
    liveLatestMigration: null,
    anonExecutable: 0,
    anonViolations: [],
    notes: [],
    notified: 0,
    errors: [],
  };

  // [S112] The anon guard runs FIRST and on its own, so a fingerprint failure
  // below cannot hide it, and a stale fingerprint baseline cannot either.
  const { data: exposure, error: exposureError } = await admin.rpc(
    'anon_execute_exposure' as never
  );
  if (exposureError) {
    outcome.ok = false;
    outcome.errors.push(`anon_execute_exposure() failed: ${exposureError.message}`);
    console.error('[schema-drift] anon exposure RPC failed', {
      route: 'GET /api/cron/schema-drift',
      check: 'admin.rpc(anon_execute_exposure)',
      message: exposureError.message,
    });
  } else {
    const rows = (exposure ?? []) as unknown as AnonExposureRow[];
    outcome.anonExecutable = rows.length;
    outcome.anonViolations = compareAnonExposure(rows);
    if (outcome.anonViolations.length > 0) {
      outcome.ok = false;
      console.error('[schema-drift] ANON CAN EXECUTE A FUNCTION OUTSIDE THE ALLOWLIST', {
        route: 'GET /api/cron/schema-drift',
        violations: outcome.anonViolations,
      });
    }
  }
  const anonFailed = outcome.anonViolations.length > 0;

  // ⚠️ THE ERROR IS READ, NOT DISCARDED. A destructure of `data` alone would
  // make "the RPC is missing" and "no drift" the same silent success — which is
  // the failure this whole route exists to prevent, reproduced inside it.
  const { data, error } = await admin.rpc('schema_fingerprint');
  if (error) {
    outcome.ok = false;
    outcome.errors.push(`schema_fingerprint() failed: ${error.message}`);
    console.error('[schema-drift] fingerprint RPC failed', {
      route: 'GET /api/cron/schema-drift',
      check: 'admin.rpc(schema_fingerprint)',
      message: error.message,
    });
    // [S112] An anon violation is still notified when the fingerprint fails.
    if (!anonFailed) return outcome;
  } else {
    const actual = data as unknown as Fingerprint;
    outcome.liveLatestMigration = actual?.latest_migration ?? null;

    const { drift, checked } = compareFingerprints(baseline as unknown as Fingerprint, actual);
    outcome.checked = checked;
    outcome.drift = drift;
    // [S112] `&&`, not `=`: an anon violation or RPC error above already set it false.
    outcome.ok = outcome.ok && drift.length === 0;
  }
  const drift = outcome.drift;

  if (drift.length === 0 && !anonFailed) return outcome;

  // ⚠️ THE FULL DETAIL GOES TO THE SERVER LOG AND THE RESPONSE BODY — NEVER
  // INTO THE NOTIFICATION. Which policy predicate changed is a map of the
  // Financial Visibility Floor; a notification row is tenant-readable data.
  if (drift.length > 0)
    console.error('[schema-drift] DRIFT DETECTED', {
      route: 'GET /api/cron/schema-drift',
      baselineLatestMigration: outcome.baselineLatestMigration,
      liveLatestMigration: outcome.liveLatestMigration,
      dimensions: drift.map((d) => ({
        dimension: d.dimension,
        expected: d.expected,
        actual: d.actual,
      })),
    });

  if (!DRIFT_NOTIFY_COMPANY_ID) {
    outcome.notes.push(
      'SCHEMA_DRIFT_COMPANY_ID is not set; drift reported in this response and the log only'
    );
    return outcome;
  }

  const { data: owner, error: ownerError } = await admin
    .from('profiles')
    .select('id, role, email, first_name')
    .eq('company_id', DRIFT_NOTIFY_COMPANY_ID)
    .eq('role', 'owner')
    .eq('is_deleted', false)
    // Ordered, not arbitrary: `profiles_one_owner_per_company` makes this at
    // most one row, but an ORDER BY costs nothing and stops this becoming a
    // heap-order pick if that partial index is ever relaxed. [CLAUDE.md]
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (ownerError) {
    outcome.errors.push(`owner lookup failed: ${ownerError.message}`);
    return outcome;
  }
  if (!owner) {
    // Not an error. rebuild-test has no Worth Properties, and a drift report
    // with nowhere to go must still REPORT in the response rather than throw.
    outcome.notes.push(
      `no owner profile for company ${DRIFT_NOTIFY_COMPANY_ID}; drift reported in this response only`
    );
    return outcome;
  }

  const result = await notify({
    admin,
    companyId: DRIFT_NOTIFY_COMPANY_ID,
    type: 'schema_drift',
    recipients: [
      { profileId: owner.id, role: 'owner', email: owner.email, firstName: owner.first_name },
    ],
    // ⚠️ NO DETAIL in either message. Deliberate — see above. For the anon
    // guard doubly so: the list is a map of what the public key can call.
    render: () =>
      anonFailed
        ? {
            title: 'Database security check failed',
            body: 'The public (anon) key can call a database function outside the allowlist. Check the schema-drift cron log.',
          }
        : {
            title: 'Database schema drift detected',
            body: 'The live database no longer matches the committed schema fingerprint. Check the schema-drift cron log.',
          },
    tag: 'schema-drift',
  });
  outcome.notified = result.written;
  return outcome;
}
