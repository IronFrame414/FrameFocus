// S122 Part 6 — the WORDS of a Critical Path notification. Pure, so what each
// audience is told — and what it is NEVER told — is asserted without a mailbox.
//
// ⚠️ THE CLIENT IS TOLD THE FINISH AND THE DISCLAIMER, NOTHING ELSE (ruling 8,
// 6-A). No cause, no float, no assignee, no task. A bare "your finish date
// changed" is the email that generates the call Josh does not want, so the
// disclaimer is part of the sentence, not a footer that can be dropped.

import { shortDate } from '@framefocus/shared/utils/critical-path-writes';

/** "Fri 8 Jan 2027" */
export function longDate(d: string): string {
  return `${shortDate(d)} ${d.slice(0, 4)}`;
}

export const CLIENT_DISCLAIMER =
  'The construction industry is fluid and dynamic; these dates are for planning purposes and cannot be guaranteed.';

export function clientFinishEmail(projectName: string, previous: string, next: string): { subject: string; message: string } {
  return {
    subject: `${projectName}: projected finish ${longDate(next)}`,
    message: `The projected finish for ${projectName} is now ${longDate(next)} (was ${longDate(previous)}).\n${CLIENT_DISCLAIMER}`,
  };
}

export interface ChangedTaskLine {
  title: string;
  start: string | null;
  due: string | null;
}

/** One line per task the person is on: "Framing: Mon 4 Jan – Fri 8 Jan 2027". */
export function assigneeLines(tasks: readonly ChangedTaskLine[]): string[] {
  return tasks.map((t) =>
    t.start && t.due
      ? `${t.title}: ${shortDate(t.start)} – ${longDate(t.due)}`
      : `${t.title}: ${t.due ? `due ${longDate(t.due)}` : 'no dates yet'}`
  );
}

export function assigneeTitle(projectName: string): string {
  return `Schedule changed on ${projectName}`;
}

/** The saver's own report (ruling 11: an unreachable assignee is never silently dropped). */
export function unreachableReport(names: readonly string[]): { title: string; body: string } {
  return {
    title: 'Not everyone could be told about your schedule change',
    body: `No login and no email on file: ${names.join(', ')}.`,
  };
}

// ── Who could not be told, said to the saver AT SAVE TIME ───────────────────
// [S122 Part 6, PARITY] Every path that APPLIES a change — the sheet, a drag
// (desktop tab, scheduling calendar, /m day view) and an approval — returns
// `untold` from its route and shows the same notice. One shape, one reader, one
// sentence; only the LANGUAGE differs by surface (/m passes its t() words).

/** Who chose to be told and could not be reached. */
export interface Untold {
  names: string[];
  client: boolean;
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

export const UNTOLD_WORDS_EN = {
  title: 'Saved — but not everyone could be told',
  body: 'No login and no email on file: {names}.',
  client: 'the client (no email on file)',
};

/** The list the saver reads: assignees by name, then the client. */
export function untoldList(u: Untold, clientWords: string = UNTOLD_WORDS_EN.client): string[] {
  return [...u.names, ...(u.client ? [clientWords] : [])];
}

export function untoldNotice(u: Untold, words: typeof UNTOLD_WORDS_EN = UNTOLD_WORDS_EN): { title: string; message: string } {
  return { title: words.title, message: words.body.replace('{names}', untoldList(u, words.client).join(', ')) };
}
