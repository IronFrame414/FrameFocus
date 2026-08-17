'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setClientContractsEnabled } from '@/lib/services/contracts-client';
import { brand } from '@/lib/brand';
import { cardStyle, color, microLabelStyle } from '@/lib/theme';

// 7I §5.2, §12.1 — Company Settings: the MASTER half of the two-level
// client-contract toggle. Stage 1, slice 1.
//
// On-screen product name comes from lib/brand.ts, never a literal (S136).
//
// ⚠️ THE DEFAULT IS OFF, AND OFF IS LOAD-BEARING. §12.1's first acceptance
// criterion is that with this off, "nothing about client contracts appears
// anywhere and behaviour is byte-identical to today". That is currently true by
// construction rather than by care: `clientContractAppliesToEstimate()` is the
// only reader of the column, and at this commit NOTHING in `app/` calls it. The
// send route, the signing page and conversion are untouched. Whoever wires the
// first consumer (stage 2) inherits the obligation to keep the off path inert.
//
// ⚠️ THIS IS ONE HALF OF A TWO-LEVEL TOGGLE. Turning it on does not put a
// contract on any job — §5.2's per-proposal flag (`estimates.include_client_
// contract`) decides that, one job at a time. The copy below says so, because a
// master switch that reads as "every proposal now carries a contract" is the
// one misunderstanding that would matter on a legal document.

export function ContractSettingsForm({
  companyId,
  enabled,
}: {
  companyId: string;
  enabled: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [on, setOn] = useState(enabled);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle(next: boolean) {
    // Optimistic, then reverted on failure. A switch that stays where the user
    // put it while the write was refused is a switch that lies about the state
    // of a legal document flow.
    const previous = on;
    setOn(next);
    setBusy(true);
    setSaved(false);
    setError(null);

    const result = await setClientContractsEnabled(companyId, next);
    setBusy(false);

    if (!result.success) {
      setOn(previous);
      setError(result.error ?? 'Could not save.');
      return;
    }
    setSaved(true);
    startTransition(() => router.refresh());
  }

  return (
    <div style={{ ...cardStyle, padding: '20px', marginTop: '20px' }}>
      <p style={{ ...microLabelStyle, marginBottom: '6px' }}>Client contracts</p>
      <p
        style={{
          fontSize: '12.5px',
          color: color.muted,
          margin: '0 0 16px',
          maxWidth: '640px',
        }}
      >
        Turn this on if your company sends a written contract alongside its proposals.{' '}
        {brand.shortName} does not supply contract wording — you upload your own
        counsel-approved form and place boxes over its blanks, the same way release forms work.
      </p>

      {error && (
        <p style={{ color: color.danger, fontSize: '13px', margin: '0 0 12px' }}>{error}</p>
      )}

      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontSize: '13.5px',
          color: color.body,
        }}
      >
        <input
          type="checkbox"
          checked={on}
          disabled={busy}
          onChange={(e) => void toggle(e.target.checked)}
        />
        Use client contracts
        {saved && (
          <span style={{ color: color.success, fontSize: '12px', marginLeft: '4px' }}>Saved</span>
        )}
      </label>

      <p
        style={{
          fontSize: '11.5px',
          color: color.faint,
          margin: '8px 0 0',
          maxWidth: '640px',
        }}
      >
        {on
          ? 'Each proposal still decides for itself whether to include a contract — this only makes the option available.'
          : 'While this is off, proposals send exactly as they do today. Nothing about contracts appears anywhere else in the app.'}
      </p>
    </div>
  );
}
