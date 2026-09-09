/**
 * ============================================================================
 * THE PRODUCTION GUARD for the live harnesses (`test/*.live.ts`).
 * ============================================================================
 *
 * ⚠️ READ THIS BEFORE WEAKENING ANYTHING BELOW. Every clause is here because
 * the thing it prevents was found live, not imagined.
 *
 * There are two Supabase projects. `nmyphyhmfttxkdoposvf` is rebuild-test, the
 * disposable dev database these harnesses create, mutate and delete rows in.
 * `jwkcknyuyvcwcdeskrmz` is PRODUCTION — Josh's real books. The live harnesses
 * run with a SERVICE-ROLE key, which bypasses RLS entirely. Pointed at the
 * wrong project they would not fail; they would succeed, and write.
 *
 * ----------------------------------------------------------------------------
 * WHAT THE OLD GUARD MISSED
 * ----------------------------------------------------------------------------
 * `assertRebuildTest()` checked `NEXT_PUBLIC_SUPABASE_URL` for the rebuild-test
 * ref and stopped there. Three holes, all of them load-bearing:
 *
 *  1. **It never looked at the KEY.** A production service-role key paired with
 *     a rebuild-test URL passed the guard. That pairing is not hypothetical: a
 *     production `sb_secret_…` key was found in an ACCOUNT-LEVEL GitHub
 *     Codespaces secret granted to this repo (`SUPABASE_SECRET_KEY`), and
 *     account-level secrets override `.env.local` at the shell level and
 *     reappear on every rebuild. It has since been revoked and deleted.
 *  2. **It ran in `beforeAll`, after `createClient()` at module load.** The
 *     client was constructed before the guard could fire.
 *  3. **117 of 123 harnesses called it. Six did not**, and five of those six
 *     build their own client straight from `process.env`, so no amount of
 *     guarding inside `live-session.ts` would ever have reached them.
 *
 * Hole 3 is why this module is wired into `live.vitest.config.ts`'s
 * `setupFiles` as well as into `live-session.ts`. A setup file runs in every
 * worker BEFORE the test module is imported, so it covers all 123 files
 * regardless of what they import. `live-session.ts` calls it too, at module
 * load, so anything importing that helper outside vitest is still covered.
 *
 * ----------------------------------------------------------------------------
 * WHY THE KEY CHECK NEEDS A NETWORK READ, AND WHEN IT DOES NOT
 * ----------------------------------------------------------------------------
 * A legacy `service_role` key is a JWT and carries its project in a `ref`
 * claim — that is decodable offline, and when it decodes this module never
 * touches the network. A modern `sb_secret_…` / `sb_publishable_…` key is an
 * OPAQUE random string and encodes nothing. For those the only way to learn the
 * project is to ask a project whether the key is its own, so the guard makes
 * one authenticated read against rebuild-test and requires a 2xx.
 *
 * ⚠️ IT FAILS CLOSED. A network blip reds the whole live suite rather than
 * letting an unverified key through. That is the intended trade: a re-run costs
 * a minute, and the other direction costs Josh's books.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** The only project the live harnesses may ever touch. */
export const REQUIRED_PROJECT_REF = 'nmyphyhmfttxkdoposvf';

/**
 * Refs this repo knows by name, so a failure can say WHICH project the key
 * actually reached instead of only that it was not rebuild-test.
 *
 * ⚠️ These are project REFS, not credentials. Both already appear in STATE.md
 * and throughout git history; a ref alone grants nothing.
 */
export const KNOWN_REFS: Record<string, string> = {
  [REQUIRED_PROJECT_REF]: 'framefocus-rebuild-test — the disposable dev database',
  jwkcknyuyvcwcdeskrmz: "framefocus PRODUCTION — Josh's real books",
};

export function describeRef(ref: string): string {
  return KNOWN_REFS[ref] ? `${ref} (${KNOWN_REFS[ref]})` : `${ref} (a project this repo has no name for)`;
}

/** `https://<ref>.supabase.co` → `<ref>`. Null when the URL is not a Supabase host. */
export function refFromUrl(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const host = new URL(url).hostname;
    const [first, ...rest] = host.split('.');
    if (!first || !rest.join('.').startsWith('supabase.')) return null;
    return first;
  } catch {
    return null;
  }
}

/**
 * The project ref a LEGACY (JWT) Supabase key carries in its `ref` claim.
 *
 * Returns null for a modern `sb_secret_…` / `sb_publishable_…` key, which is
 * opaque by design and encodes nothing — null here means "undecidable offline",
 * NOT "fine". Callers must treat null as "must be proven over the network".
 */
export function refFromKey(key: string | undefined): string | null {
  if (!key || !key.startsWith('eyJ')) return null;
  const parts = key.split('.');
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as {
      ref?: unknown;
    };
    return typeof payload.ref === 'string' && payload.ref ? payload.ref : null;
  } catch {
    return null;
  }
}

export interface GuardEnv {
  url?: string;
  anon?: string;
  service?: string;
}

