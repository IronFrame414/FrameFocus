/**
 * Shared session helper for the live harnesses (`test/*.live.ts`).
 *
 * NOT itself a harness — the runner's include glob is `test/*.live.ts`, and this
 * filename deliberately does not match it.
 *
 * Sessions are minted with the PASSWORD grant from the persistent test
 * identities (STATE.md → Test Data, seeded by scripts/seed-test-identities.mjs),
 * falling back to a magic link via the service role. Password first for two
 * reasons: Supabase rate-limits OTP generation hard enough that a few harness
 * runs in a row start failing, and signing in the way a human would keeps the
 * documented credentials honest — if the password in STATE.md rots, these fail.
 *
 * The client returned is a real supabase-js client on the ANON key carrying a
 * real user JWT, so RLS applies exactly as it does in the app.
 */
import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deleteCompanies, purgeCompaniesNamed } from '../test-support/company-purge';

export { deleteCompanies, purgeCompaniesNamed };

export const REQUIRED_PROJECT_REF = 'nmyphyhmfttxkdoposvf'; // framefocus-rebuild-test

/** Shared password for every seeded test identity. See STATE.md → Test Data. */
export const TEST_PASSWORD = 'FrameFocusTest!2026';

export const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!;
export const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
export const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/** Service-role client — fixtures, verification reads, and nothing else. */
export const admin = createSupabaseClient(URL_, SERVICE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/** Refuse to touch anything but rebuild-test. Call this in every beforeAll. */
export function assertRebuildTest(): void {
  if (!URL_?.includes(REQUIRED_PROJECT_REF)) {
    throw new Error(`REFUSING TO RUN: linked project is not ${REQUIRED_PROJECT_REF}. URL=${URL_}`);
  }
}

/**
 * Repoint the profile the `auth.users` trigger just created, and remove the
 * tenant it came with.
 *
 * ⚠️ WHY THIS EXISTS AS OF S135. `20260914000000` brought the `on_auth_user_created`
 * trigger into version control. It had ALWAYS existed on production and had
 * NEVER existed on rebuild-test, which is why harnesses here could call
 * `admin.auth.admin.createUser()` and then INSERT a profile by hand. They can
 * no longer: the trigger inserts one first, and `profiles_user_id_key` refuses
 * the second. The direct INSERT was never a design — it was standing in for a
 * divergence between the two databases.
 *
 * A tokenless `createUser` takes the OWNER path, so it leaves a company, a
 * subscription, a `trial_emails` row and a seeded tag set behind. This adopts
 * the profile into the company the caller actually wanted and deletes the rest,
 * `trial_emails` included — leaving that row would silently deny a real trial
 * to the same address later.
 *
 * Harnesses that want to exercise the INVITED path should not use this; they
 * should pass `invitation_token` in `user_metadata` against a live invitation,
 * as `s133-subcontractor-read-floor.live.ts` does.
 */
export async function adoptSignupProfile(
  userId: string,
  fields: {
    companyId: string;
    email: string;
    role: string;
    firstName?: string;
    lastName?: string;
  }
): Promise<{ profileId: string; memberId: string | null }> {
  const { data: auto, error } = await admin
    .from('profiles')
    .select('id, company_id')
    .eq('user_id', userId)
    .single();
  if (error || !auto) {
    throw new Error(
      `adoptSignupProfile: no profile for ${userId} — is the auth.users trigger installed? (${error?.message})`
    );
  }
  const profileId = (auto as { id: string }).id;
  const spuriousCompanyId = (auto as { company_id: string }).company_id;

  const { error: upErr } = await admin
    .from('profiles')
    .update({
      company_id: fields.companyId,
      role: fields.role,
      first_name: fields.firstName ?? '',
      last_name: fields.lastName ?? '',
    })
    .eq('id', profileId);
  if (upErr) throw new Error(`adoptSignupProfile: ${upErr.message}`);

  // `profiles_create_member` made the member row in the spurious company.
  const { data: member } = await admin
    .from('company_members')
    .select('id')
    .eq('profile_id', profileId)
    .maybeSingle();
  const memberId = member ? (member as { id: string }).id : null;
  if (memberId) {
    await admin.from('company_members').update({ company_id: fields.companyId }).eq('id', memberId);
  }

  // ⚠️ #2-s147 — THIS BLOCK LEAKED A COMPANY EVERY TIME IT RAN.
  //
  // It used to delete `tag_options`, `subscriptions`, `companies` — and read no
  // error from any of them. Since 7F's seed trigger (`20260922000000`) the
  // parent delete cannot succeed: 8 `lien_release_templates` pin it and the FK
  // is NO ACTION. The spurious company therefore survived, silently, on every
  // adopted signup.
  //
  // Measured: 2 orphans per run of `s97ct-7e-clicktest.live.ts`, this helper's
  // only caller. `deleteCompanies()` deletes the full child list and THROWS if
  // the parent still stands.
  if (spuriousCompanyId !== fields.companyId) {
    await deleteCompanies(admin, [spuriousCompanyId]);
  }
  await admin.from('trial_emails').delete().eq('email', fields.email.toLowerCase());

  return { profileId, memberId };
}

/**
 * ============================================================================
 * TOKEN CACHE — why this exists, and what it is NOT
 * ============================================================================
 * `sessionFor()` is called **168 times** across the live harnesses (40 of them
 * for the owner alone), and every call used to be a fresh password grant. A full
 * `npm run test:live` therefore made ~168 auth requests in ~5 minutes, and at
 * S164 that crossed Supabase's limit: **six test FILES failed with "Request rate
 * limit reached"** — `s118`, `s130`, `s140`, `s151` outright, plus collateral
 * inside two others. Every one of them passed in isolation. That is the worst
 * failure shape available: it reads as four broken features.
 *
 * So the tokens are cached on disk, keyed by a hash of the email, and restored
 * with `setSession()` — which is local when the JWT has not expired. Vitest runs
 * each file in its own worker process, so an in-process cache alone would not
 * help; the disk is what lets file #40 reuse file #1's token.
 *
 * ⚠️ THIS IS NOT A RETRY, AND MUST NOT BECOME ONE. A retry would paper over the
 * ceiling and make the suite slower and non-deterministic. This removes the
 * requests instead. If the limit is ever hit again despite this, the honest
 * answer is that the ceiling is binding — say so rather than adding a backoff.
 *
 * ⚠️ THE CACHE IS NOT A FIXTURE. It holds nothing but short-lived JWTs for
 * disposable rebuild-test identities, it lives in the OS temp dir, and deleting
 * it costs one password grant. Never move it into the repo.
 *
 * Correctness properties, because a cached credential that is silently wrong is
 * worse than a slow one:
 *   - A token is used only with >5 minutes of life left, so nothing expires
 *     mid-file.
 *   - `setSession()` failing for ANY reason falls straight through to the
 *     password grant. There is no path where a bad cache entry becomes a
 *     skipped assertion.
 *   - Entries are written atomically (temp file + rename) and one file per
 *     email, so parallel vitest workers cannot interleave a half-written entry.
 */
const CACHE_DIR = join(tmpdir(), 'framefocus-live-sessions');
/** Refuse a token with less than this left, so it cannot expire mid-file. */
const MIN_TTL_MS = 5 * 60 * 1000;

interface CachedSession {
  access_token: string;
  refresh_token: string;
  expires_at: number; // seconds since epoch, as Supabase reports it
}

const cachePath = (email: string) =>
  join(CACHE_DIR, `${createHash('sha1').update(email).digest('hex')}.json`);

/** Same-process memo, so repeated calls in one file do not re-read the disk. */
const inProcess = new Map<string, SupabaseClient>();

function readCache(email: string): CachedSession | null {
  try {
    const p = cachePath(email);
    if (!existsSync(p)) return null;
    const c = JSON.parse(readFileSync(p, 'utf8')) as CachedSession;
    if (!c.access_token || !c.refresh_token || !c.expires_at) return null;
    if (c.expires_at * 1000 - Date.now() < MIN_TTL_MS) return null;
    return c;
  } catch {
    return null; // an unreadable cache is a cache miss, never an error
  }
}

function writeCache(email: string, c: CachedSession): void {
  try {
    mkdirSync(CACHE_DIR, { recursive: true });
    const p = cachePath(email);
    const tmp = `${p}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(c), { mode: 0o600 });
    renameSync(tmp, p); // atomic — a parallel worker never sees a partial file
  } catch {
    /* caching is an optimisation; failing to cache must never fail a test */
  }
}

function dropCache(email: string): void {
  try {
    const p = cachePath(email);
    if (existsSync(p)) unlinkSync(p);
  } catch {
    /* ignore */
  }
}

export async function sessionFor(email: string): Promise<SupabaseClient> {
  const memo = inProcess.get(email);
  if (memo) return memo;

  const client = createSupabaseClient(URL_, ANON, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 1. A cached JWT with real life left in it — no auth request at all.
  const cached = readCache(email);
  if (cached) {
    const { error } = await client.auth.setSession({
      access_token: cached.access_token,
      refresh_token: cached.refresh_token,
    });
    if (!error) {
      inProcess.set(email, client);
      return client;
    }
    dropCache(email); // stale or rejected — fall through and mint a new one
  }

  // 2. The password grant, exactly as before.
  const { data: pwData, error: pwErr } = await client.auth.signInWithPassword({
    email,
    password: TEST_PASSWORD,
  });
  if (!pwErr) {
    if (pwData.session?.access_token && pwData.session.refresh_token && pwData.session.expires_at) {
      writeCache(email, {
        access_token: pwData.session.access_token,
        refresh_token: pwData.session.refresh_token,
        expires_at: pwData.session.expires_at,
      });
    }
    inProcess.set(email, client);
    return client;
  }

  // Fallback: identities that predate the seeded password (Josh's originals).
  const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (error) {
    throw new Error(`sessionFor(${email}): password failed (${pwErr.message}); link failed (${error.message})`);
  }
  const { error: vErr } = await client.auth.verifyOtp({
    token_hash: data.properties!.hashed_token,
    type: 'email',
  });
  if (vErr) {
    throw new Error(`sessionFor(${email}): password failed (${pwErr.message}); verifyOtp failed (${vErr.message})`);
  }
  const { data: sess } = await client.auth.getSession();
  if (sess.session?.access_token && sess.session.refresh_token && sess.session.expires_at) {
    writeCache(email, {
      access_token: sess.session.access_token,
      refresh_token: sess.session.refresh_token,
      expires_at: sess.session.expires_at,
    });
  }
  inProcess.set(email, client);
  return client;
}

// ============================================================================
// DISPOSING OF A TEST CHANGE ORDER, AFTER S168 MADE SIGNED ONES PERMANENT
// ============================================================================
//
// ⚠️ READ THIS BEFORE WRITING ANOTHER `admin.from('change_orders').delete()`.
//
// `20261023000000` shipped `enforce_change_order_delete_boundary()`, which
// refuses to delete any change order where `signed_at IS NOT NULL OR status =
// 'signed'` — for EVERY caller, service role included, deliberately: *"being
// able to prove you never sent one is a claim the system must not be able to
// make falsely"* [Josh, S168].
//
// Harnesses seed signed change orders all the time, and every one of them was
// deleting them in teardown. Overnight on 2026-08-21 that stopped working and
// **six s97ct suites became unrunnable twice in a row**: the CO delete failed,
// the `projects` FK then refused the project, the whole fixture set leaked, and
// the next run collided on a fixed `co_number`. Seven projects and fourteen
// change orders accumulated in eight minutes. Every teardown involved only
// LOGGED the error, so none of it surfaced until an unrelated suite went red.
//
// ----------------------------------------------------------------------------
// THE THREE DISPOSALS, AND WHY THE MIDDLE ONE IS NOT A LOOPHOLE
// ----------------------------------------------------------------------------
//
//  1. `signed_at IS NULL` and status is not 'signed' — a plain hard delete.
//     Line items and rows follow by CASCADE (`20261023000000` §4).
//
//  2. status = 'signed' but `signed_at IS NULL` — **flip to draft, then
//     delete.** This is the shape harnesses actually seed: `status: 'signed'`
//     written straight in, with no stamp, because what they need is a CO that
//     COUNTS (`CONTRACT_CONTRIBUTING_CO_FILTER`), not a signature.
//     `enforce_change_order_immutability()` permits signed -> draft — only
//     `voided` is frozen as to status — so this asks the database for nothing
//     it does not already allow. **It is not an escape hatch**: a row with no
//     `signed_at` is a row nobody signed, and the S164 migration header calls
//     that state incoherent in exactly those terms.
//
//  3. `signed_at IS NOT NULL` — **SOFT delete, and say so.** This one really is
//     signed and really is permanent. `is_deleted = true` takes it out of every
//     listing and out of the revised-contract derivation
//     (`CONTRACT_CONTRIBUTING_CO_FILTER` includes `is_deleted: false`), which is
//     the most a caller is entitled to. The row stays. That is the ruling
//     working, not the teardown failing, and the count is returned so a harness
//     can print it rather than pretend.
//
// ⚠️ AND IT VERIFIES. The disposal re-reads every id afterwards and throws on
// any that is still LIVE. A teardown that cannot fail its own run is not a
// teardown — which is precisely how 120 rows accumulated behind a harness whose
// timestamped `co_number`s meant it could never collide with itself and so
// could never tell anyone it was leaking.

export interface CoDisposal {
  /** Hard-deleted outright. */
  deleted: number;
  /** status='signed' with no stamp: flipped to draft, then hard-deleted. */
  unflagged: number;
  /** Genuinely signed. Soft-deleted; the row is permanent. */
  retained: string[];
}

export async function disposeChangeOrders(ids: string[]): Promise<CoDisposal> {
  const out: CoDisposal = { deleted: 0, unflagged: 0, retained: [] };
  if (!ids.length) return out;

  const { data: rows, error: readError } = await admin
    .from('change_orders')
    .select('id, co_number, status, signed_at')
    .in('id', ids);
  if (readError) throw new Error(`disposeChangeOrders: read failed — ${readError.message}`);

  // ⚠️ DRAINED IN PASSES, NOT IN ONE SWEEP. A reissue carries
  // `supersedes_change_order_id` pointing at the voided CO it replaced
  // (`change_orders_supersedes_fkey`, NO ACTION), so the replacement must go
  // FIRST or the original refuses to delete. Found by this helper on its very
  // first run against the S168 residue, which is the argument for it throwing.
  // A pass that removes nothing means a genuine cycle or a foreign reference,
  // and that is an error rather than something to loop on.
  let pending = (rows ?? []) as {
    id: string;
    co_number: string;
    status: string;
    signed_at: string | null;
  }[];

  while (pending.length) {
    const deferred: typeof pending = [];
    for (const r of pending) {
    if (r.signed_at !== null) {
      const { error } = await admin
        .from('change_orders')
        .update({ is_deleted: true, deleted_at: new Date().toISOString() })
        .eq('id', r.id)
        .select('id');
      if (error) {
        throw new Error(
          `disposeChangeOrders: ${r.co_number} is signed AND could not even be soft-deleted — ${error.message}`
        );
      }
      out.retained.push(r.co_number);
      continue;
    }

    if (r.status === 'signed') {
      const { error } = await admin
        .from('change_orders')
        .update({ status: 'draft' })
        .eq('id', r.id)
        .select('id');
      if (error) {
        throw new Error(
          `disposeChangeOrders: ${r.co_number} could not be unflagged to draft — ${error.message}`
        );
      }
      out.unflagged += 1;
    }

    const { error } = await admin.from('change_orders').delete().eq('id', r.id);
    if (error) {
      // A row still superseded by something later in this batch — retry it on
      // the next pass rather than failing the teardown on an ordering accident.
      if (error.message.includes('change_orders_supersedes_fkey')) {
        deferred.push(r);
        continue;
      }
      throw new Error(`disposeChangeOrders: ${r.co_number} would not delete — ${error.message}`);
    }
    out.deleted += 1;
    }

    if (deferred.length === pending.length) {
      throw new Error(
        `disposeChangeOrders: no progress — ${deferred.length} change order(s) are superseded by ` +
          `something outside this batch: ${JSON.stringify(deferred.map((d) => d.co_number))}`
      );
    }
    pending = deferred;
  }

  // ⚠️ ONE ROW AT A TIME ABOVE, NOT `.in(ids)`. A batch delete is a SINGLE
  // statement: one row the boundary refuses aborts the whole thing and takes
  // every deletable sibling with it. That is exactly how the S168 harness
  // leaked 120 rows while appearing to clean up after itself.

  const { data: survivors } = await admin
    .from('change_orders')
    .select('id, co_number, status, signed_at')
    .in('id', ids)
    .eq('is_deleted', false);
  if (survivors?.length) {
    throw new Error(
      `disposeChangeOrders: ${survivors.length} change order(s) still LIVE after teardown — ` +
        JSON.stringify(survivors)
    );
  }

  return out;
}

/**
 * Everything a harness left behind on a PREVIOUS run, by `co_number` prefix.
 *
 * ⚠️ A HARNESS THAT ONLY CLEANS UP AFTER ITSELF CANNOT START FROM A DIRTY
 * DATABASE, and a dirty database is the normal case: `afterAll` does not run
 * when a run is interrupted, and the residue then bricks every later run that
 * uses a fixed `co_number`. Call this in `beforeAll` so a suite is runnable
 * twice in a row from any starting state — which is the property that was
 * actually missing, and the one a single green run does not demonstrate.
 */
export async function sweepChangeOrders(coNumberPrefix: string): Promise<CoDisposal> {
  const { data, error } = await admin
    .from('change_orders')
    .select('id')
    .like('co_number', `${coNumberPrefix}%`)
    .eq('is_deleted', false);
  if (error) throw new Error(`sweepChangeOrders(${coNumberPrefix}): ${error.message}`);
  return disposeChangeOrders(((data ?? []) as { id: string }[]).map((r) => r.id));
}

/**
 * `disposeChangeOrders`, shaped for the `check(label, error)` idiom every
 * s97ct teardown already uses, so a call site stays one line and the failure
 * still reaches the errors array that now throws at the end of the teardown.
 */
export async function disposeChangeOrdersError(
  ids: string[]
): Promise<{ message: string } | null> {
  try {
    await disposeChangeOrders(ids);
    return null;
  } catch (e) {
    return { message: (e as Error).message };
  }
}

/** Every change order on a project, disposed of. The FK that blocks a project
 *  delete is `change_orders.project_id`, so this runs before the project goes. */
export async function disposeProjectChangeOrdersError(
  projectId: string
): Promise<{ message: string } | null> {
  const { data, error } = await admin
    .from('change_orders')
    .select('id')
    .eq('project_id', projectId);
  if (error) return { message: `read change orders: ${error.message}` };
  return disposeChangeOrdersError(((data ?? []) as { id: string }[]).map((r) => r.id));
}
