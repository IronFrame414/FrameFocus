import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';

// ============================================================================
// S110 H — RULING 5, ENFORCED: EVERYTHING CLIENT-FACING IS ENGLISH.
// [RULED Josh: "Proposals, contracts, lien releases, invoices, the client
// portal and every outbound client email render in English and are never
// translated, and never localise to a viewer's setting. This is a hard
// boundary, not a default." — and AUDIT 8: "a test proves no client-facing
// document, email or portal page can render a translation, and it fails when
// that is made possible."]
//
// From every client-facing ROOT, the whole import closure (`@/…` and relative
// imports, followed transitively) must never reach:
//   · the user-text translation (lib/translation/*, components/i18n/user-text);
//   · the reader's language (lib/i18n/server — getMyLanguage / getMobileT);
// and no file in it may MOUNT a LanguageProvider (the only thing that could make
// system text follow a viewer's setting — outside a provider useT() is English).
// ============================================================================

const WEB = fileURLToPath(new URL('..', import.meta.url));

const ROOT_DIRS = [
  'app/portal', // the client portal
  'app/sign', // proposal signing (client)
  'app/sign-co', // change-order signing (client)
  'app/bid', // sub bid reply (external)
  'lib/email/templates', // every email template
  'app/api/proposals', // proposal send / resend (client email + PDF)
  'app/api/change-orders', // CO send / reissue (client email + PDF)
  'app/api/invoices', // invoice send (client email + PDF)
  'app/api/sign', // signing endpoints
  'app/api/sign-co',
  'app/api/portal',
  'app/api/cron/co-reminders', // client reminder emails
  'app/api/cron/invoice-reminders',
  'app/api/cron/estimate-reminders',
];
const ROOT_FILES = [
  'lib/proposal/proposal-template.tsx', // the proposal PDF
  'lib/services/proposal-service.ts',
  'lib/change-orders/co-template.tsx', // the CO PDF
  'lib/services/co-pdf-service.ts',
  'lib/invoices/invoice-template.tsx', // the invoice PDF
  'lib/services/invoice-pdf-service.ts',
  'lib/services/lien-release-pdf-service.ts', // lien releases
  'lib/selections/spec-sheet-template.tsx', // client spec sheets
  'lib/services/selection-spec-pdf-service.ts',
  'lib/po/po-template.tsx', // vendor-facing PO
  'lib/services/portal.ts',
  'lib/services/portal-writes.ts',
  'lib/services/signing-service.ts', // contract / proposal signing
  'lib/services/co-signing-service.ts',
  'lib/services/contracts.ts', // contract documents
  'lib/services/contracts-client.ts',
  'lib/services/invoice-delivery.ts',
  'lib/services/selection-email.ts',
  'lib/notify/crons/estimate-reminders.ts',
];

const FORBIDDEN: Array<[RegExp, string]> = [
  [/^lib\/translation\//, 'the user-text translation service'],
  [/^components\/i18n\/user-text\.tsx$/, 'UserText (translates for the reader)'],
  [/^lib\/i18n\/server\.ts$/, "the viewer's language (getMyLanguage / getMobileT)"],
];

function walk(d: string, out: string[] = []): string[] {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx?)$/.test(f) && !/\.(test|spec)\.tsx?$/.test(f)) out.push(p);
  }
  return out;
}

function resolveImport(from: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith('@/')) base = join(WEB, spec.slice(2));
  else if (spec.startsWith('.')) base = resolvePath(dirname(from), spec);
  else return null;
  for (const ext of ['', '.tsx', '.ts', '/index.tsx', '/index.ts']) {
    const p = base + ext;
    if (existsSync(p) && statSync(p).isFile()) return p;
  }
  return null;
}

const IMPORT_RE = /(?:import|export)\s+(?:type\s+)?(?:[^'"]*?\sfrom\s+)?['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;

/** file (rel) → the chain of files that reached it, for the failure message. */
export function closure(roots: string[]): Map<string, string[]> {
  const seen = new Map<string, string[]>();
  const queue: Array<[string, string[]]> = roots.map((r) => [r, [rel(r)]]);
  while (queue.length) {
    const [f, chain] = queue.shift()!;
    const r = rel(f);
    if (seen.has(r)) continue;
    seen.set(r, chain);
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(IMPORT_RE)) {
      if (/^\s*import\s+type\s/.test(m[0])) continue; // types carry no behaviour
      const target = resolveImport(f, m[1] ?? m[2]);
      if (target) queue.push([target, [...chain, rel(target)]]);
    }
  }
  return seen;
}
const rel = (p: string) => relative(WEB, p).split('\\').join('/');

describe('S110 H — ruling 5: nothing client-facing can render a translation', () => {
  it('every client-facing root EXISTS (a renamed renderer must be re-pinned here, not silently dropped)', () => {
    const missing = [...ROOT_DIRS, ...ROOT_FILES].filter((p) => !existsSync(join(WEB, p)));
    expect(missing).toEqual([]);
  });

  const roots = [...ROOT_DIRS.flatMap((d) => walk(join(WEB, d))), ...ROOT_FILES.map((f) => join(WEB, f))];
  const reached = closure(roots);

  it('the walk read the real renderers (not zero files)', () => {
    expect(roots.length).toBeGreaterThan(40);
    expect(reached.has('lib/proposal/proposal-template.tsx')).toBe(true);
    expect(reached.has('app/portal/layout.tsx')).toBe(true);
  });

  it.each(FORBIDDEN.map(([re, what]) => [what, re] as const))('no client-facing code reaches %s', (_what, re) => {
    const hits = [...reached.entries()].filter(([f]) => re.test(f)).map(([, chain]) => chain.join(' → '));
    expect(hits, 'a client-facing renderer can now reach translation — ruling 5').toEqual([]);
  });

  it('no client-facing file MOUNTS a LanguageProvider (system text stays English outside one)', () => {
    const mounts = [...reached.keys()].filter((f) => /<LanguageProvider[\s>]/.test(readFileSync(join(WEB, f), 'utf8')));
    expect(mounts).toEqual([]);
  });

  it('CONTROL — the walk DOES see a forbidden import when one exists (it can fail)', () => {
    // /dashboard mounts UserText-capable screens and the provider; its layout's
    // closure must include the provider — proving the walker follows imports.
    const dash = closure([join(WEB, 'app/dashboard/layout.tsx')]);
    expect(dash.has('components/i18n/language-provider.tsx')).toBe(true);
  });
});
