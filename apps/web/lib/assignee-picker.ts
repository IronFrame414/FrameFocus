'use client';

import { useCallback, useMemo, useState } from 'react';

// THE TWO-STEP ASSIGNEE PICKER — D-65 [S121, Josh], SHARED BY /m AND /dashboard.
//
// ===========================================================================
// WHY THIS FILE EXISTS AT ALL
// ===========================================================================
// D-65 ruled the mobile picker two-step: Team or Sub/Vendor first, then the
// respective list. The desktop punch panel had the SAME problem and a worse
// answer — one flat `<select>` over the whole roster (39 members on
// rebuild-test, 33 of them subcontractors), with no split and not even the
// `(Sub)` label the Team panel manages.
//
// Ruled [Josh, S121]: desktop gets "the same two-step shape ... sharing the
// mobile implementation rather than a second copy where the two can drift."
//
// ===========================================================================
// WHAT IS SHARED IS THE LOGIC. THE RENDERING IS DELIBERATELY NOT.
// ===========================================================================
// ⚠️ Read this before "finishing the job" by moving the markup in here too.
//
// The two surfaces do not agree about what a picker looks like, and should not:
//
//   /m         `OptionStack` — a column of 52px-minimum tap targets. §2's touch
//              floor makes that mandatory, and on a phone a stack IS the
//              idiom.
//   /dashboard an inline-styled `<select>`. A 33-item stack of 52px buttons on
//              a desktop form would be ~1700px of page for one field, and a
//              mouse does not need a 52px target.
//
// So a shared COMPONENT would have to pick one and impose it on the other. What
// can drift and matters is not the pixels — it is **who lands on which side,
// and what happens when you switch**. That is what lives here:
//
//   · the partition (which member is Team, which is Sub/Vendor)
//   · the selection state machine (switching sides clears the other side's pick)
//
// Both surfaces import both. Neither reimplements either.
//
// ===========================================================================
// ✅ PROJECT SCOPING IS NOW HERE — D-65 part 3, unheld [S121]
// ===========================================================================
// It was held because the data could not carry it: 1 of 33 subcontractor
// members had any `project_assignments` row, so scoping would have emptied the
// Sub/Vendor side on SIX of eight projects — the outcome the ruling itself
// called worse than the flat picker.
//
// Three things landed since, in this order and for this reason:
//   1. #117's read floor (20260830000000) — because an assignment is a
//      data-access grant, and before the floor it handed a sub every change
//      order at full net_delta.
//   2. Award auto-assign (20260831000000) — assignment stops being data
//      someone must remember to enter.
//   3. The backfill (20260901000000) — +5 rows for contracts awarded earlier.
//
// RE-MEASURED AFTER, against the bar the hold set:
//
//     project_assignments      19 -> 24     (subcontractor rows 2 -> 7)
//     projects with BOTH sides  2 -> 5 of 8
//     sub side empty on         6 -> 3 of 8
//
// **And the three that remain empty are TRUTHFULLY empty** — PRJ-100, 103 and
// 104 have no subcontract and no manual assignment, so there is genuinely no
// sub on them. That is the distinction the hold was about: the side used to be
// empty because the fact was never recorded, and is now empty only where the
// fact is that there is nobody.
//
// ONE FILTER, APPLIED BEFORE `partitionMembers`, so both surfaces gain it in
// one edit — which is the second reason this file is logic-only. A shared
// component would have made this a prop-drilling exercise.

export type AssigneeSide = 'crew' | 'subcontractor';

/** The shape both surfaces already have in hand from `getMembers()`. */
export interface AssigneeMember {
  id: string;
  display_name: string;
  member_type: string;
}

/**
 * Split the roster into D-65's two sides.
 *
 * ⚠️ `member_type`, NEVER `profiles.role`. §4.11.10a's trap, and it is live:
 * `member_type` permits exactly `crew | subcontractor` (CHECK constraint,
 * 20260704210000:31) while `profiles.role` permits seven values including
 * `subcontractor`. rebuild-test holds 33 members with
 * `member_type = 'subcontractor'` of which **32 have no profile at all** — a
 * split that tested the role would put all 32 on the wrong side, or nowhere.
 *
 * The two-value CHECK is what makes this a PARTITION: `!== 'subcontractor'` is
 * the crew arm rather than `=== 'crew'`, so a value added to the constraint
 * later surfaces on the Team side instead of vanishing from both.
 */
export function partitionMembers<T extends AssigneeMember>(
  members: readonly T[]
): { crew: T[]; subs: T[] } {
  return {
    crew: members.filter((m) => m.member_type !== 'subcontractor'),
    subs: members.filter((m) => m.member_type === 'subcontractor'),
  };
}

export interface AssigneePicker<T extends AssigneeMember> {
  /** `null` until the author answers step 1 — nothing is preselected. */
  side: AssigneeSide | null;
  /** `null` until step 2. This is the `assignee_id` value to submit. */
  assignee: string | null;
  /** Step 1. Clears any pick made on the other side — see `chooseSide`. */
  chooseSide: (side: AssigneeSide) => void;
  /** Step 2. */
  chooseAssignee: (id: string | null) => void;
  /** The members for the chosen side. Empty array before a side is chosen. */
  visible: T[];
  crew: T[];
  subs: T[];
  /** Back to nothing chosen — for a form that stays mounted after a save. */
  reset: () => void;
}

/**
 * @param members             the company roster, unscoped.
 * @param assignedMemberIds   `company_members.id` for everyone assigned to the
 *   project this picker files into. **Required, not optional** — an optional
 *   scope is one a caller forgets, and the two call sites are few enough that
 *   making it explicit costs nothing. Pass every member's id to opt out
 *   deliberately.
 */
export function useAssigneePicker<T extends AssigneeMember>(
  members: readonly T[],
  assignedMemberIds: readonly string[]
): AssigneePicker<T> {
  const [side, setSide] = useState<AssigneeSide | null>(null);
  const [assignee, setAssignee] = useState<string | null>(null);

  const { crew, subs } = useMemo(() => {
    // D-65's scope. Applied BEFORE the partition so both sides narrow together
    // and neither can drift from the other.
    const onProject = new Set(assignedMemberIds);
    return partitionMembers(members.filter((m) => onProject.has(m.id)));
  }, [members, assignedMemberIds]);

  const chooseSide = useCallback((next: AssigneeSide) => {
    setSide(next);
    // ⚠️ THE CLEAR IS THE POINT, NOT TIDINESS. Without it the form carries an
    // assignee the visible list does not contain: the user sees an unselected
    // picker while the payload says otherwise, and submits someone they cannot
    // see. Asserted on both surfaces.
    setAssignee(null);
  }, []);

  const reset = useCallback(() => {
    setSide(null);
    setAssignee(null);
  }, []);

  const visible = side === null ? [] : side === 'crew' ? crew : subs;

  return {
    side,
    assignee,
    chooseSide,
    chooseAssignee: setAssignee,
    visible,
    crew,
    subs,
    reset,
  };
}
