'use client';

// S121 5-G — the desktop team profile's schedule colour. The SAME picker as
// /m's team edit (components/schedule/colour-picker.tsx), saved through the
// same updateMember() (RLS company_members_update_authorized: Owner/Admin).
// SUPERSEDED: the desktop team profile had no colour field at all (parity gap,
// S121 §1.2 finding 2).

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useT } from '@/components/i18n/language-provider';
import { ColourPicker } from '@/components/schedule/colour-picker';
import { updateMember } from '@/lib/services/members-client';

export function ScheduleColourSection({
  memberId,
  memberType,
  trade,
  value,
}: {
  memberId: string;
  memberType: string | null;
  trade: string | null;
  value: string | null;
}) {
  const t = useT();
  const router = useRouter();
  const [colour, setColour] = useState<string | null>(value);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <section data-testid="team-schedule-colour" className="mt-6 rounded border p-4">
      <h2 className="mb-2 text-lg font-semibold">{t('sched.colour.label')}</h2>
      <ColourPicker
        memberId={memberId}
        memberType={memberType}
        trade={trade}
        value={colour}
        onChange={setColour}
        testIdPrefix="team-colour"
      />
      {memberType !== 'subcontractor' ? (
        <button
          type="button"
          data-testid="team-colour-save"
          disabled={busy || colour === value}
          onClick={async () => {
            setBusy(true);
            setMsg(null);
            const r = await updateMember(memberId, { schedule_color: colour });
            setBusy(false);
            setMsg(t(r.status === 'ok' ? 'sched.colour.saved' : 'sched.colour.refused'));
            if (r.status === 'ok') router.refresh();
          }}
          className="mt-3 rounded bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {t('sched.colour.save')}
        </button>
      ) : null}
      {msg ? (
        <p data-testid="team-colour-msg" className="mt-2 text-sm">
          {msg}
        </p>
      ) : null}
    </section>
  );
}
