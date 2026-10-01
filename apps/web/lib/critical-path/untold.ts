// S122 Part 6 — WHO COULD NOT BE TOLD, said to the saver AT SAVE TIME.
//
// [ruling 11, PARITY] Every path that APPLIES a Critical Path change — the
// sheet's save and release, a drag (desktop tab, scheduling calendar, /m day
// view) and an approval — returns `untold` from its route and shows the same
// notice. One shape, one reader, one sentence.
//
// ⚠️ THIS FILE HOLDS NO WORDS. /m mounts it, and /m system text is translated
// (S110 H, test/s110-m-i18n-guard.test.ts): /m passes its t() words, desktop and
// the server pass UNTOLD_WORDS_EN from ./notify-text. The words are the only
// thing that differs by surface.

/** Who chose to be told and could not be reached. */
export interface Untold {
  names: string[];
  client: boolean;
}

/** The notice's words: `body` carries `{names}`; `client` names the client in that list. */
export interface UntoldWords {
  title: string;
  body: string;
  client: string;
}

export const NOBODY_UNTOLD: Untold = { names: [], client: false };

/** Server side: from the recompute's notify outcome (null when nothing recomputed). */
export function untoldFrom(n: { unreachable: readonly string[]; clientUnreachable: boolean } | null | undefined): Untold {
  return n ? { names: [...n.unreachable], client: n.clientUnreachable } : NOBODY_UNTOLD;
}

/** Client side: a route's `untold`, read defensively (a missing field is nobody). */
export function parseUntold(v: unknown): Untold {
  if (!v || typeof v !== 'object') return NOBODY_UNTOLD;
  const o = v as { names?: unknown; client?: unknown };
  return {
    names: Array.isArray(o.names) ? o.names.filter((x): x is string => typeof x === 'string') : [],
    client: o.client === true,
  };
}

export function anyUntold(u: Untold): boolean {
  return u.names.length > 0 || u.client;
}

/** The list the saver reads: assignees by name, then the client. */
export function untoldList(u: Untold, clientWords: string): string[] {
  return [...u.names, ...(u.client ? [clientWords] : [])];
}

export function untoldNotice(u: Untold, words: UntoldWords): { title: string; message: string } {
  return { title: words.title, message: words.body.replace('{names}', untoldList(u, words.client).join(', ')) };
}
