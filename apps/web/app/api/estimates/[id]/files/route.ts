import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { resolveEstimateFileAccess } from '@/lib/site-visits/access';
import { generateThumbnail } from '@/lib/photos/thumbnail-server';
import { BID_SCOPE_TAG } from '@/lib/services/sub-bid-files';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import type {
  EstimateFileListItem,
  EstimateFileListResponse,
  EstimateFileUploadResponse,
} from '@/lib/api-contracts/estimate-files';

// S106 Part C [RULED Josh, Option A] — the estimate Files route.
//
// ⚠️ THE ROUTE IS THE ONLY ACCESS CONTROL. `files_select_non_client` /
// `files_insert_non_client` both require `project_id IS NOT NULL` for every
// non-owner/admin role, and an estimate file is `project_id IS NULL`. So a PM — a
// first-class estimate author — can neither list nor upload estimate files through the
// ordinary session client. This route reads the estimate through the CALLER'S SESSION
// client first (RLS applies: `estimates_select_authenticated` = owner/admin any, PM own),
// and ONLY THEN uses the service-role client — which bypasses RLS entirely. If the session
// read is wrong, skipped, or bypassed, a caller reaches any estimate's files in the
// company, and four of the company-level rows are contracts. The session read is the floor;
// it is never optional and the admin client is never used before it passes.
//
// [S108 Spec A, Q3 → A] THE FLOOR GAINED A SECOND ARM — "did you record this visit".
// A foreman or crew member who records a site visit can never SELECT its estimate (the
// row carries money), so the S106 floor would lock them out of their own photos. The
// decision now lives in `resolveEstimateFileAccess()` (lib/site-visits/access.ts), shared
// with the voice route, and is STILL made entirely on the session before the admin client:
//   · office arm   — unchanged, plus owner/admin/PM may attach to a site visit;
//   · recorder arm — from the money-free `site_visits` table: READ their own files,
//     before and after promotion; UPLOAD only while it is still a site visit.
// §7a is untouched: `files_insert_non_client` still refuses a project-less row for
// foreman and crew. Their photo does not go through that policy at all.

const BUCKET = 'project-files';
const MAX_SIZE = 25 * 1024 * 1024; // 25 MB — enforced HERE, in the route, not at the bucket.
const ALLOWED_MIME = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/heic',
  'image/heif',
]);

