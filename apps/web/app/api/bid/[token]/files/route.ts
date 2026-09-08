import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

// S106 Part C — the SUB upload path. `/bid/[token]` is anonymous; the TOKEN is the
// credential (same model as get_sub_bid_request / submit_sub_bid_reply). The sub's file
// lands on the estimate behind the token via the service-role client, exactly like the PM
// desktop route — one mechanism, two authorizers (there: a session; here: a bid token).
// It carries to the project on conversion like any estimate file.

const BUCKET = 'project-files';
const MAX_SIZE = 25 * 1024 * 1024; // 25 MB, enforced in the route.
const ALLOWED_MIME = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/heic',
  'image/heif',
]);

export async function POST(req: Request, { params }: { params: { token: string } }) {
  const token = params.token;
  const admin = getSupabaseAdmin();

  // Resolve the token — it is the only credential. A missing/deleted/expired token is
  // indistinguishable to the caller (no oracle).
  const { data: reqRow } = await admin
    .from('estimate_sub_bid_requests')
    .select('estimate_id, company_id, expires_at, is_deleted')
    .eq('token', token)
    .maybeSingle();
  if (!reqRow || reqRow.is_deleted) {
    return NextResponse.json({ error: 'This link is no longer valid.' }, { status: 404 });
  }
  if (reqRow.expires_at && new Date(reqRow.expires_at as string) < new Date()) {
    return NextResponse.json({ error: 'This link has expired.' }, { status: 410 });
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

  const uniqueId = crypto.randomUUID();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `${reqRow.company_id}/estimates/${reqRow.estimate_id}/bid-${uniqueId}-${safeName}`;
  const bytes = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await admin.storage
    .from(BUCKET)
    .upload(storagePath, bytes, { contentType: mime, upsert: false });
  if (uploadError) {
    console.error('[POST /api/bid/[token]/files] storage upload failed', {
      estimateId: reqRow.estimate_id,
      message: uploadError.message,
    });
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }

  const { data: row, error: insertError } = await admin
    .from('files')
    .insert({
      company_id: reqRow.company_id,
      project_id: null,
      estimate_id: reqRow.estimate_id,
      category: 'other',
      file_name: file.name,
      file_path: storagePath,
      file_size: file.size,
      mime_type: mime,
    })
    .select('id, file_name')
    .single();
  if (insertError || !row) {
    await admin.storage.from(BUCKET).remove([storagePath]);
    console.error('[POST /api/bid/[token]/files] file row insert failed', {
      estimateId: reqRow.estimate_id,
      message: insertError?.message,
    });
    return NextResponse.json({ error: 'Could not store the file.' }, { status: 500 });
  }
  return NextResponse.json({ file: row });
}
