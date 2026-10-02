import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CLIENT_DISCLAIMER } from '@/lib/critical-path/client-disclaimer';

// S123 D-2 — THE CLIENT DISCLAIMER SAYS "THESE DATES" [Josh, RULED 2026-10-02].
//
// The client schedule shows dates and nothing else — no money, no quantities,
// no percentages — so the sentence names dates. A disclaimer naming figures on
// a page with no figures reads as boilerplate, and boilerplate gets skipped.
// ⚠️ SUPERSEDED: the S122 spec's "these dates and figures". ⚠️ Any client
// surface that DOES show money keeps its own "and figures" wording; the two are
// deliberate, not an inconsistency to tidy (and none exists today: S123 1.4d).
//
// And there is ONE copy of this sentence: the portal (list and Gantt) and the
// client's finish email all import it. A second copy is how two wordings drift.

const WEB = fileURLToPath(new URL('..', import.meta.url));
const HOME = 'lib/critical-path/client-disclaimer.ts';

function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) sources(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(relative(WEB, p));
  }
  return out;
}

describe('S123 D-2 — the client disclaimer', () => {
  it('is exactly the "these dates" sentence', () => {
    expect(CLIENT_DISCLAIMER).toBe(
      'The construction industry is fluid and dynamic; these dates are for planning purposes and cannot be guaranteed.'
    );
  });

  it('⚠️ names dates and NOT figures (the client schedule shows no money)', () => {
    expect(CLIENT_DISCLAIMER).toContain('these dates');
    expect(CLIENT_DISCLAIMER.toLowerCase()).not.toContain('figures');
  });

  it('lives in ONE file: no other app/lib/components source carries the sentence', () => {
    const files = ['app', 'lib', 'components'].flatMap((d) => sources(join(WEB, d)));
    const carriers = files.filter((f) => readFileSync(join(WEB, f), 'utf8').includes('fluid and dynamic'));
    // The walk must have found the real home, or it proved nothing.
    expect(files.length).toBeGreaterThan(100);
    expect(carriers).toEqual([HOME]);
  });
});
