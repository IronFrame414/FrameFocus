'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  updateMember,
  updateMemberProfile,
  type WriteOutcome,
} from '@/lib/services/members-client';
import { useT } from '@/components/i18n/language-provider';
import type { MsgKey, T } from '@/lib/i18n/messages';
import { SetMobileHeader } from '../../../mobile-header';
import {
  ErrorNotice,
  FieldLabel,
  OfflineNotice,
  OptionStack,
  PrimaryButton,
  TextField,
  useOnline,
} from '../../../write-ui';

// M6M — M-40's form. TWO TABLES, TWO WRITES, NO TRANSACTION.
//
// ===========================================================================
// ⚠️ THE A-67b PRECEDENT APPLIES, AND IT IS THE WHOLE DESIGN HERE
// ===========================================================================
// A-67b, on inline punch-list creation: "Two writes, not one … **A failed item
// insert leaves the new list behind**, which is accepted (D-60) and must not be
// 'fixed' with a cleanup that deletes a list a user may have meant to keep."
//
// Same shape, and the same answer: **the service layer offers no transaction
// across two tables, so one half can land without the other.** What this screen
// owes the user is not a rollback it cannot perform — it is an honest account of
// what actually happened. So the save reports PER HALF, and a partial success
// says so in as many words rather than showing "Saved".
//
// **A compensating rollback would be worse than the gap.** Re-writing the
// company_members half back to its previous values on a profiles refusal would
// be a third write that can itself fail, on a screen whose whole problem is that
// writes can fail — and it would discard an edit the user meant, because the
// refusal is usually a PERMISSION, not a mistake.
//
// ===========================================================================
// THE REFUSAL IS ORDINARY, NOT EXCEPTIONAL
// ===========================================================================
// `profiles_update_admin` excludes owner and admin targets and the caller's own
// row. So **an Admin editing another Admin, the Owner, or themselves gets the
// company_members half and a refused profiles half** — a normal Tuesday, not an
// edge case. The copy below names that outcome specifically instead of showing
// a generic failure, because "you cannot edit an admin's profile details" is
// actionable and "Save failed" is not.
//
// ===========================================================================
// ⚠️ EMAIL HERE IS NOT THE SIGN-IN ADDRESS
// ===========================================================================
// `profiles.email` is the display and correspondence copy; the credential is
// `auth.users.email` and is changed through Supabase Auth, which this does not
// touch. The form says so on the field, because the alternative is a user who
// "changed their email" and can no longer sign in.

// S110 H — labels are message keys, resolved with t() at render time.
const MEMBER_TYPES = [
  { value: 'crew' as const, key: 'directory.team.type.crew' as MsgKey },
  { value: 'subcontractor' as const, key: 'directory.team.type.subcontractor' as MsgKey },
];

const ACTIVE = [
  { value: 'active' as const, key: 'directory.status.active' as MsgKey },
  { value: 'inactive' as const, key: 'directory.status.inactive' as MsgKey },
];

// A hex code, not language.
const DEFAULT_TINT = '#f59e0b';

export type TeamEditable = {
  id: string;
  display_name: string;
  member_type: 'crew' | 'subcontractor';
  schedule_color: string | null;
  is_deleted: boolean;
  profile_id: string | null;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
};

function halfNote(which: 'roster' | 'profile', outcome: WriteOutcome, t: T): string | null {
  switch (outcome.status) {
    case 'ok':
      return null;
    case 'no-profile':
      return null; // Reported up front, not as a save failure.
    case 'refused':
      return which === 'profile'
        ? t('directory.team.refusedProfile')
        : t('directory.team.refusedRoster');
    case 'error':
      return which === 'profile'
        ? t('directory.team.errorProfile', { error: outcome.error })
        : t('directory.team.errorRoster', { error: outcome.error });
  }
}