export interface ProbeOutcome {
  /** HTTP status, or 0 when the request never completed. */
  status: number;
  /** Set only when the request itself failed (DNS, TLS, offline). */
  transportError?: string;
}

/** Injectable so every branch below can be proven offline. */
export type Probe = (ref: string, key: string) => Promise<ProbeOutcome>;

/**
 * One authenticated read against a project's PostgREST root. A 2xx means the
 * key belongs to that project; 401 means it does not.
 *
 * `/rest/v1/` returns the OpenAPI description and mutates nothing, which is
 * what makes it safe to point at a project we are trying to rule OUT.
 */
export const httpProbe: Probe = async (ref, key) => {
  try {
    const res = await fetch(`https://${ref}.supabase.co/rest/v1/`, {
      method: 'GET',
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(20_000),
    });
    return { status: res.status };
  } catch (e) {
    return { status: 0, transportError: (e as Error).message };
  }
};

export interface Verified {
  ref: string;
  /** How the project was established — quoted in the one-line pass log. */
  how: string;
}

const BANNER =
  'REFUSING TO RUN THE LIVE HARNESSES.\n' +
  'These run with a service-role key, which bypasses RLS. Pointed at the wrong\n' +
  'project they do not fail — they write.\n';

const REQUIRED_LINE = `  required project: ${describeRef(REQUIRED_PROJECT_REF)}\n`;

function fail(reason: string, detail: string): never {
  throw new Error(`${BANNER}\n${reason}\n${REQUIRED_LINE}${detail}`);
}

/**
 * The whole guard. Throws on anything short of proof that BOTH the URL and the
 * service-role key belong to rebuild-test.
 *
 * ⚠️ Order matters and is cheapest-first, mirroring the bail-early convention
 * in `lib/services/ai-tagging.ts`: presence, then URL, then offline key decode,
 * then — only if the key is opaque — the network.
 */
export async function verifyLiveTarget(
  env: GuardEnv,
  probe: Probe = httpProbe
): Promise<Verified> {
  // 1. Presence. Named individually: "some env var is missing" sends the reader
  //    to the wrong place, and all three go missing together on a rebuild.
  const missing = (
    [
      ['NEXT_PUBLIC_SUPABASE_URL', env.url],
      ['NEXT_PUBLIC_SUPABASE_ANON_KEY', env.anon],
      ['SUPABASE_SERVICE_ROLE_KEY', env.service],
    ] as const
  )
    .filter(([, v]) => !v)
    .map(([n]) => n);

  if (missing.length) {
    fail(
      `Missing credentials: ${missing.join(', ')}.`,
      '\nThese harnesses hit a REAL database and never run in CI.\n' +
        'apps/web/.env.local is gitignored and does NOT survive a Codespace rebuild.\n' +
        'Restore it for REBUILD-TEST ONLY — see STATE.md → Environment Variables.\n'
    );
  }

  // 2. The URL. This is the check that already existed, kept and made explicit
  //    about what it found rather than echoing the whole URL back.
  const urlRef = refFromUrl(env.url);
  if (urlRef !== REQUIRED_PROJECT_REF) {
    fail(
      'NEXT_PUBLIC_SUPABASE_URL does not point at rebuild-test.',
      `  URL points at:    ${urlRef ? describeRef(urlRef) : `no Supabase project (${env.url})`}\n`
    );
  }

  // 3. Offline decode, for BOTH keys. A legacy JWT names its own project, so a
  //    mismatch is caught before a single packet leaves the box. The anon key
  //    is checked here — where it is free — but is not probed below: it cannot
  //    write, and a mismatched one merely fails to sign in.
  for (const [name, key] of [
    ['SUPABASE_SERVICE_ROLE_KEY', env.service],
    ['NEXT_PUBLIC_SUPABASE_ANON_KEY', env.anon],
  ] as const) {
    const keyRef = refFromKey(key);
    if (keyRef && keyRef !== REQUIRED_PROJECT_REF) {
      fail(
        `${name} BELONGS TO A DIFFERENT PROJECT than the URL claims.`,
        `  key belongs to:   ${describeRef(keyRef)}\n` +
          '  (decoded from the key\'s own `ref` claim — no network read needed)\n'
      );
    }
  }

  // 4. A legacy service key that decoded to rebuild-test is already proven.
  //
  // ⚠️ THE JWT SIGNATURE IS NOT VERIFIED, DELIBERATELY. We have no secret to
  // verify it with, and we do not need one. The threat this guard exists for is
  // an operator holding the WRONG REAL KEY — and a real production key names
  // production in its own `ref` claim, which is exactly what step 3 rejected.
  // A key with a FORGED claim is not a danger: it authenticates against nothing,
  // so it cannot write anywhere. Trusting the claim can only ever let through a
  // key that is useless, never one that is dangerous.
  if (refFromKey(env.service) === REQUIRED_PROJECT_REF) {
    return { ref: REQUIRED_PROJECT_REF, how: "decoded from the key's own `ref` claim" };
  }

  // 5. Opaque key (`sb_secret_…`). Nothing about it is knowable offline, so ask
  //    rebuild-test whether the key is its own.
  const mine = await probe(REQUIRED_PROJECT_REF, env.service!);
  if (mine.status >= 200 && mine.status < 300) {
    return { ref: REQUIRED_PROJECT_REF, how: 'proven by an authenticated read' };
  }

  if (mine.transportError) {
    fail(
      'Could not verify SUPABASE_SERVICE_ROLE_KEY — rebuild-test was unreachable.',
      `  transport error:  ${mine.transportError}\n` +
        '\nThe guard fails CLOSED: an unverified key is treated as a wrong key.\n' +
        'Re-run once the network is back.\n'
    );
  }

  // 6. Rejected. Now name the project the key ACTUALLY reaches, because
  //    "not rebuild-test" is the answer that leaves someone guessing — and the
  //    guess that matters is whether they are holding a production key.
  for (const other of Object.keys(KNOWN_REFS)) {
    if (other === REQUIRED_PROJECT_REF) continue;
    const hit = await probe(other, env.service!);
    if (hit.status >= 200 && hit.status < 300) {
      fail(
        `⛔ SUPABASE_SERVICE_ROLE_KEY IS A KEY FOR ${describeRef(other).toUpperCase()}.`,
        `  key reached:      ${describeRef(other)}\n` +
          `  rebuild-test said: HTTP ${mine.status} (Invalid API key)\n` +
          '\nThis is the exact pairing the guard exists for: a rebuild-test URL\n' +
          'with another project\'s service-role key. Do NOT "fix" this by changing\n' +
          'the URL to match the key. Replace the KEY with rebuild-test\'s.\n'
      );
    }
  }

  fail(
    'SUPABASE_SERVICE_ROLE_KEY was REJECTED by rebuild-test.',
    `  rebuild-test said: HTTP ${mine.status} (Invalid API key)\n` +
      '  key reached:      none of the projects this repo knows by name.\n' +
      '                    It is opaque (`sb_secret_…`), so it cannot be decoded;\n' +
      '                    it is either revoked or issued for a third project.\n' +
      '\nCheck the Supabase dashboard for rebuild-test → Project API keys.\n'
  );
}

