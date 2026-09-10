import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { brand } from '@/lib/brand';

// ============================================================================
// S136 — THE REPO-WIDE BRAND-LITERAL SWEEP.
// ============================================================================
//
// Josh received an invitation whose subject read "Worth Properties invited you
// to join them on Frame…" — the pre-rebrand product name, months after the
// rebrand, in code written after it. Sweeping the rest of the session found the
// same paste five more times.
//
// ⚠️ THREE ASSERTIONS ALREADY EXISTED AND NONE OF THEM COULD HAVE CAUGHT IT.
// Recorded because "add a test" is the wrong lesson; the lesson is which gap:
//
//   1. M6M A-26b3 (`m6m-pwa.test.ts`) walks `app/m` plus `app/manifest.ts` and
//      NOTHING ELSE. `lib/`, `components/`, `app/api` and `packages/` are
//      outside it by construction.
//   2. `brand-email-footer.test.tsx` renders the transactional templates from a
//      HARDCODED LIST. `InviteEmail` was added in S135 and never added to the
//      list, so a new template is invisible to it by design. (Fixed in that
//      file, S136: it now walks the directory.)
//   3. NOTHING covered SUBJECT LINES. Subjects are built in services, not
//      templates — so even with InviteEmail in that list, this bug still ships.
//      That is the hole that actually fired.
//
// A-26b3 is a SPECCED M6M criterion with a stated scope, and is deliberately
// left exactly as written [Josh, S136 Q2] — silently widening a spec'd
// criterion would misrepresent what M6M asserts. This file is the wider net,
// and it is a separate assertion so the two cannot be confused.

const WEB_ROOT = join(__dirname, '..');
const REPO_ROOT = join(WEB_ROOT, '..', '..');

/** Roots swept. `packages/` is included: shared code ships to users too. */
const ROOTS = [
  join(WEB_ROOT, 'app'),
  join(WEB_ROOT, 'lib'),
  join(WEB_ROOT, 'components'),
  join(REPO_ROOT, 'packages'),
];

/**
 * The only files allowed to contain the product name as a literal.
 *
 * `lib/brand.ts` IS the source — the name has to exist somewhere. The three
 * brand test files assert against it, so they must name it to be able to fail.
 * Nothing else, ever: that is the whole point.
 */
const ALLOWED = ['lib/brand.ts'];

/**
 * ⚠️ REAL-WORLD IDENTIFIERS THAT LEGITIMATELY CONTAIN THE OLD NAME.
 *
 * Exact strings, stripped from a file's text BEFORE it is scanned — NOT a
 * per-file exemption. The difference is the whole point: `warming-email.ts`
 * stays under both assertions below, so a genuine stale literal pasted into it
 * tomorrow still fails. Only this one substring is excused, and only where it
 * appears verbatim.
 *
 * A per-file entry in ALLOWED would have been the easy fix and would have
 * created a blind spot in a file that sends real mail.
 *
 * `FrameFocus2026@gmail.com` [2026-09-10] is one of the four warming-sender
 * recipients — a Gmail account Josh registered under the old product name. It
 * is an address, not a brand reference. It cannot be built from `brand.name`
 * without becoming wrong: renaming the product does not rename his mailbox,
 * which is exactly the coupling this file exists to prevent.
 */
const ALLOWED_OCCURRENCES = ['FrameFocus2026@gmail.com'];

/** A file's text with the excused identifiers removed. */
function scannable(src: string): string {
  let out = src;
  for (const allowed of ALLOWED_OCCURRENCES) out = out.split(allowed).join('');
  return out;
}

const SKIP_DIRS = new Set(['node_modules', '.next', 'dist', 'build', '.turbo']);

function walk(dir: string, acc: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return acc; // a root that does not exist in this checkout
  }
  for (const name of entries) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, acc);
    else if (/\.(ts|tsx)$/.test(name)) acc.push(full);
  }
  return acc;
}

describe('S136 — no product name survives as a literal outside lib/brand.ts', () => {
  const files = walk(ROOTS[0]).concat(...ROOTS.slice(1).map((r) => walk(r)));

  it('the sweep actually swept — a broken walk must not pass silently', () => {
    // Without this, a bad path makes `files` empty and every assertion below
    // becomes vacuously true. The single most likely way to ship no test at all.
    expect(files.length).toBeGreaterThan(300);
    expect(files.some((f) => f.includes(join('lib', 'services')))).toBe(true);
    expect(files.some((f) => f.includes(join('lib', 'email', 'templates')))).toBe(true);
    expect(files.some((f) => f.includes(join('app', 'api')))).toBe(true);
  });

  it('⚠️ no file contains "FrameFocus", the pre-rebrand name', () => {
    const offenders: string[] = [];
    for (const full of files) {
      if (scannable(readFileSync(full, 'utf8')).includes('FrameFocus')) {
        offenders.push(relative(REPO_ROOT, full));
      }
    }
    // Named, not counted: a count tells you there is a problem, the list tells
    // you where. Comments count too — a name in a comment is one paste away.
    expect(offenders, `stale product name in:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('⚠️ no file hard-codes the CURRENT name either — it must be imported', () => {
    // A-26b2's lesson: a build that reads the source AND pastes a duplicate
    // passes a "no stale name" check while being one rename from breaking.
    const offenders: string[] = [];
    for (const full of files) {
      const rel = relative(WEB_ROOT, full).replace(/\\/g, '/');
      if (ALLOWED.includes(rel)) continue;
      const src = scannable(readFileSync(full, 'utf8'));
      if (src.includes(brand.name) || src.includes(brand.shortName)) {
        offenders.push(relative(REPO_ROOT, full));
      }
    }
    expect(offenders, `product name hard-coded in:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('⚠️ every ALLOWED_OCCURRENCES entry is still USED — the excuse list must not rot', () => {
    // An excused string nobody uses any more is a hole standing open for the
    // next paste. Same reasoning as COVERED's reverse check in
    // brand-email-footer.test.tsx.
    for (const allowed of ALLOWED_OCCURRENCES) {
      const used = files.some((f) => readFileSync(f, 'utf8').includes(allowed));
      expect(
        used,
        `ALLOWED_OCCURRENCES excuses "${allowed}" and nothing uses it — delete the entry`
      ).toBe(true);
    }
  });

  it('⚠️ and the excuse is NARROW — the file it excuses is still swept', () => {
    // The property that distinguishes this from a per-file exemption. If
    // warming-email.ts were simply ALLOWED, this would pass while the file went
    // unchecked.
    const warming = files.find((f) => f.endsWith(join('lib', 'services', 'warming-email.ts')));
    expect(warming, 'warming-email.ts is not being swept at all').toBeDefined();
    const stripped = scannable(readFileSync(warming!, 'utf8'));
    expect(stripped).not.toContain('FrameFocus');
    // ...and the raw file DOES contain it, so the strip is doing real work
    // rather than passing over a file that never had the string.
    expect(readFileSync(warming!, 'utf8')).toContain('FrameFocus');
  });
});
