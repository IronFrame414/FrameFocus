import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';
import { getMyProfile } from '@/lib/services/profiles';
import { cardStyle, color, microLabelStyle } from '@/lib/theme';
import { PhotoLinkRows, type PhotoLinkRow } from './photo-link-rows';

// S127 item 4e — EVERY ACTIVE PUBLIC PHOTO LINK, WITH ONE-CLICK REVOKE.
// ⚠️ [RULED, stop rule 11] "A link that cannot be turned off is the thing that
// bites" — this list is not optional and not a later enhancement. Owner/Admin
// (the RLS on photo_share_links). Bounded and ordered by what it is bounded on.

export const PHOTO_LINKS_LIMIT = 200;

export default async function PhotoLinksPage() {
  const profile = await getMyProfile();
  if (!profile) redirect('/sign-in');
  if (!['owner', 'admin'].includes(profile.role)) redirect('/dashboard');

  const supabase = await createClient();
  const { data } = await supabase
    .from('photo_share_links')
    .select(
      'id, created_at, expires_at, view_count, last_viewed_at, file:files(file_name, project:projects(name))'
    )
    .is('revoked_at', null)
    .eq('is_deleted', false)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(PHOTO_LINKS_LIMIT);

  const rows: PhotoLinkRow[] = (
    (data ?? []) as unknown as {
      id: string;
      created_at: string;
      expires_at: string;
      view_count: number;
      last_viewed_at: string | null;
      file: { file_name: string; project: { name: string } | null } | null;
    }[]
  ).map((r) => ({
    id: r.id,
    fileName: r.file?.file_name ?? '—',
    projectName: r.file?.project?.name ?? '—',
    createdAt: r.created_at,
    expiresAt: r.expires_at,
    views: r.view_count,
    lastViewedAt: r.last_viewed_at,
  }));

  return (
    <div>
      <p style={{ ...microLabelStyle, margin: '0 0 6px' }}>
        Public photo links · {rows.length} active
      </p>
      <p style={{ color: color.muted, fontSize: '13px', margin: '0 0 14px' }}>
        Anyone with one of these links can see that photo. Revoke a link and it stops working
        immediately.
      </p>
      {rows.length === 0 ? (
        <div
          style={{ ...cardStyle, padding: '32px', textAlign: 'center', color: color.muted }}
          data-testid="photo-links-empty"
        >
          No active public links.
        </div>
      ) : (
        <PhotoLinkRows rows={rows} />
      )}
    </div>
  );
}
