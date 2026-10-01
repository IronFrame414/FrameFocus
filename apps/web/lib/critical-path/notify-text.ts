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
