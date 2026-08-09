import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { isFinalReminderStep } from '@framefocus/shared/utils/reminders';
import { resolveLink } from '@/lib/notify/links';

// ============================================================================
// SLICE 5 — §3f, reminders exhausted. No migration.
// Spec: docs/specs/notifications-architecture.md §3f.
// ============================================================================
//
// This file is the UNIT half: the trigger arithmetic and the destination.
//
// [S123 coverage pass] The claim that used to stand here — "the cron cannot be
// driven from a test: each pass sends a real reminder" — is SUPERSEDED. The
// loop now takes an injected sender, and s123-reminders-loop.live.ts drives it
// end to end with a recorder. These assertions stay because they pin the
// boundaries (opted-out, single-step, over-count) that one live fixture cannot
// cover at once.

describe('§3f — one row when the LAST reminder goes out', () => {
  const schedule = [3, 7, 14];

  it('fires on the final step and on no other', () => {
    // The whole lifecycle of a default-schedule estimate, in order. Two of the
    // three answers must be false, which is the assertion a `>= 1` guard fails
    // and a `>= length - 1` guard fails differently.
    expect(isFinalReminderStep(0, schedule.length)).toBe(false); // 1st of 3 sent
    expect(isFinalReminderStep(1, schedule.length)).toBe(false); // 2nd of 3 sent
    expect(isFinalReminderStep(2, schedule.length)).toBe(true); // 3rd of 3 — last
  });

  it('a single-step schedule is exhausted by its one reminder', () => {
    expect(isFinalReminderStep(0, 1)).toBe(true);
  });

  it('an opted-out estimate never exhausts anything', () => {
    // `[]` means opted out. Nothing is ever sent, so nothing can run out.
    expect(isFinalReminderStep(0, 0)).toBe(false);
    expect(isFinalReminderStep(5, 0)).toBe(false);
  });

  it('a count already past the end does not re-fire', () => {
    // Unreachable through the cron — it `continue`s past these — but a
    // predicate that answered `true` for an over-count would turn a shortened
    // schedule into a repeat notification.
    expect(isFinalReminderStep(3, schedule.length)).toBe(false);
    expect(isFinalReminderStep(9, schedule.length)).toBe(false);
  });
});

describe('the exhausted notification points somewhere real', () => {
  it('resolves to the estimate on desktop', () => {
    expect(resolveLink('estimate', { id: 'e1' }, 'desktop')).toBe('/dashboard/estimates/e1');
  });

  it('has no mobile destination, which is correct and not a gap', () => {
    // No mobile estimating surface exists (M6M D-9 keeps Finance off mobile),
    // and §3f addresses Owner/Admin, who are desktop roles.
    expect(resolveLink('estimate', { id: 'e1' }, 'mobile')).toBeNull();
  });
});

describe('the cron wires it to the shared predicate', () => {
  const source = readFileSync(
    fileURLToPath(new URL('../lib/notify/crons/estimate-reminders.ts', import.meta.url)),
    'utf8'
  );
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

  it('uses isFinalReminderStep rather than re-deriving the arithmetic', () => {
    // The extraction is only worth anything if the route actually calls it. A
    // second inline `=== schedule.length` would pass every test above while
    // being the thing those tests were written to constrain.
    expect(code).toContain('isFinalReminderStep(estimate.reminder_count, schedule.length)');
    expect(code).not.toContain('reminder_count + 1 ===');
  });

  // THE CALL SITE, not the import. This file's own first run failed here
  // asserting `indexOf('isFinalReminderStep')`, which found the import at the
  // top of the file and compared against that — the same defect as slice 2's
  // tab count, an assertion that ran and measured the wrong thing. Matching the
  // full call expression cannot collide with the import.
  const CALL = 'isFinalReminderStep(estimate.reminder_count, schedule.length)';

  it('fires AFTER the count is committed, not before', () => {
    // Firing before the update would notify on a send whose count never
    // persisted — the cron would re-send that reminder next run and the Owner
    // would be told the reminders were exhausted while one still goes out.
    expect(code).toContain(CALL);
    expect(code.indexOf('remindersSent++')).toBeLessThan(code.indexOf(CALL));
  });

  it('a notify failure is recorded and does not abandon the loop', () => {
    // A throw here would skip every estimate after this one in the same pass —
    // silently, since the cron returns 200 with whatever it managed.
    const block = code.slice(code.indexOf(CALL));
    expect(block).toContain('errors.push');
  });
});
