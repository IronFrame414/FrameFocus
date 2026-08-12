'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { acknowledgeTrialWarning } from '@/lib/services/trial-client';

/**
 * S138 — the acknowledgement button (Part 3.2).
 *
 * ⚠️ THIS IS THE PROOF-OF-NOTICE MECHANISM. An email cannot be acknowledged —
 * delivery is not receipt, and S136 found mail being accepted by Resend and
 * discarded at Gmail. A row here is the only evidence that a named human, at a
 * known time, saw a specific warning.
 *
 * The button does not say what is being acknowledged. It cannot: TL-23 is with
 * legal, and "I understand my data will be deleted on <date>" is exactly the
 * unreviewed wording this feature is forbidden from inventing. The label is
 * neutral and the copy gap above it is explicit.
 */
export function AcknowledgeButton({
  warningKind,
  alreadyAcknowledged,
}: {
  warningKind: 'day_7' | 'day_3';
  alreadyAcknowledged: boolean;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (alreadyAcknowledged) {
    return (
      <p className="text-sm text-gray-600" data-testid="already-acknowledged">
        You acknowledged this notice.
      </p>
    );
  }

  async function onClick() {
    setSaving(true);
    setError(null);
    try {
      await acknowledgeTrialWarning(warningKind);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not record the acknowledgement');
      setSaving(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={onClick}
        disabled={saving}
        data-testid="acknowledge-warning"
        className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
      >
        {saving ? 'Recording…' : 'I have seen this notice'}
      </button>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
    </div>
  );
}
