import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { en, es } from '@/lib/i18n/areas/project';

// S112 R5b — RULED [Josh]: ship title + description + date to every staff role,
// "and the editor hint lands before the first real change order exists. The
// guardrail precedes the habit." Required: the hint on the TITLE as well as the
// description, on every surface a change order's text is written (PARITY).
//
// Static on purpose: the four forms are client components behind auth, and the
// thing that must not regress is "the field carries the hint", which the source
// states directly.

const read = (rel: string) =>
  readFileSync(fileURLToPath(new URL(`../${rel}`, import.meta.url)), 'utf8');
const KEY = "t('project.coEditor.noPriceHint')";
const count = (src: string, needle: string) => src.split(needle).length - 1;

// Every place a change order's title or description is typed, and how many
// hint renders each must carry. Desktop edit shows ONE hint under both fields.
const SITES: { file: string; hints: number; fields: string[] }[] = [
  {
    file: 'app/m/p/[projectId]/changes/new/co-create-form.tsx',
    hints: 2,
    fields: ['m-co-title', 'm-co-description'],
  },
  {
    file: 'app/m/p/[projectId]/changes/new/co-editor.tsx',
    hints: 2,
    fields: ['m-co-edit-title', 'm-co-edit-description'],
  },
  {
    file: 'app/dashboard/projects/[id]/changes/changes-panel.tsx',
    hints: 1,
    fields: ['co-create-title-hint'],
  },
  {
    file: 'app/dashboard/projects/[id]/changes/[coId]/co-builder.tsx',
    hints: 1,
    fields: ['co-edit-text-hint'],
  },
];

describe('S112 R5b — the no-price hint on change-order text', () => {
  it('the key exists in English and Spanish, and says prices stay out', () => {
    expect(en['project.coEditor.noPriceHint']).toMatch(/price/i);
    expect(es['project.coEditor.noPriceHint']).toMatch(/precio/i);
    expect(es['project.coEditor.noPriceHint']).not.toBe(en['project.coEditor.noPriceHint']);
  });

  for (const site of SITES) {
    it(`${site.file} renders the hint ${site.hints}× beside ${site.fields.join(', ')}`, () => {
      const src = read(site.file);
      expect(count(src, KEY), `${site.file} hint count`).toBe(site.hints);
      for (const f of site.fields) expect(src).toContain(f);
    });
  }

  it('both desktop fields in the edit form point at the one hint (screen readers hear it)', () => {
    const src = read('app/dashboard/projects/[id]/changes/[coId]/co-builder.tsx');
    expect(count(src, 'aria-describedby="co-edit-text-hint"')).toBe(2);
  });

  it('the /m fields tie the hint to the input with aria-describedby', () => {
    const src = read('app/m/write-ui.tsx');
    expect(count(src, 'aria-describedby={hint ? `${testId}-hint` : undefined}')).toBe(2);
  });

  it('CONTROL — the counter is not vacuous: a file with no hint counts 0', () => {
    const src = read('app/m/p/[projectId]/changes/[coId]/page.tsx');
    expect(count(src, KEY)).toBe(0);
  });
});
