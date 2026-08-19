import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';
import { getDeletedSubcontractors } from '@/lib/services/subcontractors';
import SubcontractorTrashRow from './trash-row';

// Subs & Vendors trash. [S158 · Finding 2, RULED Josh]
//
// The contacts trash, for the second of the two tables S154 restored soft
// delete to. Same gap, same fix, same shape — see
// `app/dashboard/contacts/trash/page.tsx` for the reasoning, which is not
// repeated here.
//
// The role gate matches `subcontractors_update_authorized`
// (owner/admin/project_manager), which is the same list as the contacts one.

export default async function SubcontractorsTrashPage() {
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

  const deleted = await getDeletedSubcontractors();

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
            Deleted subs and vendors. Restoring one puts it back in the list exactly as it was.
          </p>
        </div>
        <Link
          href="/dashboard/subcontractors"
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
          ← Back to Subs &amp; Vendors
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
                <th style={{ padding: '0.75rem 0.5rem', fontWeight: 600 }}>Company</th>
                <th style={{ padding: '0.75rem 0.5rem', fontWeight: 600 }}>Contact</th>
                <th style={{ padding: '0.75rem 0.5rem', fontWeight: 600 }}>Type</th>
                <th style={{ padding: '0.75rem 0.5rem', fontWeight: 600 }}>Trade</th>
                <th style={{ padding: '0.75rem 0.5rem', fontWeight: 600 }}>Deleted</th>
                <th style={{ padding: '0.75rem 0.5rem', fontWeight: 600 }}></th>
              </tr>
            </thead>
            <tbody>
              {deleted.map((s) => (
                <SubcontractorTrashRow key={s.id} subcontractor={s} canRestore={canRestore} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
