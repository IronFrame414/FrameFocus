import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';
import { getDeletedContacts } from '@/lib/services/contacts';
import ContactTrashRow from './trash-row';

// ===========================================================================
// CONTACTS TRASH. [S158 · Finding 2, RULED Josh]
// ===========================================================================
//
// WHAT THIS FIXES. Soft delete started working at S154 — before that the write
// was refused outright — and the moment it did, deleting a contact became
// indistinguishable from a hard delete FROM THE USER'S SIDE: the row vanished
// and nothing in the product listed it. The data was recoverable and the
// product offered no recovery.
//
// Shape taken from `app/dashboard/projects/[id]/files/trash/page.tsx`, the M3
// precedent, rather than invented: same server-component fetch of a
// deleted-only list, same one-row-per-record table, same "← Back" link, same
// row component owning the mutation.
//
// TWO DELIBERATE DIFFERENCES FROM THAT PRECEDENT:
//
//   1. NO "Delete forever" — see `trash-row.tsx`. `contacts` has no DELETE
//      policy and hard delete was rejected by ruling.
//   2. The RESTORE affordance is gated to owner/admin/project_manager, matching
//      `contacts_update_authorized`. Foreman and crew can reach this page (they
//      can read the list, so hiding the trash from them protects nothing) but
//      the database would discard their restore, and an offered button the
//      database refuses is worse than an absent one.

export default async function ContactsTrashPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('user_id', user.id)
    .eq('is_deleted', false)
    .single();
  if (!profile) redirect('/sign-in');

  const canRestore = ['owner', 'admin', 'project_manager'].includes(profile.role);

  const deleted = await getDeletedContacts();

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1.5rem',
        }}
      >
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.25rem' }}>Trash</h1>
          <p style={{ color: '#6b7280', fontSize: '0.875rem' }}>
            Deleted contacts. Restoring one puts it back in the list exactly as it was.
          </p>
        </div>
        <Link
          href="/dashboard/contacts"
          style={{
            padding: '0.5rem 1rem',
            fontSize: '0.875rem',
            fontWeight: 600,
            background: '#fff',
            border: '1px solid #d1d5db',
            color: '#111827',
            borderRadius: '0.375rem',
            textDecoration: 'none',
          }}
        >
          ← Back to Contacts
        </Link>
      </div>

      {deleted.length === 0 ? (
        <div
          style={{
            textAlign: 'center',
            padding: '3rem',
            color: '#9ca3af',
            backgroundColor: '#f9fafb',
            borderRadius: '0.5rem',
          }}
        >
          Trash is empty.
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e5e7eb', textAlign: 'left' }}>
                <th style={{ padding: '0.75rem 0.5rem', fontWeight: 600 }}>Name</th>
                <th style={{ padding: '0.75rem 0.5rem', fontWeight: 600 }}>Company</th>
                <th style={{ padding: '0.75rem 0.5rem', fontWeight: 600 }}>Type</th>
                <th style={{ padding: '0.75rem 0.5rem', fontWeight: 600 }}>Email</th>
                <th style={{ padding: '0.75rem 0.5rem', fontWeight: 600 }}>Deleted</th>
                <th style={{ padding: '0.75rem 0.5rem', fontWeight: 600 }}></th>
              </tr>
            </thead>
            <tbody>
              {deleted.map((c) => (
                <ContactTrashRow key={c.id} contact={c} canRestore={canRestore} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
