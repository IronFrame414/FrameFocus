import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { resolveEstimateFileAccess } from '@/lib/site-visits/access';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import type {
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
    .select('id, file_name, file_size, mime_type, category, created_at')
    .eq('estimate_id', estimateId)
    .eq('company_id', access.companyId)
    .eq('is_deleted', false)
    .order('created_at', { ascending: false });
  if (access.ownFilesOnly) q = q.eq('created_by', user.id);
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
  return NextResponse.json({ files: files ?? [] } satisfies EstimateFileListResponse);
}

// POST — upload a file to an estimate. EDIT rights: owner/admin any DRAFT, PM own DRAFT
// (mirrors `estimates_update_manager`); owner/admin/PM on a SITE VISIT; and the recorder
// of a site visit while it is still one. Service role bypasses RLS, so the route enforces
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
  if (!access.canUpload) {
    return NextResponse.json(
      {
        error:
          access.mode === 'recorder'
            ? 'This visit is now an estimate — new photos are closed. Yours stay readable.'
            : 'You cannot attach files to this estimate (edit rights required on a draft you own).',
      },
      { status: 403 }
    );
  }

  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'No file provided' }, { status: 400 });
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
      .select('id, file_name, file_size, mime_type, category, created_at')
      .eq('id', clientId)
      .eq('estimate_id', estimateId)
      .maybeSingle();
    if (already) return NextResponse.json({ file: already } satisfies EstimateFileUploadResponse);
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
      category: 'other',
      file_name: file.name,
      file_path: storagePath,
      file_size: file.size,
      mime_type: mime,
      created_by: user.id,
      updated_by: user.id,
    })
    .select('id, file_name, file_size, mime_type, category, created_at')
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
  return NextResponse.json({ file: row } satisfies EstimateFileUploadResponse);
}
