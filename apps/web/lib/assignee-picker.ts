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
// ⚠️ PROJECT SCOPING IS **NOT** HERE, AND ITS ABSENCE IS A DECISION
// ===========================================================================
// D-65 also limits each side to members assigned to the project. **HELD** —
// see docs/specs/113c-award-assignment-spec.md §7. Measured: 1 of 33
// subcontractor members carries any `project_assignments` row, and that one is
// a seed fixture. Scoping now would empty the Sub/Vendor side on six of eight
// projects and make existing punch assignments unreproducible, which the ruling
// itself called worse than the flat picker.
//
// When it lands it belongs HERE — one filter, applied before `partitionMembers`,
// so both surfaces gain it in one edit. That is the second reason this file is
// logic-only: a shared component would have made the scoping a shared prop
// drilling exercise; a shared function makes it one line.

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

export function useAssigneePicker<T extends AssigneeMember>(
  members: readonly T[]
): AssigneePicker<T> {
  const [side, setSide] = useState<AssigneeSide | null>(null);
  const [assignee, setAssignee] = useState<string | null>(null);

  const { crew, subs } = useMemo(() => partitionMembers(members), [members]);

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
