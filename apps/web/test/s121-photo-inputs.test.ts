import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// S121 7-B — the four library-only photo inputs (S120's list, verified S121
// §7-B) now open the CAMERA first, and KEEP a secondary library control (the
// /m check-in pattern). A surface that lost either would silently change what
// a tap does on a phone.

const FILES = [
  'components/site-visits/site-visit-record.tsx',
  'components/material-signouts/signout-detail.tsx',
  'components/expenses/expense-capture-form.tsx',
  'components/field/incident-form.tsx',
];

function inputs(src: string): string[] {
  const out: string[] = [];
  const re = /<input\b[\s\S]*?\/>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) if (/accept="image\/\*"/.test(m[0])) out.push(m[0]);
  return out;
}

describe.each(FILES)('%s', (file) => {
  const src = readFileSync(fileURLToPath(new URL(`../${file}`, import.meta.url)), 'utf8');
  const imgs = inputs(src);
  it('has a CAMERA input (capture="environment")', () => {
    expect(imgs.some((t) => /capture="environment"/.test(t))).toBe(true);
  });
  it('keeps a LIBRARY input (no capture) beside it', () => {
    expect(imgs.some((t) => !/capture=/.test(t))).toBe(true);
  });
});
