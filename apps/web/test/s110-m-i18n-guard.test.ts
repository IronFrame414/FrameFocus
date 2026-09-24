import { describe, it, expect } from 'vitest';
import { mReachableFiles, scanFile, scanSource } from './support/m-i18n-scan';
import { PENDING } from './support/m-i18n-pending';

// ============================================================================
// S110 H, FILL-H.7 — THE GUARD AGAINST ROT. [RULED Josh: /m system text is
// translated; every new /m screen would add English strings unless something
// stops it.] Runs in CI's unit suite.
//
// Every file /m can render (app/m and every component it transitively mounts)
// is scanned for a hard-coded user-facing string (test/support/m-i18n-scan.ts).
// A file holds AT MOST its PENDING count (0 when unlisted) — so a new
// hard-coded string anywhere in /m fails here, naming the text and the line.
// ============================================================================

const FILES = mReachableFiles();

describe('S110 H — the /m anti-rot guard', () => {
  it('the walk reached the real /m tree (a guard that scans nothing passes vacuously)', () => {
    expect(FILES.length).toBeGreaterThan(100);
    expect(FILES).toContain('app/m/mobile-shell.tsx');
    expect(FILES).toContain('components/chat/chat-thread.tsx');
  });

  it('CONTROL — the scanner fires on a hard-coded string and not on t()', () => {
    expect(scanSource('x.tsx', 'export const A = () => <p>Hello there</p>;')).toHaveLength(1);
    expect(
      scanSource('x.tsx', 'export const A = () => <input placeholder="Your name" />;')
    ).toHaveLength(1);
    expect(scanSource('x.tsx', "const L = [{ href: '/m/x', label: 'Logs' }];")).toHaveLength(1);
    expect(scanSource('x.tsx', "export const A = () => <p>{t('shell.signOut')}</p>;")).toHaveLength(
      0
    );
  });

  it.each(FILES.map((f) => [f]))('%s holds no NEW hard-coded user-facing string', (file) => {
    const found = scanFile(file);
    const cap = PENDING[file] ?? 0;
    expect(
      found.length,
      `${file}: ${found.length} hard-coded strings, allowed ${cap}. Wrap them in t('…') (lib/i18n/messages.ts). ` +
        `Found: ${found.map((f) => `L${f.line} "${f.text}"`).join(' · ')}`
    ).toBeLessThanOrEqual(cap);
  });

  it('the PENDING list names only files /m still reaches, and only files that still need it', () => {
    const stale = Object.keys(PENDING).filter((f) => !FILES.includes(f));
    expect(stale, 'PENDING names files /m no longer reaches — remove them').toEqual([]);
    const overcapped = Object.entries(PENDING)
      .filter(([f, n]) => scanFile(f).length < n)
      .map(([f, n]) => `${f}: allowed ${n}, holds ${scanFile(f).length} — lower it (the ratchet)`);
    expect(overcapped).toEqual([]);
  });
});