export function TeamEditForm({ member }: { member: TeamEditable }) {
  const router = useRouter();
  const online = useOnline();
  const t = useT();
  const memberTypeOptions = MEMBER_TYPES.map((o) => ({ value: o.value, label: t(o.key) }));
  const activeOptions = ACTIVE.map((o) => ({ value: o.value, label: t(o.key) }));

  const [displayName, setDisplayName] = useState(member.display_name);
  const [memberType, setMemberType] = useState<string | null>(member.member_type);
  const [scheduleColor, setScheduleColor] = useState(member.schedule_color ?? '');
  const [active, setActive] = useState<string | null>(member.is_deleted ? 'inactive' : 'active');

  const [firstName, setFirstName] = useState(member.first_name);
  const [lastName, setLastName] = useState(member.last_name);
  const [email, setEmail] = useState(member.email);
  const [phone, setPhone] = useState(member.phone);

  const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState<string[]>([]);

  const ready = displayName.trim().length > 0;

  async function save() {
    if (!online) return;
    if (!ready) {
      setNotes([t('directory.team.needDisplayName')]);
      return;
    }
    setBusy(true);
    setNotes([]);

    // BOTH WRITES ARE ATTEMPTED, ALWAYS, and neither is conditional on the
    // other. Short-circuiting on the first refusal would hide the state of the
    // second, which is the thing the user needs to know.
    const roster = await updateMember(member.id, {
      display_name: displayName.trim(),
      member_type: (memberType ?? member.member_type) as 'crew' | 'subcontractor',
      schedule_color: scheduleColor.trim() || null,
      is_deleted: active === 'inactive',
    });

    const profile = await updateMemberProfile(member.profile_id, {
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      email: email.trim(),
      phone: phone.trim() || null,
    });

    setBusy(false);

    const problems = [halfNote('roster', roster, t), halfNote('profile', profile, t)].filter(
      (n): n is string => n !== null
    );

    if (problems.length > 0) {
      // ⚠️ NOT A ROLLBACK. Whatever landed stays landed (the A-67b precedent);
      // the user is told exactly which half did not, and `refresh()` re-reads so
      // the form shows the real state rather than the one they typed.
      setNotes(problems);
      router.refresh();
      return;
    }

    router.push(`/m/team/${member.id}`);
    router.refresh();
  }

  return (
    <div className="px-[18px] pb-[18px] pt-[14px]">
      <SetMobileHeader title={t('directory.edit')} sub={member.display_name} />

      <h1 className="text-[17px] font-bold leading-tight text-m6m-navy">
        {t('directory.team.editTitle')}
      </h1>

      {!online ? (
        <div className="mt-[14px]">
          <OfflineNotice what={t('directory.team.editingWhat')} testId="m-team-edit-offline" />
        </div>
      ) : null}

      <TextField
        label={t('directory.team.field.displayName')}
        value={displayName}
        onChange={setDisplayName}
        testId="m-team-edit-display-name"
        required
      />

      <div className="mt-[14px]">
        <FieldLabel>{t('directory.team.field.memberType')}</FieldLabel>
        <OptionStack
          options={memberTypeOptions}
          value={memberType}
          onChange={setMemberType}
          testIdPrefix="m-team-edit-type"
        />
      </div>

      <div className="mt-[14px]">
        <FieldLabel>{t('directory.field.status')}</FieldLabel>
        <OptionStack
          options={activeOptions}
          value={active}
          onChange={setActive}
          testIdPrefix="m-team-edit-active"
        />
      </div>

      <TextField
        label={t('directory.team.field.scheduleColour')}
        value={scheduleColor}
        onChange={setScheduleColor}
        testId="m-team-edit-color"
        placeholder={DEFAULT_TINT}
      />

      {/* ── THE PROFILE HALF ───────────────────────────────────────────────── */}
      <div className="mt-[20px] border-t border-m6m-border pt-[14px]">
        <FieldLabel>{t('directory.team.personalDetails')}</FieldLabel>

        {member.profile_id === null ? (
          // ⚠️ THE NORMAL CASE FOR MOST OF THE ROSTER, not an error. 32 of
          // rebuild-test's 33 subcontractor members are directory rows with no
          // profile — A-47's trap, stated to the user instead of showing four
          // inputs that silently write nothing.
          <p
            data-testid="m-team-edit-no-profile"
            className="mt-[6px] rounded-[10px] border border-m6m-border bg-m6m-card px-[12px] py-[10px] text-[13px] text-m6m-muted"
          >
            {t('directory.team.noProfile')}
          </p>
        ) : (
          <>
            <TextField
              label={t('directory.field.firstName')}
              value={firstName}
              onChange={setFirstName}
              testId="m-team-edit-first"
            />
            <TextField
              label={t('directory.field.lastName')}
              value={lastName}
              onChange={setLastName}
              testId="m-team-edit-last"
            />
            <TextField
              label={t('directory.team.field.emailNotSignIn')}
              value={email}
              onChange={setEmail}
              testId="m-team-edit-email"
            />
            <p className="mt-[4px] text-[12px] text-m6m-muted">{t('directory.team.emailHelp')}</p>
            <TextField
              label={t('directory.field.phone')}
              value={phone}
              onChange={setPhone}
              testId="m-team-edit-phone"
            />
          </>
        )}
      </div>

      {/* One notice per half, so a partial save says which half — a single
          merged string would lose exactly the distinction this screen exists to
          report. The first carries the testid the criterion locates. */}
      {notes.map((n, i) => (
        <ErrorNotice key={i} message={n} testId={`m-team-edit-error-${i}`} />
      ))}

      <PrimaryButton
        label={t('directory.saveChanges')}
        busyLabel={t('directory.saving')}
        onClick={save}
        disabled={!online}
        busy={busy}
        testId="m-team-edit-save"
      />
      {!ready ? (
        <p className="mt-[8px] text-center text-[12px] text-m6m-muted">
          {t('directory.team.needDisplayName')}
        </p>
      ) : null}
    </div>
  );
}