/**
 * ============================================================================
 * PASS CACHE — one verification per (url, key) pair, not one per test file
 * ============================================================================
 * Vitest gives each of the 123 live files its own worker process, so an
 * in-process memo alone would mean 123 network probes per suite run. The token
 * cache in `live-session.ts` exists for exactly this reason (S164: ~168 auth
 * requests crossed Supabase's rate limit and reddened six files), and this
 * mirrors it deliberately.
 *
 * ⚠️ ONLY SUCCESSES ARE CACHED, and the cache key is a hash of the URL AND the
 * key. So a cache hit can only ever say "this exact pair verified recently" —
 * changing either value is a miss, and a failure always re-probes and re-names
 * the project rather than serving a stale verdict.
 */
const CACHE_DIR = join(tmpdir(), 'framefocus-live-guard');
const CACHE_TTL_MS = 30 * 60 * 1000;

const fingerprint = (env: GuardEnv) =>
  createHash('sha256').update(`${env.url}|${env.service}`).digest('hex');

function readPass(env: GuardEnv): Verified | null {
  try {
    const p = join(CACHE_DIR, `${fingerprint(env)}.json`);
    if (!existsSync(p)) return null;
    const c = JSON.parse(readFileSync(p, 'utf8')) as Verified & { at: number };
    if (c.ref !== REQUIRED_PROJECT_REF) return null;
    if (Date.now() - c.at > CACHE_TTL_MS) return null;
    return { ref: c.ref, how: `${c.how} (cached)` };
  } catch {
    return null; // an unreadable cache is a cache miss, never a pass
  }
}

function writePass(env: GuardEnv, v: Verified): void {
  try {
    mkdirSync(CACHE_DIR, { recursive: true });
    const p = join(CACHE_DIR, `${fingerprint(env)}.json`);
    const tmp = `${p}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify({ ...v, at: Date.now() }), { mode: 0o600 });
    renameSync(tmp, p); // atomic — parallel workers never see a partial file
  } catch {
    /* caching is an optimisation; failing to cache must never pass a bad key */
  }
}

let inProcess: Promise<Verified> | null = null;

/**
 * The entry point every caller uses. Memoised per process and cached on disk,
 * so the cost of the guard across a full live run is ONE network round-trip.
 *
 * ⚠️ Call this BEFORE constructing any Supabase client. It throws; it never
 * warns.
 */
export function guardLiveTarget(
  env: GuardEnv = {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    anon: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    service: process.env.SUPABASE_SERVICE_ROLE_KEY,
  },
  probe: Probe = httpProbe
): Promise<Verified> {
  if (inProcess) return inProcess;
  inProcess = (async () => {
    const cached = readPass(env);
    if (cached) return cached;
    const v = await verifyLiveTarget(env, probe);
    writePass(env, v);
    return v;
  })().catch((e) => {
    inProcess = null; // a failure must re-verify, never stick as a memoised pass
    throw e;
  });
  return inProcess;
}
