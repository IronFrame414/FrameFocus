'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createPunchItem, createPunchList } from '@/lib/services/punch-client';
import { useAssigneePicker } from '@/lib/assignee-picker';
import type { PunchItemPriority } from '@/lib/services/punch-client';
import { SetMobileHeader } from '../../../../mobile-header';
import {
  ErrorNotice,
  FieldLabel,
  OfflineNotice,
  OptionStack,
  PrimaryButton,
  SecondaryButton,
  TextAreaField,
  TextField,
  useOnline,
} from '../../../../write-ui';

// M6M §4.11.13 — M-33's form.
//
// ===========================================================================
// THE LIST TARGET SITS ABOVE `title`, AND THE ORDER IS THE RULING
// ===========================================================================
// D-60, quoted: "The field sits **above `title`**, because the answer to 'where
// does this go' changes nothing about what the user types but reading it
// afterwards changes everything about finding the item again."
//
// ===========================================================================
// ⚠️ INLINE LIST CREATION IS TWO WRITES, AND A FAILURE LEAVES THE LIST BEHIND
// ===========================================================================
// A-67b, and it is an accepted outcome rather than a defect to paper over:
//
//   "Two writes, not one — `createPunchList` then `createPunchItem`. **A failed
//    item insert leaves the new list behind**, which is accepted (D-60) and
//    must not be 'fixed' with a cleanup that deletes a list a user may have
//    meant to keep; an empty list is a legal state."
//
// D-57 already produces empty lists (a sub sees a list whose items are all
// narrowed away), and D-61 requires an empty list to stay visible. So the
// tempting compensating delete would destroy a legal state to tidy up a
// transaction this service layer does not offer.
//
// The one thing this code DOES do about it: on a failed item insert it keeps
// the new list selected rather than resetting the picker, so a retry files into
// the list that was just created instead of silently making a second one.
//
// ===========================================================================
// CUT: `requires_verification` and `requires_completion_photo`
// ===========================================================================
// §4.11.13's cut. `setRequirementToggles` exists but is **Foreman+ by the
// service layer**, and putting a Foreman-only control on a screen D-52 opens to
// crew and subs would need a fourth role gate this pass has not ruled. Items
// created on mobile take the table's defaults.

const NEW_LIST = '__new__';

const PRIORITIES: readonly { value: PunchItemPriority; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
];

export type ListOption = { id: string; name: string };
export type MemberOption = { id: string; display_name: string; member_type: string };

