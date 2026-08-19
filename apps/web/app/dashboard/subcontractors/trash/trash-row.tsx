'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Subcontractor } from '@/lib/services/subcontractors';
import { restoreSubcontractor } from '@/lib/services/subcontractors-client';

// One deleted sub or vendor, with the way back. [S158 · Finding 2]
//
// `contacts/trash/trash-row.tsx`'s twin, and the same omission applies: no
// "Delete forever". `subcontractors` has no DELETE policy, and S154's ruling
// covered both tables together.
//
// ⚠️ VENDORS ARE HERE, NOT IN A THIRD TRASH. A vendor is
// `subcontractors.sub_type = 'vendor'` — the same table — so the Type column
// below distinguishes them and nothing else needs to. (The unrelated `vendor`
// on `contacts.contact_type` is M2-05 / TECH_DEBT #105 and is untouched.)

export default function SubcontractorTrashRow({
  subcontractor,
  canRestore,
}: {
  subcontractor: Subcontractor;
  canRestore: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleRestore() {
    setBusy(true);
    const result = await restoreSubcontractor(subcontractor.id);
    setBusy(false);
    if (!result.success) {
      alert(`Restore failed: ${result.error}`);
      return;
    }
    router.refresh();
  }

  const contactName = [subcontractor.contact_first_name, subcontractor.contact_last_name]
    .filter(Boolean)
    .join(' ')
    .trim();

  const cellStyle = { padding: '0.75rem 0.5rem' };

  return (
    <tr
      style={{ borderBottom: '1px solid #f3f4f6' }}
      data-testid={`sub-trash-${subcontractor.id}`}
    >
      <td style={{ ...cellStyle, fontWeight: 500 }}>{subcontractor.company_name}</td>
      <td style={{ ...cellStyle, color: '#6b7280' }}>{contactName || '—'}</td>
      <td style={cellStyle}>
        {subcontractor.sub_type === 'subcontractor' ? 'Sub' : 'Vendor'}
      </td>
      <td style={{ ...cellStyle, color: '#6b7280' }}>{subcontractor.trade_type || '—'}</td>
      <td style={{ ...cellStyle, color: '#6b7280' }}>
        {subcontractor.deleted_at
          ? new Date(subcontractor.deleted_at).toLocaleDateString()
          : '—'}
      </td>
      <td style={cellStyle}>
        {canRestore && (
          <button
            onClick={handleRestore}
            disabled={busy}
            data-testid={`sub-restore-${subcontractor.id}`}
            style={{
              padding: '0.25rem 0.75rem',
              fontSize: '0.8125rem',
              background: '#fff',
              border: '1px solid #d1d5db',
              borderRadius: '0.375rem',
              cursor: busy ? 'wait' : 'pointer',
            }}
          >
            {busy ? '…' : 'Restore'}
          </button>
        )}
      </td>
    </tr>
  );
}
