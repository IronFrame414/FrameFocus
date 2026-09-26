import { describe, it, expect } from 'vitest';
import { makeT } from '@/lib/i18n/messages';

// [S112 audit F5] Spanish used the PLURAL for n = 1 on crew's landing screen
// ("1 abiertos"), the project hub ("1 míos · 1 abiertos") and photo select
// ("1 seleccionadas"). Each got a `…One` key, the catalog's existing pattern.
// English must read EXACTLY as before — e2e asserts '3 mine · 4 open' and
// '1 selected' — so it is pinned here too.
const en = makeT('en');
const es = makeT('es');

describe('S112 F5 — count strings agree in number', () => {
  it('Spanish singular for one, plural otherwise', () => {
    expect(es('field.projects.openPunchOne', { n: 1 })).toBe('1 abierto');
    expect(es('field.projects.openPunch', { n: 2 })).toBe('2 abiertos');
    expect(es('project.hub.punchMineOne', { n: 1 })).toBe('1 mío');
    expect(es('project.hub.punchMine', { n: 3 })).toBe('3 míos');
    expect(es('project.hub.punchOpenOne', { n: 1 })).toBe('1 abierto');
    expect(es('project.hub.punchOpen', { n: 4 })).toBe('4 abiertos');
    expect(es('photos.grid.selectedOne', { n: 1 })).toBe('1 seleccionada');
    expect(es('photos.grid.selected', { n: 2 })).toBe('2 seleccionadas');
  });

  it('English is unchanged, singular or not', () => {
    expect(en('field.projects.openPunchOne', { n: 1 })).toBe('1 open');
    expect(en('photos.grid.selectedOne', { n: 1 })).toBe('1 selected');
    // The hub label is composed from two halves; this is the string e2e reads.
    const hub = [en('project.hub.punchMine', { n: 3 }), en('project.hub.punchOpen', { n: 4 })].join(' · ');
    expect(hub).toBe('3 mine · 4 open');
    expect(
      [en('project.hub.punchMineOne', { n: 1 }), en('project.hub.punchOpenOne', { n: 1 })].join(' · ')
    ).toBe('1 mine · 1 open');
  });
});
