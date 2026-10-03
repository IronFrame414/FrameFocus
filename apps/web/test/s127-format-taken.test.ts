import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { formatTakenAt } from '@/lib/photos/format-taken';

// S127 item 4b (A-4) — ONE "taken" formatter for /m and desktop (PARITY).
describe('S127 4b — formatTakenAt', () => {
  it("formats in the reader's locale, en and es, and says — when there is no time", () => {
    const iso = '2026-08-25T21:06:00';
    expect(formatTakenAt(iso, 'en-US')).toBe(
      new Date(iso).toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    );
    expect(formatTakenAt(iso, 'en-US')).toMatch(/Aug 25, 2026/);
    expect(formatTakenAt(iso, 'es-US')).toMatch(/2026/);
    expect(formatTakenAt(null, 'en-US')).toBe('—');
  });

  it('both surfaces use it — no second formatter', () => {
    const read = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');
    const mobile = read('../app/m/p/[projectId]/photos/[fileId]/viewer.tsx');
    const desktop = read('../app/dashboard/projects/[id]/photos/[fileId]/page.tsx');
    expect(mobile).toContain('formatTakenAt(');
    expect(desktop).toContain('formatTakenAt(');
    expect(mobile).not.toMatch(/toLocaleString\(dateLocale/);
  });
});
