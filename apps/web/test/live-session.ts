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
