/**
 * The shape every notification cron reports back.
 *
 * `fired` and `skipped` are not decoration — they are what makes a cron test
 * assertable in the positive. "It threw nothing" is satisfied by a loop that
 * examined zero companies and did nothing at all, which is the failure mode
 * these crons are most likely to have and the one a green test would hide.
 */
export interface CronOutcome {
  checked: number;
  fired: number;
  skipped: number;
  errors: string[];
}
