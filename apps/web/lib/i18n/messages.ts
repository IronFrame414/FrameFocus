import type { Lang } from '@/lib/i18n/lang';
import * as shell from '@/lib/i18n/areas/shell';
import * as field from '@/lib/i18n/areas/field';
import * as project from '@/lib/i18n/areas/project';
import * as photos from '@/lib/i18n/areas/photos';
import * as directory from '@/lib/i18n/areas/directory';

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

const core = {
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
  // ── the send-time English check (S110 Q14) ──
  'sendcheck.title': 'Some of this is not in English.',
  'sendcheck.body':
    'A client always receives the {doc} in English, exactly as written — nothing is translated for them. Check:',
  'sendcheck.hint':
    'If these are names, addresses or brands, send anyway. Otherwise cancel and edit them.',
  'sendcheck.sendAnyway': 'Send anyway, as written',
  'sendcheck.doc.proposal': 'proposal',
  'sendcheck.doc.changeOrder': 'change order',
  'sendcheck.doc.invoice': 'invoice',
} as const;

// Each /m area keeps its own table (lib/i18n/areas/*), so screens can be
// migrated independently; they are merged here.
export const en = {
  ...core,
  ...shell.en,
  ...field.en,
  ...project.en,
  ...photos.en,
  ...directory.en,
};

export type MsgKey = keyof typeof en;

const coreEs: Record<keyof typeof core, string> = {
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
  'sendcheck.title': 'Parte de esto no está en inglés.',
  'sendcheck.body':
    'El cliente siempre recibe {doc} en inglés, tal como está escrito — no se le traduce nada. Revisa:',
  'sendcheck.hint':
    'Si son nombres, direcciones o marcas, envíalo de todos modos. Si no, cancela y corrígelos.',
  'sendcheck.sendAnyway': 'Enviar de todos modos, tal como está',
  'sendcheck.doc.proposal': 'la propuesta',
  'sendcheck.doc.changeOrder': 'la orden de cambio',
  'sendcheck.doc.invoice': 'la factura',
};

export const es: Record<MsgKey, string> = {
  ...coreEs,
  ...shell.es,
  ...field.es,
  ...project.es,
  ...photos.es,
  ...directory.es,
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
