'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createPunchItem, createPunchList } from '@/lib/services/punch-client';
import type { PunchItemPriority } from '@/lib/services/punch-client';
import { SetMobileHeader } from '../../../../mobile-header';
import {
  ErrorNotice,
  FieldLabel,
  OfflineNotice,
  OptionStack,
  PrimaryButton,
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
}: {
  projectId: string;
  projectName: string;
  lists: ListOption[];
  members: MemberOption[];
}) {
  const router = useRouter();
  const online = useOnline();

  // NO DEFAULT. `null` is the unchosen state and the submit gate reads it —
  // pre-selecting `lists[0]` would satisfy every other assertion on this screen
  // and violate D-60.
  const [listId, setListId] = useState<string | null>(null);
  const [newListName, setNewListName] = useState('');

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [trade, setTrade] = useState('');
  const [priority, setPriority] = useState<PunchItemPriority | null>(null);
  const [assignee, setAssignee] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const listChosen = listId !== null && (listId !== NEW_LIST || newListName.trim().length > 0);
  const ready = listChosen && title.trim().length > 0;

  async function submit() {
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
      targetListId = created.id;
      // Keep the created list selected. If WRITE 2 fails below, the retry
      // files into THIS list rather than creating a second one — the list
      // itself is deliberately not cleaned up (A-67b).
      setListId(created.id);
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
      assignee_id: assignee,
    });

    if (!result.success) {
      setBusy(false);
      setError(result.error ?? 'The item could not be created.');
      return;
    }

    setBusy(false);
    router.push(`/m/p/${projectId}/punch`);
    router.refresh();
  }

  // The picker's options. "New list…" is one of them rather than a separate
  // control, so "where does this go" is a single question with a single answer.
  const listOptions = [
    ...lists.map((l) => ({ value: l.id, label: l.name })),
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

      {/* ASSIGNEE — company_members ids. See the page's note on the trap. */}
      {members.length > 0 ? (
        <div className="mt-[14px]">
          <FieldLabel>Assign to</FieldLabel>
          <OptionStack
            options={members.map((m) => ({
              value: m.id,
              label: m.display_name,
              sub: m.member_type,
            }))}
            value={assignee}
            onChange={setAssignee}
            testIdPrefix="m-punch-assignee"
          />
        </div>
      ) : null}

      {error ? <ErrorNotice message={error} testId="m-punch-create-error" /> : null}

      <PrimaryButton
        label="Create item"
        busyLabel="Creating…"
        onClick={submit}
        // NOT disabled on a missing list — A-67 wants the refusal to SAY what
        // is missing, and a disabled button says nothing. Only the offline gate
        // disables, because there the message is already on screen.
        disabled={!online}
        busy={busy}
        testId="m-punch-create"
      />
      {!ready ? (
        <p className="mt-[8px] text-center text-[12px] text-m6m-muted">
          A list and a title are required.
        </p>
      ) : null}
    </div>
  );
}
