/**
 * S138 — the named copy gap.
 *
 * ⚠️ THIS COMPONENT IS SUPPOSED TO LOOK WRONG. TL-23 (the wording of what
 * happens to a customer's data) and TL-24 (whether we may delete it on this
 * timetable at all) are both with professional legal review. Until they come
 * back, no screen in this feature may carry hand-authored customer-facing
 * wording about deletion, retention or consequences.
 *
 * A placeholder that reads like finished copy is the failure mode: someone
 * ships it, someone else reads it as approved language, and unreviewed legal
 * wording about data destruction reaches customers. So the gap is rendered
 * LOUDLY — visible in the product, impossible to mistake for the real thing,
 * and greppable by the string `COPY PENDING LEGAL REVIEW`.
 *
 * `topic` names WHAT is missing so the eventual copy task is a list, not an
 * archaeology exercise.
 */
export function CopyPendingLegalReview({ topic }: { topic: string }) {
  return (
    <div
      role="note"
      className="my-4 rounded-md border-2 border-dashed border-amber-500 bg-amber-50 p-4"
      data-testid="copy-pending-legal-review"
    >
      <p className="text-xs font-bold uppercase tracking-widest text-amber-900">
        COPY PENDING LEGAL REVIEW
      </p>
      <p className="mt-1 text-sm text-amber-900">
        Wording for <span className="font-semibold">{topic}</span> has not been written. It is
        blocked on legal review (TL-23 / TL-24) and must not be drafted here.
      </p>
    </div>
  );
}
