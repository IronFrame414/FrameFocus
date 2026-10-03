import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase-server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { newShareToken, resolveSharePath } from '@/lib/photos/share-link';

// S127 item 4e — CREATE a public share link for ONE photo. Owner/Admin.
// The row is written through the CALLER's client, so RLS
// (`photo_share_links_insert_owner_admin`: role, company, a live image) decides;
// the service role is used only to check the marked-up derivative exists. The
// plain token is returned ONCE, in the URL, and only its hash is stored.

const schema = z.object({ fileId: z.string().uuid() });

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('user_id', user.id)
    .eq('is_deleted', false)
    .maybeSingle();
  if (!profile || !['owner', 'admin'].includes(profile.role)) {
    console.error(
      `[photo-share-links] denied: user=${user.id} role=${profile?.role ?? 'none'} — Owner/Admin only`
    );
    return NextResponse.json(
      { error: 'Only an Owner or Admin can share a photo publicly.' },
      { status: 403 }
    );
  }

  let parsed;
  try {
    parsed = schema.safeParse(await request.json());
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!parsed.success)
    return NextResponse.json({ error: 'A photo id is required.' }, { status: 400 });

  const { data: file } = await supabase
    .from('files')
    .select('id, file_path, markup_data, mime_type, is_deleted')
    .eq('id', parsed.data.fileId)
    .maybeSingle();
  if (!file || file.is_deleted || !String(file.mime_type).startsWith('image/')) {
    return NextResponse.json({ error: 'That photo is not available to share.' }, { status: 404 });
  }

  const sharePath = await resolveSharePath(getSupabaseAdmin(), file);
  if (!sharePath) {
    return NextResponse.json(
      {
        error:
          'The marked-up version of this photo is not ready yet, so it cannot be shared. Open it again shortly.',
      },
      { status: 409 }
    );
  }

  const { token, hash } = newShareToken();
  const { data: row, error } = await supabase
    .from('photo_share_links')
    .insert({ file_id: file.id, share_path: sharePath, token_hash: hash })
    .select('id, expires_at')
    .single();
  if (error || !row) {
    console.error(
      `[photo-share-links] insert refused for user=${user.id}: ${error?.message ?? 'no row'}`
    );
    return NextResponse.json(
      { error: 'The link was not created.' },
      { status: error?.code === '42501' ? 403 : 400 }
    );
  }
  return NextResponse.json({
    id: row.id,
    url: `${request.nextUrl.origin}/share/p/${token}`,
    expiresAt: row.expires_at,
  });
}
