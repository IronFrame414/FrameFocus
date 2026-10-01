import { describe, expect, it } from 'vitest';
import {
  assigneeLines,
  assigneeTitle,
  CLIENT_DISCLAIMER,
  clientFinishEmail,
  longDate,
  NOBODY_UNTOLD,
  anyUntold,
  parseUntold,
  UNTOLD_WORDS_EN,
  unreachableReport,
  untoldFrom,
  untoldNotice,
} from '@/lib/critical-path/notify-text';
import { en as schedEn, es as schedEs } from '@/lib/i18n/areas/schedule';

// S122 Part 6 — what each audience is told. ⚠️ The CLIENT email carries the
// finish and the disclaimer and NOTHING ELSE (ruling 8, 6-A): no cause, no
// float, no assignee, no task. The negative is asserted, not assumed.

describe('the client email (6-A)', () => {
  const { subject, message } = clientFinishEmail('Alvarez Kitchen', '2027-01-06', '2027-01-08');

  it('says the new finish, the old finish, and the disclaimer — in one message', () => {
    expect(subject).toBe('Alvarez Kitchen: projected finish Fri 8 Jan 2027');
    expect(message).toBe(
      'The projected finish for Alvarez Kitchen is now Fri 8 Jan 2027 (was Wed 6 Jan 2027).\n' +
        'The construction industry is fluid and dynamic; these dates are for planning purposes and cannot be guaranteed.'
    );
    expect(message).toContain(CLIENT_DISCLAIMER);
  });

  it('⚠️ carries no float, no critical flag, no cause, no task, no person', () => {
    for (const word of ['float', 'critical', 'slack', 'cause', 'because', 'task', 'assigned', 'delay', 'weather', 'holiday']) {
      expect(`${subject}\n${message}`.toLowerCase(), `"${word}" must not reach the client`).not.toContain(word);
    }
  });
});

describe('the assignee message', () => {
  it('one line per task they are on, with its new dates', () => {
    expect(
      assigneeLines([
        { title: 'Framing', start: '2027-01-04', due: '2027-01-08' },
        { title: 'Inspection', start: null, due: '2027-01-11' },
        { title: 'Trim', start: null, due: null },
      ])
    ).toEqual(['Framing: Mon 4 Jan – Fri 8 Jan 2027', 'Inspection: due Mon 11 Jan 2027', 'Trim: no dates yet']);
    expect(assigneeTitle('Alvarez Kitchen')).toBe('Schedule changed on Alvarez Kitchen');
  });

  it("the saver's report names everyone who could not be told", () => {
    expect(unreachableReport(['Dave (no login)', 'the client (no email on file)'])).toEqual({
      title: 'Not everyone could be told about your schedule change',
      body: 'No login and no email on file: Dave (no login), the client (no email on file).',
    });
    expect(longDate('2027-01-08')).toBe('Fri 8 Jan 2027');
  });
});

// [S122 Part 6, PARITY] Every path that APPLIES a change (sheet, release, drag on
// the desktop tab / calendar / m day view, approval) returns `untold` and shows
// THIS notice. One reader, one sentence; /m differs only in language.
describe('who could not be told, shown to the saver at save time', () => {
  const told = untoldFrom({ unreachable: ['Dave'], clientUnreachable: true });

  it('the route shape: from the recompute outcome, and nobody when nothing recomputed', () => {
    expect(told).toEqual({ names: ['Dave'], client: true });
    expect(untoldFrom(null)).toEqual(NOBODY_UNTOLD);
    expect(anyUntold(NOBODY_UNTOLD)).toBe(false);
    expect(anyUntold({ names: [], client: true })).toBe(true);
    expect(anyUntold({ names: ['Dave'], client: false })).toBe(true);
  });

  it('the client reads it defensively: junk is nobody, never a crash or a false alarm', () => {
    expect(parseUntold(JSON.parse(JSON.stringify(told)))).toEqual(told);
    for (const junk of [undefined, null, 'Dave', 7, [], { names: 'Dave' }, { client: 'yes' }]) {
      expect(parseUntold(junk), JSON.stringify(junk)).toEqual(NOBODY_UNTOLD);
    }
    expect(parseUntold({ names: ['Dave', 3, null], client: true })).toEqual(told);
  });

  it('the notice names everyone, assignees first, then the client', () => {
    expect(untoldNotice(told)).toEqual({
      title: 'Saved — but not everyone could be told',
      message: 'No login and no email on file: Dave, the client (no email on file).',
    });
  });

  it('⚠️ PARITY: the /m English words ARE the desktop words; Spanish fills the same names', () => {
    const mEn = { title: schedEn['sched.cp.untoldTitle'], body: schedEn['sched.cp.untoldBody'], client: schedEn['sched.cp.untoldClient'] };
    expect(mEn).toEqual(UNTOLD_WORDS_EN);
    const mEs = { title: schedEs['sched.cp.untoldTitle'], body: schedEs['sched.cp.untoldBody'], client: schedEs['sched.cp.untoldClient'] };
    expect(untoldNotice(told, mEs).message).toBe('Sin cuenta y sin correo registrado: Dave, el cliente (sin correo registrado).');
  });
});
