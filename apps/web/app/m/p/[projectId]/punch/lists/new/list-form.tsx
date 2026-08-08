'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createPunchList } from '@/lib/services/punch-client';
import { SetMobileHeader } from '../../../../../mobile-header';
import {
  ErrorNotice,
  OfflineNotice,
  PrimaryButton,
  TextField,
  useOnline,
} from '../../../../../write-ui';

// M6M — M-41 · NEW PUNCH LIST. D-63 [S121, Josh].
//
// ===========================================================================
// A LIST IS ITS OWN THING NOW — WHAT CHANGED AND WHAT DID NOT
// ===========================================================================
// D-63 supersedes the half of D-60 that made a list reachable ONLY as a side
// effect of creating an item. The superseded clause, quoted rather than
// rewritten, because the M-33 form still implements the rest of D-60 and a
// reader who finds only the amendment would conclude too much:
//
//   _"**Creating a list inline** calls `createPunchList(projectId, name)`
//     (`punch-client.ts:34`), which returns the new id. **It is a second write,
//     not a nested one** …"_
//
// **That inline path STAYS.** D-63 adds a front door; it does not close the
// side door. Creating a list while filing the first item into it is still the
// right flow for "I found something and there is nowhere to put it", and A-67b
// still asserts it end to end. What D-63 changes is that a list no longer has
// to be justified by an item: a foreman can lay out "Second floor", "Punch
// walk 3/4", "Client walkthrough" before anyone has found a single defect.
//
// **D-60's no-default rule is UNTOUCHED.** M-33 still refuses to submit without
// an explicit list target, and creating lists here does not make any of them a
// default. A-67 is unchanged and still passes.
//
// ===========================================================================
// NOT A ROLE SURFACE — the same trap D-60 already flagged
// ===========================================================================
// `punch_lists_insert_authenticated` admits EVERY role, subcontractors
// included (D-52 as corrected, S110). This screen therefore takes NO guard, and
// must not acquire one by analogy with `deletePunchList`, which IS Foreman+.
// Delete and create are different verbs on the same table and D-60 says so in
// as many words.
//
// ONE FIELD, and that is the whole form. `punch_lists` requires `name`;
// everything else on the table has a default or is nullable. A screen that
// invented optional fields to look less bare would be inventing schema.

export function PunchListForm({
  projectId,
  projectName,
  existingNames,
}: {
  projectId: string;
  projectName: string;
  /** Lower-cased names already on this project — for the duplicate warning. */
  existingNames: string[];
}) {
  const router = useRouter();
  const online = useOnline();

  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = name.trim();
  const ready = trimmed.length > 0;

  // A WARNING, NOT A BLOCK. `punch_lists` carries no unique constraint on
  // (project_id, name), so two lists called "Second floor" are a legal state
  // and refusing them here would invent a rule the database does not have.
  // But on a phone the likeliest cause of a duplicate is not knowing the list
  // already exists, so it is worth saying out loud before the tap.
  const duplicate = ready && existingNames.includes(trimmed.toLowerCase());

  async function submit() {
    if (!online || !ready) return;
    setBusy(true);
    setError(null);

    const result = await createPunchList(projectId, trimmed);
    if (!result.success) {
      setBusy(false);
      setError(result.error ?? 'The list could not be created.');
      return;
    }

    setBusy(false);
    // Back to M-14, which is where the list now appears — and where the items
    // that will fill it get created. `refresh()` so the new list is in the
    // picker on the next New item without a reload.
    router.push(`/m/p/${projectId}/punch`);
    router.refresh();
  }

  return (
    <div className="px-[18px] pb-[18px] pt-[14px]">
      <SetMobileHeader title="New punch list" sub={projectName} />

      <h1 className="text-[17px] font-bold leading-tight text-m6m-navy">New punch list</h1>

      {!online ? (
        <div className="mt-[14px]">
          <OfflineNotice what="Creating a punch list" testId="m-punch-list-offline" />
        </div>
      ) : null}

      <TextField
        label="List name"
        value={name}
        onChange={setName}
        testId="m-punch-list-name"
        required
        placeholder="e.g. Second floor"
      />

      {duplicate ? (
        <p
          data-testid="m-punch-list-duplicate"
          className="mt-[8px] rounded-[10px] border border-m6m-strip-border bg-m6m-strip-bg px-[12px] py-[8px] text-[13px] text-m6m-navy"
        >
          This project already has a list with that name. That is allowed — check you did not
          mean the existing one.
        </p>
      ) : null}

      {error ? <ErrorNotice message={error} testId="m-punch-list-error" /> : null}

      <PrimaryButton
        label="Create list"
        busyLabel="Creating…"
        onClick={submit}
        disabled={!online}
        busy={busy}
        testId="m-punch-list-create"
      />
      {!ready ? (
        <p className="mt-[8px] text-center text-[12px] text-m6m-muted">A name is required.</p>
      ) : null}
    </div>
  );
}
