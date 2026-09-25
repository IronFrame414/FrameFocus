import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { generateThumbnail } from '@/lib/photos/thumbnail-server';

// [S111 D, option A] POST { fileId } — (re)generate that photo's stored grid
// thumbnail. Called fire-and-forget after an image upload and after a markup
// save (lib/photos/request-thumbnail.ts), from both surfaces.
//
// WHO MAY TRIGGER IT: anyone who can READ the file's row — checked by reading
// it under the CALLER's session, so `files` RLS decides. That is the right
// authority HERE because the row is the photo's own record; what this route
// then writes is a deterministic derivative of bytes already stored, with the
// service role. It cannot choose the content, and it grants no read: reading a
// thumbnail is project_files_select_thumbnail_assigned, which checks project
// assignment itself.
//
// ERRORS (CLAUDE.md): an unreadable row is 403, never 404 — RLS conflates "not
// yours" with "not there", so this layer cannot claim which. Every non-2xx logs
// the real cause with the route and the failing check.

const ROUTE = 'POST /api/photos/thumbnail';

export async function POST(request: Request) {
  let fileId: unknown;
  try {
    ({ fileId } = (await request.json()) as { fileId?: unknown });
  } catch {
    console.error(`[${ROUTE}] 400 body is not JSON`);
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
  if (typeof fileId !== 'string' || !/^[0-9a-f-]{36}$/i.test(fileId)) {
    console.error(`[${ROUTE}] 400 fileId missing or not a uuid`, { fileId });
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    console.error(`[${ROUTE}] 401 no session`, { fileId });
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  }

  const { data: file, error } = await supabase
    .from('files')
    .select('id, file_path, mime_type, markup_data, is_deleted')
    .eq('id', fileId)
    .maybeSingle();
  if (error || !file) {
    console.error(`[${ROUTE}] 403 row not readable under the caller's session`, {
      fileId,
      userId: user.id,
      error: error?.message ?? 'no row',
    });
    return NextResponse.json({ error: 'You do not have access to this file' }, { status: 403 });
  }

  const result = await generateThumbnail(getSupabaseAdmin(), file);
  if (result.ok) return NextResponse.json({ ok: true, path: result.path, bytes: result.bytes, ms: result.ms });
  if (result.skipped) return NextResponse.json({ ok: false, skipped: result.reason });

  console.error(`[${ROUTE}] 502 generation failed`, { fileId, error: result.error });
  return NextResponse.json({ error: 'Thumbnail could not be generated' }, { status: 502 });
}
