import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

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

const BUCKET = 'project-files';
const MAX_SIZE = 25 * 1024 * 1024; // 25 MB — enforced HERE, in the route, not at the bucket.
const ALLOWED_MIME = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/heic',
  'image/heif',
]);

// GET — list an estimate's files. VIEW rights (ASK-C.1): the caller need only be able to
// SELECT the estimate through their session.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const estimateId = params.id;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  // THE FLOOR — read the estimate through the SESSION client. RLS decides visibility;
  // null means blocked OR nonexistent, and the caller gets the same 404 either way (no
  // existence oracle).
  const { data: est } = await supabase
    .from('estimates')
    .select('id, company_id')
    .eq('id', estimateId)
    .single();
  if (!est) return NextResponse.json({ error: 'Estimate not found' }, { status: 404 });

  const admin = getSupabaseAdmin();
  const { data: files, error } = await admin
    .from('files')
    .select('id, file_name, file_path, file_size, mime_type, category, created_at')
    .eq('estimate_id', estimateId)
    .eq('company_id', est.company_id)
    .eq('is_deleted', false)
    .order('created_at', { ascending: false });
  if (error) {
    console.error('[GET /api/estimates/[id]/files] list failed', {
      check: 'admin files select by estimate_id (route is the floor; session read passed)',
      estimateId,
      message: error.message,
    });
    return NextResponse.json({ error: 'Could not list files' }, { status: 500 });
  }
  return NextResponse.json({ files: files ?? [] });
}

// POST — upload a file to an estimate. EDIT rights (ASK-C.1): owner/admin any DRAFT, PM own
// DRAFT — mirrors `estimates_update_manager`. Service role bypasses RLS, so the route
// enforces this itself.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const estimateId = params.id;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('company_id, role')
    .eq('user_id', user.id)
    .eq('is_deleted', false)
    .single();
  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 403 });

  // THE FLOOR + EDIT check. Session read scopes to the caller's company and their
  // visible estimates; then the draft/authorship rule is enforced here.
  const { data: est } = await supabase
    .from('estimates')
    .select('id, company_id, status, created_by')
    .eq('id', estimateId)
    .single();
  if (!est) return NextResponse.json({ error: 'Estimate not found' }, { status: 404 });

  const isOwnerAdmin = profile.role === 'owner' || profile.role === 'admin';
  const canEdit = est.status === 'draft' && (isOwnerAdmin || est.created_by === user.id);
  if (!canEdit) {
    return NextResponse.json(
      { error: 'You cannot attach files to this estimate (edit rights required on a draft you own).' },
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

  const admin = getSupabaseAdmin();
  const uniqueId = crypto.randomUUID();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `${est.company_id}/estimates/${estimateId}/${uniqueId}-${safeName}`;
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
      company_id: est.company_id,
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
  return NextResponse.json({ file: row });
}
