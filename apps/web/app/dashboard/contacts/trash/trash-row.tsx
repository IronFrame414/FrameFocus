'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Contact } from '@/lib/services/contacts';
import { CONTACT_TYPE_LABELS } from '@framefocus/shared/constants';
import { restoreContact } from '@/lib/services/contacts-client';

// One deleted contact, with the way back. [S158 · Finding 2]
//
// Modelled on `app/dashboard/projects/[id]/files/trash/trash-row.tsx` — the
// shipped M3 precedent Josh's ruling pointed at — with ONE deliberate omission.
//
// ⚠️ THERE IS NO "DELETE FOREVER" HERE, AND THERE MUST NOT BE. The files trash
// offers one to Owner/Admin because a file is a blob with a storage object
// behind it. A contact is not: Josh explicitly REJECTED hard delete for
// contacts and subcontractors at S154, on the grounds that they carry FKs from
// estimates, projects, invoices, payments, refunds and contracts — and
// `contacts` has NO DELETE policy at all, so the button would be an affordance
// the database refuses. (The asymmetry with `contact_addresses`, which does
// hard delete, is itself a ruling — see `20261005000000`'s table comment.)

export default function ContactTrashRow({
  contact,
  canRestore,
}: {
  contact: Contact;
  canRestore: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const name =
    [contact.first_name, contact.last_name].filter(Boolean).join(' ').trim() ||
    contact.company_name?.trim() ||
    'Unnamed contact';

  async function handleRestore() {
    setBusy(true);
    const result = await restoreContact(contact.id);
    setBusy(false);
    if (!result.success) {
      // `restoreContact` goes through `applied()`, so this fires on a write the
      // policy DISCARDED as well as on a real error. Both must reach the user:
      // a restore that silently did nothing is the defect this whole view
      // exists to end.
      alert(`Restore failed: ${result.error}`);
      return;
    }
    router.refresh();
  }

  const cellStyle = { padding: '0.75rem 0.5rem' };

  return (
    <tr style={{ borderBottom: '1px solid #f3f4f6' }} data-testid={`contact-trash-${contact.id}`}>
      <td style={{ ...cellStyle, fontWeight: 500 }}>{name}</td>
      <td style={{ ...cellStyle, color: '#6b7280' }}>{contact.company_name || '—'}</td>
      <td style={cellStyle}>
        {CONTACT_TYPE_LABELS[contact.contact_type] ?? contact.contact_type}
      </td>
      <td style={{ ...cellStyle, color: '#6b7280' }}>{contact.email || '—'}</td>
      <td style={{ ...cellStyle, color: '#6b7280' }}>
        {contact.deleted_at ? new Date(contact.deleted_at).toLocaleDateString() : '—'}
      </td>
      <td style={cellStyle}>
        {canRestore && (
          <button
            onClick={handleRestore}
            disabled={busy}
            data-testid={`contact-restore-${contact.id}`}
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
