import type { Lang } from '@/lib/i18n/lang';

// S110 H — SYSTEM TEXT, English and Spanish.
//
// ⚠️ SCOPE [ruling 2]: system text is translated on /m ONLY. /dashboard chrome
// stays English — a shared component resolves `uiLang` from its provider, and
// the dashboard layout pins that to 'en'. [ruling 5] NOTHING CLIENT-FACING
// imports this file (test/s110-client-facing-english.test.ts).
//
// Keys are flat and grouped by prefix. `es` is typed against `en`'s keys, so a
// key added in English and not in Spanish is a COMPILE error, not a blank.
// `{name}` placeholders are filled by `format()`.

export const en = {
  // ── account (shared: /m/account and /dashboard/account) ──
  'account.title': 'Your account',
  'account.password': 'Password',
  'account.language': 'Language',
  'account.language.help':
    'The app on your phone, and anything your team writes, will show in this language. Estimates, invoices and anything sent to a client stay in English.',
  'account.language.saved': 'Saved.',
  'account.language.error': 'Could not save your language. Please try again.',
  'account.save': 'Save',
  'account.saving': 'Saving…',
  // ── the ☰ sheet and shell ──
  'shell.goTo': 'GO TO',
  'shell.yourAccount': 'Your account',
  'shell.signOut': 'Sign out',
  'shell.signingOut': 'Signing out…',
  'shell.desktopSite': 'Desktop site',
  'shell.closeMenu': 'Close menu',
  // ── user text (translated for the reader) ──
  'lang.en': 'English',
  'lang.es': 'Spanish',
  'usertext.translatedFrom': 'Translated from {lang}',
  'usertext.showOriginal': 'show original',
  'usertext.showTranslation': 'show translation',
  'usertext.translating': 'translating…',
  'usertext.unavailable': 'translation unavailable',
} as const;

export type MsgKey = keyof typeof en;

export const es: Record<MsgKey, string> = {
  'account.title': 'Tu cuenta',
  'account.password': 'Contraseña',
  'account.language': 'Idioma',
  'account.language.help':
    'La aplicación en tu teléfono, y lo que escribe tu equipo, se mostrarán en este idioma. Los presupuestos, las facturas y todo lo que se envía a un cliente siguen en inglés.',
  'account.language.saved': 'Guardado.',
  'account.language.error': 'No se pudo guardar tu idioma. Inténtalo de nuevo.',
  'account.save': 'Guardar',
  'account.saving': 'Guardando…',
  'shell.goTo': 'IR A',
  'shell.yourAccount': 'Tu cuenta',
  'shell.signOut': 'Cerrar sesión',
  'shell.signingOut': 'Cerrando sesión…',
  'shell.desktopSite': 'Sitio de escritorio',
  'shell.closeMenu': 'Cerrar menú',
  'lang.en': 'inglés',
  'lang.es': 'español',
  'usertext.translatedFrom': 'Traducido del {lang}',
  'usertext.showOriginal': 'ver original',
  'usertext.showTranslation': 'ver traducción',
  'usertext.translating': 'traduciendo…',
  'usertext.unavailable': 'traducción no disponible',
};

const TABLES: Record<Lang, Record<MsgKey, string>> = { en, es };

export function format(lang: Lang, key: MsgKey, vars?: Record<string, string | number>): string {
  const s = TABLES[lang][key] ?? en[key];
  return vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : s;
}

export type T = (key: MsgKey, vars?: Record<string, string | number>) => string;

export function makeT(lang: Lang): T {
  return (key, vars) => format(lang, key, vars);
}
