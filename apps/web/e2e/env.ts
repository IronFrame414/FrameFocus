import { readFileSync } from 'node:fs';
import path from 'node:path';

// ---------------------------------------------------------------------------
// WHERE A TEST SECRET COMES FROM, AND IN WHICH ORDER.
// ---------------------------------------------------------------------------
// process.env FIRST, apps/web/.env.local SECOND. The other way round is what
// made CI red on `main` from the moment the mobile tree landed (#186, #187):
// hub-fixture.ts read the file with readFileSync and threw when it was absent,
// so every spec that builds a service-role client died in `beforeAll` before a
// single assertion ran. `.env.local` is gitignored — it has never existed on a
// runner and never will — while the runner is the ONE environment that already
// has the values, wired into the job's `env:` block. The fixture simply never
// looked at them.
//
// File-second still matters: in a Codespace `.env.local` is the only place the
// service-role key lives, and nothing exports it into the shell.
//
// EMPTY STRING COUNTS AS ABSENT. A GitHub `env:` entry referencing a secret
// that does not exist substitutes '' rather than failing — a misnamed secret
// would otherwise sail past a `!= undefined` check and fail later as an opaque
// "Invalid API key" from PostgREST.
// ---------------------------------------------------------------------------

const ENV_PATH = path.join(__dirname, '..', '.env.local');

let fileCache: { vars: Record<string, string>; present: boolean } | null = null;

function fromFile(): { vars: Record<string, string>; present: boolean } {
  if (fileCache) return fileCache;

  let raw: string;
  try {
    raw = readFileSync(ENV_PATH, 'utf8');
  } catch {
    // NOT an error here. Absent is the normal, expected state on a runner; only
    // requireTestEnv() below decides whether the absence actually cost us a
    // value, because only it knows which key was being asked for.
    return (fileCache = { vars: {}, present: false });
  }

  const vars: Record<string, string> = {};
  for (const line of raw.split('\n')) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (m) vars[m[1]] = m[2].trim().replace(/^(['"])(.*)\1$/, '$2');
  }
  return (fileCache = { vars, present: true });
}

/** The value, or undefined. Blank counts as undefined — see the note above. */
export function testEnv(name: string): string | undefined {
  const fromProcess = process.env[name];
  if (fromProcess) return fromProcess;
  return fromFile().vars[name] || undefined;
}

/**
 * The value, or an error that names BOTH environments.
 *
 * The message this replaced said only "recreate it from the Vercel env vars
 * before running the e2e suite" — Codespace instructions, delivered to whoever
 * opens a CI log, where there is no file to recreate and no Vercel dashboard to
 * do it from. An error that names the wrong environment sends the reader to fix
 * something that is not broken.
 */
export function requireTestEnv(name: string): string {
  const value = testEnv(name);
  if (value) return value;

  const { present } = fromFile();
  throw new Error(
    `${name} is not set. Checked process.env, then apps/web/.env.local ` +
      `(${present ? 'present, but has no usable value for this key' : 'not found'}).\n` +
      '\n' +
      '  CI / GitHub Actions: this comes from a repository secret listed in the\n' +
      "    job's `env:` block in .github/workflows/ci.yml. A red job here means\n" +
      '    the secret is missing or misnamed — Settings → Secrets and variables\n' +
      '    → Actions. There is no .env.local on a runner and there is not meant\n' +
      '    to be one.\n' +
      '\n' +
      '  Codespace / local: this comes from apps/web/.env.local, which is\n' +
      '    gitignored and does not survive a rebuild. Recreate it from the\n' +
      '    Vercel env vars (see STATE.md → Environment Variables).'
  );
}