// GET — list an estimate's files. VIEW rights: the office arm sees every file; the
// recorder arm sees only the files THEY uploaded.
/** [S112] The list row: `tags` stays server-side; the tab gets one boolean. */
function toListItem(r: {
  id: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  category: string;
  created_at: string | null;
  site_visit_capture: boolean;
  tags: string[] | null;
}): EstimateFileListItem {
  const { tags, ...rest } = r;
  return { ...rest, shared_with_bidders: (tags ?? []).includes(BID_SCOPE_TAG) };
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const estimateId = params.id;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  // THE FLOOR — session reads only. A null answer (blocked OR nonexistent) is the same
  // 404 either way (no existence oracle).
  const access = await resolveEstimateFileAccess(supabase, user.id, estimateId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  // [S110 F] Typed, so `satisfies` below checks the real selected columns.
  const admin = getSupabaseAdmin() as SupabaseClient<Database>;
  let q = admin
    .from('files')
    .select('id, file_name, file_size, mime_type, category, created_at, site_visit_capture, tags')
    .eq('estimate_id', estimateId)
    .eq('company_id', access.companyId)
    .eq('is_deleted', false)
    .order('created_at', { ascending: false });
  // [S110 A, RULED Q4] a VISIT-arm caller (foreman, crew, a PM who does not
  // own the estimate) sees ONLY site-visit captures — never the estimate's other
  // files. _Superseded, quoted:_ `if (access.ownFilesOnly) q = q.eq('created_by', user.id);`
  if (access.scope === 'capture') q = q.eq('site_visit_capture', true);
  const { data: files, error } = await q;
  if (error) {
    console.error('[GET /api/estimates/[id]/files] list failed', {
      check: 'admin files select by estimate_id (route is the floor; session read passed)',
      estimateId,
      mode: access.mode,
      message: error.message,
    });
    return NextResponse.json({ error: 'Could not list files' }, { status: 500 });
  }

  // S109 #161 [RULED 161.B] — NO URLs AT LIST TIME. _Superseded, quoted: "Signed
  // URLs, admin-generated … signing here is in-scope"_ — correct about WHO may
  // sign, wrong about WHEN: each URL lived 300 s and the tab only re-listed on
  // mount/upload, so a click after five minutes hit a dead link. The client now
  // signs one file on click via `./[fileId]/url`, behind this same floor.
  // `file_path` is not returned either: nothing in the tab needs it.
  // [S110 F] The response is a CONTRACT with named consumers — see
  // lib/api-contracts/registry.ts before changing its shape.
  return NextResponse.json({
    files: (files ?? []).map(toListItem),
  } satisfies EstimateFileListResponse);
}

// POST — upload a file to an estimate. An ordinary upload: owner/admin any DRAFT, PM own
// DRAFT (mirrors `estimates_update_manager`). A site-visit CAPTURE (`capture=1`): any
// internal employee on the visit, at every status [S110 ruling 3]. _Superseded: "owner/
// admin/PM on a SITE VISIT; and the recorder of a site visit while it is still one."_ Service role bypasses RLS, so the route enforces
// this itself — BEFORE the admin client exists.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const estimateId = params.id;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const access = await resolveEstimateFileAccess(supabase, user.id, estimateId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const form = await req.formData();
  // [S110 A] `capture=1` — the upload comes from the site-visit record. It is
  // allowed at EVERY status for any internal employee on the visit (ruling 3)
  // and is marked site_visit_capture, which is what lets foreman and crew read
  // it. Anything else is an ordinary Files-tab upload: a draft you may edit.
  const capture = form.get('capture') === '1';
  if (capture ? !access.canCapture : !access.canUpload) {
    return NextResponse.json(
      {
        error: capture
          ? 'You cannot add to this site visit.'
          : 'You cannot attach files to this estimate (edit rights required on a draft you own).',
      },
      { status: 403 }
    );
  }

  const file = form.get('file');
  if (!(file instanceof File))
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: 'File too large. Max size is 25 MB.' }, { status: 400 });
  }
  const mime = file.type || '';
  if (!ALLOWED_MIME.has(mime)) {
    return NextResponse.json(
      { error: 'File type not allowed. Use PDF, JPEG, PNG, or HEIC.' },
      { status: 400 }
    );
  }
  // [S108] Optional client-generated id: an offline-queue replay lands ONE row.
  const rawId = form.get('id');
  const clientId = typeof rawId === 'string' && /^[0-9a-f-]{36}$/i.test(rawId) ? rawId : null;

  // [S110 F] Typed, so `satisfies` below checks the real selected columns.
  const admin = getSupabaseAdmin() as SupabaseClient<Database>;
  if (clientId) {
    const { data: already } = await admin
      .from('files')
      .select('id, file_name, file_size, mime_type, category, created_at, site_visit_capture, tags')
      .eq('id', clientId)
      .eq('estimate_id', estimateId)
      .maybeSingle();
    if (already)
      return NextResponse.json({ file: toListItem(already) } satisfies EstimateFileUploadResponse);
  }

  const uniqueId = clientId ?? crypto.randomUUID();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `${access.companyId}/estimates/${estimateId}/${uniqueId}-${safeName}`;
  const bytes = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await admin.storage
    .from(BUCKET)
    .upload(storagePath, bytes, { contentType: mime, upsert: false });
  if (uploadError) {
    console.error('[POST /api/estimates/[id]/files] storage upload failed', {
      estimateId,
      message: uploadError.message,
    });
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }

  const { data: row, error: insertError } = await admin
    .from('files')
    .insert({
      ...(clientId ? { id: clientId } : {}),
      company_id: access.companyId,
      project_id: null,
      estimate_id: estimateId,
      // [S111 Part Two, RULED Q14 → D] An IMAGE is a photo from the moment it is
      // written, so it lands under Photos (where markup lives) when the estimate
      // converts. _Superseded, quoted:_ `category: 'other',` — every site-visit
      // photo and estimate attachment was filed as 'other' and arrived on the
      // project under Files. PDFs stay 'other'. Nothing before conversion reads
      // an estimate file's category (the list keys on estimate_id), and the
      // conversion also reclassifies images still 'other' — so rows written
      // before this line are caught there (20261770000000).
      category: mime.startsWith('image/') ? 'photos' : 'other',
      site_visit_capture: capture,
      file_name: file.name,
      file_path: storagePath,
      file_size: file.size,
      mime_type: mime,
      created_by: user.id,
      updated_by: user.id,
    })
    .select('id, file_name, file_size, mime_type, category, created_at, site_visit_capture, tags')
    .single();
  if (insertError || !row) {
    // Cleanup the orphaned blob so a failed insert leaves nothing behind.
    await admin.storage.from(BUCKET).remove([storagePath]);
    console.error('[POST /api/estimates/[id]/files] file row insert failed', {
      estimateId,
      message: insertError?.message,
    });
    return NextResponse.json({ error: 'Could not store the file.' }, { status: 500 });
  }
  // [S111 D] The stored grid thumbnail, generated here because this route
  // already holds the service role and the access floor has passed. Awaited so
  // a serverless runtime does not drop it after the response; a failure is
  // logged and NEVER fails the upload — the grid falls back to the full file.
  if (mime.startsWith('image/')) {
    const thumb = await generateThumbnail(admin as unknown as SupabaseClient, {
      file_path: storagePath,
      mime_type: mime,
      markup_data: null,
    });
    if (!thumb.ok && !thumb.skipped) {
      console.error('[POST /api/estimates/[id]/files] thumbnail generation failed', {
        estimateId,
        error: thumb.error,
      });
    }
  }
  return NextResponse.json({ file: toListItem(row) } satisfies EstimateFileUploadResponse);
}
