import { z } from 'zod';

/** S127 item 6 — the holiday-toggle preview's request and answer (route + screen share these). */
export const holidayPreviewSchema = z.object({
  ruleId: z.string().uuid(),
  enabled: z.boolean(),
});

export interface HolidayPreview {
  projects: {
    projectId: string;
    name: string;
    /** Projected finish now / with the change (YYYY-MM-DD), null when it cannot be computed. */
    before: string | null;
    after: string | null;
    error: boolean;
  }[];
}

/** Calendar days between two YYYY-MM-DD dates (after − before). */
export function finishShiftDays(before: string | null, after: string | null): number | null {
  if (!before || !after) return null;
  return Math.round(
    (Date.parse(`${after}T00:00:00Z`) - Date.parse(`${before}T00:00:00Z`)) / 86_400_000
  );
}

/** The sentence the screen shows BEFORE the change is written. */
export function holidayConsequence(p: HolidayPreview): string {
  const moved = p.projects.filter((x) => !x.error && x.before !== x.after);
  const failed = p.projects.filter((x) => x.error).length;
  if (p.projects.length === 0) return 'No job is on Critical Path, so no dates move.';
  const head =
    moved.length === 0
      ? `No Critical Path job's finish date moves (${p.projects.length} checked).`
      : `${moved.length} of ${p.projects.length} Critical Path job${p.projects.length === 1 ? '' : 's'} will move: ` +
        moved
          .map((x) => {
            const d = finishShiftDays(x.before, x.after)!;
            return `${x.name} ${x.before} → ${x.after} (${d > 0 ? '+' : ''}${d} day${Math.abs(d) === 1 ? '' : 's'})`;
          })
          .join('; ') +
        '.';
  return failed > 0 ? `${head} ${failed} could not be checked.` : head;
}
