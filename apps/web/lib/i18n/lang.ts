// S110 H [RULED Josh, 2026-09-23] — Spanish and English ONLY (ruling 4). Not a
// locale framework: two languages, one closed union, and nothing that invites a
// third without a ruling.

export type Lang = 'en' | 'es';

export function asLang(v: unknown): Lang {
  return v === 'es' ? 'es' : 'en';
}

/** Each language named in ITSELF, so a reader who cannot read the other one can
 *  still find their own. Never translated. */
export const LANG_SELF_NAME: Record<Lang, string> = { en: 'English', es: 'Español' };
