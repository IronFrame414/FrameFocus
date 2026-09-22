// S108 Spec A — `estimates.estimate_number` became NULLABLE: a site visit is
// an estimate that has not been numbered yet (the number is assigned at
// PROMOTION, so an abandoned visit never burns one).
//
// Every caller of this helper is reachable ONLY for a numbered estimate — the
// builder redirects a site visit to its visit page, the list excludes them,
// and reminders / proposals / signing handle sent estimates only. So a NULL
// here is a bug, and it fails LOUDLY rather than printing a blank number on a
// client document. Deliberately not `?? ''`: a silent blank is the failure
// this exists to prevent.
export function requireEstimateNumber(estimate: {
  id: string;
  estimate_number: string | null;
}): string {
  if (!estimate.estimate_number) {
    throw new Error(
      `Estimate ${estimate.id} has no number — an unpromoted site visit reached a numbered-estimate path.`
    );
  }
  return estimate.estimate_number;
}
