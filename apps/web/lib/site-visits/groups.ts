// S108 Spec A / S110 B — THE THREE STATES OF A SITE VISIT, in one place, so the
// phone list (/m/site-visits) and the desktop list (/dashboard/site-visits)
// cannot group the same visit differently (PARITY [S122]).
//   RECORDING — still capturing (not finished, not promoted);
//   FINISHED  — the recorder's "done": no number, not an estimate;
//   ESTIMATE  — the office promoted it.
// [S108 follow-up — finish is not promotion.]

export interface GroupableVisit {
  promoted_at: string | null;
  finished_at: string | null;
}

export function groupSiteVisits<T extends GroupableVisit>(visits: T[]) {
  return {
    recording: visits.filter((v) => !v.promoted_at && !v.finished_at),
    finished: visits.filter((v) => !v.promoted_at && !!v.finished_at),
    estimates: visits.filter((v) => !!v.promoted_at),
  };
}
