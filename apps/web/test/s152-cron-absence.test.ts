/**
 * S152 — M1-07. `/api/cron/invoice-reminders` has a handler and NO schedule, and
 * that is now DELIBERATE rather than indistinguishable from an oversight.
 *
 * RULED [Josh, S152]: do not schedule it. Scheduling it starts emailing Josh's
 * clients on a timer, which is a product decision and not cleanup.
 *
 * WHY THIS TEST EXISTS AT ALL. The route was built at S97 and has never run. Its
 * absence from `vercel.json` was recorded in `notifications-architecture.md`
 * (`:677`, `:1143`) and `trial-lifecycle-interview.md` (`:49`) — but a note in a
 * spec does not stop the next person from "fixing" the gap by adding the entry.
 * `trial-deletion` solved the identical problem by ASSERTING its own absence,
 * and that assertion was verified load-bearing. This mirrors it.
 *
 * ⚠️ DELIBERATELY A PLAIN `.test.ts`, NOT A `.live.ts`. The precedent
 * (`s137-trial-lifecycle.live.ts:347`) lives in a live harness because the rest
 * of that file needs a database — so it only runs when someone runs the live
 * suite by hand, which is exactly when nobody is adding a cron entry. This
 * check reads one file and needs nothing, so it belongs in the committed suite
 * where CI runs it on every push. Same pattern, better placement.
 *
 * (`trial-deletion`'s own assertion would be better off here too. Not moved —
 * out of scope, and it is not this test's job to relocate another one.)
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const vercelJson = readFileSync(
  fileURLToPath(new URL('../vercel.json', import.meta.url)),
  'utf8'
);

describe('S152 M1-07 — cron schedules are deliberate', () => {
  it('the invoice-reminder route EXISTS, so this is about scheduling and not about dead code', () => {
    // Without this, the absence assertion below would keep passing after someone
    // deleted the route — reporting "correctly unscheduled" about nothing. The
    // finding is "built and not scheduled"; both halves have to be true for it
    // to still be the finding.
    const routeExists = (() => {
      try {
        readFileSync(
          fileURLToPath(new URL('../app/api/cron/invoice-reminders/route.ts', import.meta.url)),
          'utf8'
        );
        return true;
      } catch {
        return false;
      }
    })();
    expect(
      routeExists,
      'the invoice-reminders route is gone — M1-07 no longer describes reality; re-read it'
    ).toBe(true);
  });

  it('⚠️ INVOICE REMINDERS ARE NOT SCHEDULED — asserted, not trusted', () => {
    expect(
      vercelJson.includes('/api/cron/invoice-reminders'),
      'THE INVOICE REMINDER CRON HAS BEEN SCHEDULED. That starts sending email to ' +
        "clients on a timer. RULED [Josh, S152]: this is a product decision and Josh's " +
        'line to add, not a build\'s. See S151-m1-audit.md M1-07.'
    ).toBe(false);
  });

  it('the crons that ARE scheduled are still scheduled — the guard cuts both ways', () => {
    // A file that lost its `crons` key entirely would satisfy the assertion above
    // while silently stopping nine jobs. Pin the ones that are supposed to run.
    for (const path of [
      '/api/cron/estimate-reminders',
      '/api/cron/co-reminders',
      '/api/cron/timesheets-ready',
      '/api/cron/daily-log-missing',
      '/api/cron/still-clocked-in',
      '/api/cron/notification-expiry',
      '/api/cron/trial-warnings',
      '/api/cron/trial-lock',
      '/api/cron/export-worker',
      // retention-warnings pinned with the deletion sweep [2026-08-30]: the
      // ordering assertion below leans on it, and indexOf(-1) would pass the
      // less-than check with the entry silently gone.
      '/api/cron/retention-warnings',
    ]) {
      expect(vercelJson, `${path} is no longer scheduled`).toContain(path);
    }
  });

  it('the trial-deletion cron IS scheduled — the Q8 chain closed [2026-08-30]', () => {
    // Duplicated from s137 on purpose. That copy only runs in the live suite;
    // this one runs in CI. The most consequential line in the schedule file
    // should not depend on someone choosing to run a database harness.
    //
    // ⚠️ INVERTED [2026-08-30] per the S157 rule, in the same commit as the
    // vercel.json entry. Superseded assertion, quoted not deleted:
    //
    //   expect(
    //     vercelJson.includes('/api/cron/trial-deletion'),
    //     'THE DELETION CRON HAS BEEN SCHEDULED. TL-24 is with legal.'
    //   ).toBe(false);
    //
    // TL-24's hold was released and the Q8 chain closed (#126 deliverability
    // verified by an inspected send; warnings live at 14:30; production dry
    // run reviewed CLEAN; Josh ruled the entry in). The guard now cuts the
    // other way: removing the entry silently stops a published retention
    // behaviour. See s137-trial-lifecycle.live.ts for the full record.
    expect(
      vercelJson.includes('/api/cron/trial-deletion'),
      'THE DELETION CRON HAS BEEN UNSCHEDULED. Josh ruled it in at the end of the Q8 chain [2026-08-30]; its absence now silently breaks a published retention behaviour.'
    ).toBe(true);
    expect(
      vercelJson.indexOf('/api/cron/retention-warnings'),
      'the retention-warnings entry must come before the sweep\'s'
    ).toBeLessThan(vercelJson.indexOf('/api/cron/trial-deletion'));
  });
});
