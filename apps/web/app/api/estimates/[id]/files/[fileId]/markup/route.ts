import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase-server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { authorizeSiteVisitMarkup, SITE_VISIT_FROZEN_ERROR } from '@/lib/site-visits/markup-access';
import { generateThumbnail } from '@/lib/photos/thumbnail-server';
import { derivativePathFor } from '@framefocus/shared/utils/markup';
import { MARKUP_SCHEMA_VERSION } from '@framefocus/shared/types/markup';

// [S114 C-8, RULED Josh 2026-09-28] SAVE MARKUP ON A SITE-VISIT PHOTO.
//
// Site-visit captures are estimate files (`project_id IS NULL`), which the
// session's `files` / storage policies admit for Owner/Admin only — so the
// shared client save (`saveMarkup`) posts HERE for them. Authority is
// `authorizeSiteVisitMarkup()` (lib/site-visits/markup-access.ts — the header
// there says why this is a route and not wider policies). Only after it passes
// does the service role write, and it writes exactly what the client save
// writes, in the same order (A-23): `markup_data` first, then the flattened
// `.markup.jpg` derivative, then the thumbnail. The freeze trigger
// (`enforce_site_visit_file_freeze`) still fires on the row write: a photo that
// froze between the check and the write is refused by the database, and
// reported as frozen, not as success.
//
// The flatten happens in the BROWSER, with the same `flattenMarked()` every
// markup save and export uses — one rasteriser, both surfaces.

const BUCKET = 'project-files';
const MAX_DERIVATIVE_BYTES = 15 * 1024 * 1024;

export async function POST(req: Request, { params }: { params: { id: string; fileId: string } }) {
  const { id: estimateId, fileId } = params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const access = await authorizeSiteVisitMarkup(
    supabase as unknown as SupabaseClient,
    () => getSupabaseAdmin() as unknown as SupabaseClient,
    user.id,
    estimateId,
    fileId
  );
  if (!access.ok) {
    console.error('[POST /api/estimates/[id]/files/[fileId]/markup] refused', {
      check: 'authorizeSiteVisitMarkup',
      estimateId,
      fileId,
      status: access.status,
      reason: access.error,
    });
    return NextResponse.json(
      { error: access.error, frozen: access.frozen ?? false },
      { status: access.status }
    );
  }
  const { admin, file } = access;

  const form = await req.formData();
  const rawMarkup = form.get('markup');
  const derivative = form.get('derivative');
  let markup: Record<string, unknown>;
  try {
    markup = JSON.parse(typeof rawMarkup === 'string' ? rawMarkup : '') as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Markup is missing or unreadable.' }, { status: 400 });
  }
  if (
    !markup ||
    markup.version !== MARKUP_SCHEMA_VERSION ||
    !Array.isArray(markup.shapes) ||
    typeof markup.imageWidth !== 'number' ||
    typeof markup.imageHeight !== 'number'
  ) {
    return NextResponse.json({ error: 'Markup is not in the expected shape.' }, { status: 400 });
  }
  if (
    !(derivative instanceof Blob) ||
    derivative.size === 0 ||
    derivative.size > MAX_DERIVATIVE_BYTES
  ) {
    return NextResponse.json(
      { error: 'The marked-up image is missing or too large.' },
      { status: 400 }
    );
  }

  // 1. markup_data FIRST — the source of truth (A-23). Exactly one row, or it
  //    did not happen.
  const { data: stored, error: rowError } = await admin
    .from('files')
    .update({ markup_data: markup })
    .eq('id', file.id)
    .select('markup_data');
  if (rowError) {
    const frozen = rowError.code === '42501';
    console.error('[POST /api/estimates/[id]/files/[fileId]/markup] row write refused', {
      check: frozen ? 'enforce_site_visit_file_freeze (trigger)' : 'admin files update',
      estimateId,
      fileId,
      message: rowError.message,
    });
    return frozen
      ? NextResponse.json({ error: SITE_VISIT_FROZEN_ERROR, frozen: true }, { status: 409 })
      : NextResponse.json({ error: 'The marks could not be saved.' }, { status: 500 });
  }
  if ((stored ?? []).length !== 1) {
    console.error('[POST /api/estimates/[id]/files/[fileId]/markup] row write touched no row', {
      check: 'admin files update returned 0 rows',
      estimateId,
      fileId,
    });
    return NextResponse.json({ error: 'The marks could not be saved.' }, { status: 500 });
  }
  const storedMarkup = stored![0].markup_data;

  // 2. The derivative, overwritten in place at the deterministic path (A-23c).
  const { error: upErr } = await admin.storage
    .from(BUCKET)
    .upload(derivativePathFor(file.file_path), derivative, {
      contentType: 'image/jpeg',
      upsert: true,
    });
  if (upErr) {
    console.error('[POST /api/estimates/[id]/files/[fileId]/markup] derivative upload failed', {
      check: 'service-role storage upload',
      estimateId,
      fileId,
      message: upErr.message,
    });
    return NextResponse.json({
      status: 'derivative_failed',
      error: upErr.message,
      markup_data: storedMarkup,
    });
  }

  // 3. The grid thumbnail of THIS markup (its name carries the fingerprint).
  //    A failure here is not a failed save: the tile falls back to the derivative.
  const thumb = await generateThumbnail(admin, {
    file_path: file.file_path,
    mime_type: file.mime_type,
    markup_data: storedMarkup,
  });
  if (!thumb.ok && !('skipped' in thumb && thumb.skipped)) {
    console.error(
      '[POST /api/estimates/[id]/files/[fileId]/markup] thumbnail failed (save stands)',
      {
        estimateId,
        fileId,
        message: 'error' in thumb ? thumb.error : 'unknown',
      }
    );
  }

  return NextResponse.json({ status: 'saved', markup_data: storedMarkup });
}
