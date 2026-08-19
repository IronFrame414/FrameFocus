import { createClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import { getSubcontractors } from '@/lib/services/subcontractors';
import { SubcontractorsList } from './subcontractors-list';

export default async function SubcontractorsPage() {
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

  const subcontractors = await getSubcontractors();

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.25rem' }}>
            Subs & Vendors
          </h1>
          <p style={{ color: '#6b7280', fontSize: '0.875rem' }}>
            Manage your subcontractors and vendors
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          {/* The way into the trash [S158 - Finding 2]. Ungated: reading the
              deleted list needs no more permission than reading the live one,
              and the Restore button inside is what carries the role gate. */}
          <a
            href="/dashboard/subcontractors/trash"
            style={{
              padding: '0.5rem 1rem',
              fontSize: '0.875rem',
              fontWeight: 600,
              color: '#111827',
              backgroundColor: '#fff',
              border: '1px solid #d1d5db',
              borderRadius: '0.375rem',
              textDecoration: 'none',
            }}
          >
            Trash
          </a>
          {profile && ['owner', 'admin', 'project_manager'].includes(profile.role) && (
            <a
              href="/dashboard/subcontractors/new"
              style={{
                padding: '0.5rem 1rem',
                fontSize: '0.875rem',
                fontWeight: 600,
                color: '#fff',
                backgroundColor: '#2563eb',
                borderRadius: '0.375rem',
                textDecoration: 'none',
              }}
            >
              + Add Sub / Vendor
            </a>
          )}
        </div>
      </div>
      <SubcontractorsList
        subcontractors={subcontractors}
        canEdit={!!profile && ['owner', 'admin', 'project_manager'].includes(profile.role)}
      />
    </div>
  );
}