export function PunchItemForm({
  projectId,
  projectName,
  lists,
  members,
  assignedMemberIds,
}: {
  projectId: string;
  projectName: string;
  lists: ListOption[];
  members: MemberOption[];
  /** D-65 part 3 — `company_members.id` for this project's roster. */
  assignedMemberIds: string[];
}) {
  const router = useRouter();
  const online = useOnline();

  // NO DEFAULT. `null` is the unchosen state and the submit gate reads it —
  // pre-selecting `lists[0]` would satisfy every other assertion on this screen
  // and violate D-60.
  const [listId, setListId] = useState<string | null>(null);
  const [newListName, setNewListName] = useState('');

  // Lists created INLINE during this visit [S121].
  //
  // ⚠️ THIS FIXES A LATENT BUG, not only a D-64 need. `lists` is a server prop
  // fixed at page load, so a list created by the `__new__` option was never an
  // OPTION — only a value. The existing code already relied on it being one:
  //
  //   "Keep the created list selected. If WRITE 2 fails below, the retry files
  //    into THIS list rather than creating a second one."
  //
  // `setListId(created.id)` did set the state, but no option carried that id,
  // so the picker rendered with NOTHING active and the `newListName` field gone
  // — the user saw an unselected picker over a form that considered a list
  // chosen. D-64 turns that from a rare retry path into the normal one, since
  // "save and add another" lands there every time.
  const [createdLists, setCreatedLists] = useState<ListOption[]>([]);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [trade, setTrade] = useState('');
  const [priority, setPriority] = useState<PunchItemPriority | null>(null);

  // D-65's two steps, SHARED WITH DESKTOP — lib/assignee-picker.ts. The
  // partition and the switch-clears-the-pick rule live there so /dashboard's
  // punch panel cannot drift from this one; only the RENDERING is per-surface,
  // because §2's 52px touch floor and a desktop <select> are not reconcilable.
  const picker = useAssigneePicker(members, assignedMemberIds);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // D-64 — how many items this visit has filed. Drives the confirmation line,
  // which is not decoration: on "save and add another" the screen does not
  // navigate, so without it a successful save and a dead button look identical.
  const [savedCount, setSavedCount] = useState(0);


  const listChosen = listId !== null && (listId !== NEW_LIST || newListName.trim().length > 0);
  const ready = listChosen && title.trim().length > 0;

  async function submit(mode: 'return' | 'again' = 'return') {
    if (!online) return;

    // A-67 — the refusal NAMES THE MISSING LIST rather than failing on title.
    // Checked before `ready` so the more specific message wins when both are
    // missing: "pick a list" is actionable, "enter a title" on a screen whose
    // real blocker is the list target is a wild goose chase.
    if (!listChosen) {
      setError('Choose a list for this item, or create one.');
      return;
    }
    if (title.trim() === '') {
      setError('Give the item a title.');
      return;
    }

    setBusy(true);
    setError(null);

    // WRITE 1 (conditional) — the list.
    let targetListId = listId!;
    if (targetListId === NEW_LIST) {
      const created = await createPunchList(projectId, newListName.trim());
      if (!created.success || !created.id) {
        setBusy(false);
        setError(created.error ?? 'The list could not be created.');
        return;
      }
      // A const, so the narrowing above survives into the setState closure.
      const newId = created.id;
      targetListId = newId;
      // Keep the created list selected. If WRITE 2 fails below, the retry
      // files into THIS list rather than creating a second one — the list
      // itself is deliberately not cleaned up (A-67b). It is added to the
      // OPTIONS as well as the value, or "selected" would be invisible: see
      // the note on `createdLists`.
      setCreatedLists((cur) =>
        cur.some((l) => l.id === newId)
          ? cur
          : [...cur, { id: newId, name: newListName.trim() }]
      );
      setListId(newId);
      setNewListName('');
    }

    // WRITE 2 — the item.
    const result = await createPunchItem({
      punch_list_id: targetListId,
      project_id: projectId,
      title: title.trim(),
      description: description.trim() || null,
      priority,
      location: location.trim() || null,
      trade: trade.trim() || null,
      assignee_id: picker.assignee,
    });

    if (!result.success) {
      setBusy(false);
      setError(result.error ?? 'The item could not be created.');
      return;
    }

    setBusy(false);

    // =====================================================================
    // D-64 [S121, Josh] — SAVE AND ADD ANOTHER
    // =====================================================================
    // "After submit, stay on the form with the list still selected and the
    // description cleared. Keep the existing submit-and-return as well; a punch
    // walk is batch work but a single correction is not."
    //
    // ⚠️⚠️ THE LIST SURVIVING THIS IS **NOT** A D-60 PRESELECTION. READ THIS
    // BEFORE "FIXING" IT.
    //
    // D-60 forbids a DEFAULT: the form must not arrive with a list already
    // chosen, because the user has then made no decision and cannot be said to
    // have targeted anything. A-67 asserts exactly that — on load, no option
    // carries `data-active="true"`.
    //
    // **The list here is not defaulted, it is REMEMBERED.** The user chose it
    // by hand, this session, on this screen, seconds ago, and every item in a
    // batch is going to the same place — that is what makes it batch work.
    // Clearing it would re-ask a question already answered and would make
    // "add another" cost exactly as much as starting over, which is the whole
    // friction D-64 exists to remove.
    //
    // The two rules are compatible because they are about different moments:
    // D-60 governs ARRIVAL (nothing chosen), D-64 governs CONTINUATION (what
    // the user chose stays chosen). A build that cleared the list here would
    // satisfy neither — it would not be more D-60-compliant, it would just be
    // a worse form. `e2e/m-writes.spec.ts` pins both halves so this cannot be
    // "corrected" in either direction without a red test.
    if (mode === 'again') {
      // ⛔ RULED HERE, NOT BY D-64 [S121] — the ruling names the list (keep)
      // and the description (clear) and is silent on the other four fields.
      // The line drawn: fields that IDENTIFY this defect clear; fields that
      // describe the BATCH the user is working through stay.
      //
      //   CLEARED   title, description   — they name one defect and no other
      //   KEPT      list, location, trade, priority, assignee
      //
      // Reasoning, so the next reader can disagree with the argument rather
      // than guess at it: a punch walk stays in one place, on one trade, at
      // one urgency, for a run of items. A kept value is visible and one tap
      // from being changed; a cleared value costs re-entry every single time.
      // The asymmetry favours keeping. Title is required and cleared, so the
      // form cannot re-submit the same item by a double tap.
      setTitle('');
      setDescription('');
      setSavedCount((n) => n + 1);
      // The list stays SELECTED, so the next item needs no decision at all.
      return;
    }

    router.push(`/m/p/${projectId}/punch`);
    router.refresh();
  }

  // The picker's options. "New list…" is one of them rather than a separate
  // control, so "where does this go" is a single question with a single answer.
  //
  // D-63 [S121] ADDS A FRONT DOOR AND DOES NOT CLOSE THIS ONE. Lists are now
  // standalone (M-41, `/punch/lists/new`), but creating one while filing the
  // first item into it is still the right flow for "I found something and there
  // is nowhere to put it" — and A-67b asserts it end to end.
  const listOptions = [
    ...lists.map((l) => ({ value: l.id, label: l.name })),
    ...createdLists.map((l) => ({ value: l.id, label: l.name })),
    { value: NEW_LIST, label: 'New list…' },
  ];

  return (
    <div className="px-[18px] pb-[18px] pt-[14px]">
      <SetMobileHeader title="New punch item" sub={projectName} />

      <h1 className="text-[17px] font-bold leading-tight text-m6m-navy">New punch item</h1>

      {!online ? (
        <div className="mt-[14px]">
          <OfflineNotice what="Creating a punch item" testId="m-punch-offline" />
        </div>
      ) : null}

      {/* ── THE LIST TARGET — above title, per D-60 ── */}
      <section data-testid="m-punch-list-target" className="mt-[14px]">
        <FieldLabel required>List</FieldLabel>
        {lists.length === 0 ? (
          <p className="mb-[8px] text-[13px] text-m6m-muted">
            This project has no punch lists yet — create the first one.
          </p>
        ) : null}
        <OptionStack
          options={listOptions}
          value={listId}
          onChange={setListId}
          testIdPrefix="m-punch-list"
        />
        {listId === NEW_LIST ? (
          <TextField
            label="New list name"
            value={newListName}
            onChange={setNewListName}
            testId="m-punch-new-list-name"
            required
            placeholder="e.g. Second floor"
          />
        ) : null}
      </section>

      <TextField
        label="Title"
        value={title}
        onChange={setTitle}
        testId="m-punch-title"
        required
        placeholder="What needs doing"
      />

      <TextAreaField
        label="Description"
        value={description}
        onChange={setDescription}
        testId="m-punch-description"
      />

      <TextField
        label="Location"
        value={location}
        onChange={setLocation}
        testId="m-punch-location"
      />

      <TextField label="Trade" value={trade} onChange={setTrade} testId="m-punch-trade" />

      <div className="mt-[14px]">
        <FieldLabel>Priority</FieldLabel>
        <OptionStack
          options={PRIORITIES}
          value={priority}
          onChange={setPriority}
          testIdPrefix="m-punch-priority"
        />
      </div>

      {/* ==================================================================
          ASSIGNEE — TWO STEPS, D-65 [S121, Josh]

          "Pick Team or Sub/Vendor first, then the respective list."

          The old build rendered ALL members in one flat stack at the bottom of
          the screen — 39 of them on rebuild-test, of which 33 are
          subcontractors — so the crew member you wanted was six taps of
          scrolling past a supplier directory. The split is expressible because
          `company_members.member_type` is exactly two values and
          `assignee_id` FKs to that table, so both sides carry the id the
          column needs.

          ⚠️ THE PROJECT SCOPING IS **NOT** BUILT, AND THAT IS DELIBERATE.
          D-65 also asks for the list to be limited to members assigned to the
          project. Measured on rebuild-test before building it:

            project_assignments rows           19  (crew 17, subcontractor 2)
            company_members                    39  (crew  6, subcontractor 33)
            projects with an assignment         8 of 9
            …with BOTH a crew and a sub         2 of 8
            punch items with an assignee       11 of 11
            …whose assignee has NO assignment
               row for that project             2

          So scoping would empty the Sub/Vendor side on SIX of eight projects,
          and would make two of the eleven assignments that already exist in
          the data impossible to re-create. That is the outcome the ruling
          itself named as worse than the flat picker, so the scoping half is
          held pending Josh, and only the split — which the data fully supports
          — is built. Adding the scope later is a filter on these two arrays
          and nothing else; no rework is created by shipping the split first.
          ================================================================== */}
      {members.length > 0 ? (
        <div className="mt-[14px]">
          <FieldLabel>Assign to</FieldLabel>

          {/* STEP 1. Not preselected: which side you want is a real question,
              and answering it for the user is how the flat list happened. */}
          <OptionStack
            options={[
              { value: 'crew' as const, label: 'Team', sub: `${picker.crew.length}` },
              {
                value: 'subcontractor' as const,
                label: 'Sub / Vendor',
                sub: `${picker.subs.length}`,
              },
            ]}
            value={picker.side}
            // The switch-clears-the-pick rule is INSIDE `chooseSide`, shared
            // with desktop. It was inline here and is not any more, precisely
            // so the two surfaces cannot disagree about it.
            onChange={picker.chooseSide}
            testIdPrefix="m-punch-assignee-side"
          />

          {/* STEP 2 — only after step 1. */}
          {picker.side !== null ? (
            <div className="mt-[10px]">
              {picker.visible.length === 0 ? (
                <p
                  data-testid="m-punch-assignee-empty"
                  className="text-[14px] text-m6m-muted"
                >
                  {/* D-65 part 3 — the empty state is about THIS PROJECT, not
                      the company. "on the roster" was true of an unscoped
                      picker and is a lie now: the company may have 33 subs and
                      this project none. Measured: 3 of 8 projects legitimately
                      have no sub, so this is a NORMAL state, not an edge case,
                      and it says what to do about it.

                      ⚠️ NO IN-APP EXIT ON MOBILE, stated rather than hidden.
                      §4.11.8 cut assign/unassign from M-18, so /m has no
                      surface that adds a member to a project. The two real
                      routes are the desktop Team tab and awarding a
                      subcontract, and the copy names them instead of offering a
                      link that goes nowhere. Flagged for the next M-18 pass. */}
                  {picker.side === 'crew'
                    ? 'Nobody from the team is assigned to this project yet. Assign them from the project’s Team tab on desktop.'
                    : 'No subs or vendors are assigned to this project yet. Awarding a subcontract assigns them automatically, or add one from the Team tab on desktop.'}
                </p>
              ) : (
                <OptionStack
                  options={picker.visible.map((m) => ({
                    value: m.id,
                    label: m.display_name,
                  }))}
                  value={picker.assignee}
                  onChange={picker.chooseAssignee}
                  testIdPrefix="m-punch-assignee"
                />
              )}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* D-64 — the screen does not navigate on "save and add another", so
          this line is the only evidence the save happened. A count rather than
          a bare "Saved": on a walk the useful fact is how many are in. */}
      {savedCount > 0 ? (
        <p
          data-testid="m-punch-saved-count"
          role="status"
          className="mt-[14px] rounded-[10px] border border-m6m-border bg-m6m-card px-[12px] py-[8px] text-center text-[13px] text-m6m-navy"
        >
          {savedCount} item{savedCount === 1 ? '' : 's'} filed to this list. Add another, or use
          Create item to finish.
        </p>
      ) : null}

      {error ? <ErrorNotice message={error} testId="m-punch-create-error" /> : null}

      <PrimaryButton
        label="Create item"
        busyLabel="Creating…"
        onClick={() => submit('return')}
        // NOT disabled on a missing list — A-67 wants the refusal to SAY what
        // is missing, and a disabled button says nothing. Only the offline gate
        // disables, because there the message is already on screen.
        disabled={!online}
        busy={busy}
        testId="m-punch-create"
      />

      {/* D-64 — the batch control, SECONDARY to the one above. A punch walk is
          batch work but a single correction is not, and the ruling keeps both;
          the outlined treatment says which one ends the task. */}
      <SecondaryButton
        label="Save and add another"
        onClick={() => submit('again')}
        disabled={!online || busy}
        testId="m-punch-create-again"
      />

      {!ready ? (
        <p className="mt-[8px] text-center text-[12px] text-m6m-muted">
          A list and a title are required.
        </p>
      ) : null}
    </div>
  );
}
