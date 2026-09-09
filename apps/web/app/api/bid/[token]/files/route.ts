import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { SUB_UPLOAD_TAG, bidderCanSeeFile } from '@/lib/services/sub-bid-files';

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

/** Token → the bid request, or an error response. The ONE resolution both
 *  handlers use, so GET and POST cannot drift on what a valid token is
 *  (CLAUDE.md parity: share the mechanism, not the intent). */
async function resolveToken(
  admin: ReturnType<typeof getSupabaseAdmin>,
  token: string
): Promise<
  | { ok: true; row: { estimate_id: string; company_id: string } }
  | { ok: false; res: NextResponse }
> {
  const { data: reqRow } = await admin
    .from('estimate_sub_bid_requests')
    .select('estimate_id, company_id, expires_at, is_deleted')
    .eq('token', token)
    .maybeSingle();
  if (!reqRow || reqRow.is_deleted) {
    return { ok: false, res: NextResponse.json({ error: 'This link is no longer valid.' }, { status: 404 }) };
  }
  if (reqRow.expires_at && new Date(reqRow.expires_at as string) < new Date()) {
    return { ok: false, res: NextResponse.json({ error: 'This link has expired.' }, { status: 410 }) };
  }
  return {
    ok: true,
    row: { estimate_id: reqRow.estimate_id as string, company_id: reqRow.company_id as string },
  };
}

// GET — the SCOPE DOCUMENTS the estimator attached, so the sub can bid the plans
// they are being asked to price. S107 Part B: the ruling says the sub sees
// "scope, files, and their own bid form"; only the upload half existed.
//
// ===========================================================================
// ⚠️ WHAT THIS MUST NOT RETURN, AND WHY IT IS CHECKED TWICE
// ===========================================================================
// `files` rows for an estimate include BOTH the estimator's scope documents AND
// every OTHER subcontractor's uploaded bid. This page is anonymous — the token
// is the only credential — so returning an unfiltered list would hand any
// bidder their competitors' bid PDFs. That is a money disclosure on a public
// surface, and it is the worst thing this route could do.
//
// So a row is returned ONLY if it satisfies BOTH:
//   1. `created_by IS NOT NULL` — a signed-in staff member uploaded it. A
//      service-role upload (every bid-token upload) has no auth.uid().
//   2. it does NOT carry `SUB_UPLOAD_TAG` — the positive marker POST stamps.
//
// ⚠️ Either alone would do today. Both, because they fail INDEPENDENTLY: (1)
// breaks if a future staff path forgets `created_by`; (2) breaks if a tag is
// edited off. A row must clear both to be shown, so one regression is not a
// leak. This is a deliberate belt-and-braces on an anonymous surface, not
// duplication.
export async function GET(_req: Request, { params }: { params: { token: string } }) {
  const admin = getSupabaseAdmin();
  const resolved = await resolveToken(admin, params.token);
  if (!resolved.ok) return resolved.res;
  const { estimate_id, company_id } = resolved.row;

  const { data: files, error } = await admin
    .from('files')
    .select('id, file_name, file_path, file_size, mime_type, created_at, created_by, tags')
    .eq('estimate_id', estimate_id)
    .eq('company_id', company_id)
    .eq('is_deleted', false)
    .not('created_by', 'is', null)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[GET /api/bid/[token]/files] list failed', {
      check: 'admin files select by estimate_id (token resolved; staff-uploaded only)',
      estimateId: estimate_id,
      message: error.message,
    });
    return NextResponse.json({ error: 'Could not list files' }, { status: 500 });
  }

  // The second, independent exclusion — applied here rather than in the query so
  // it is legible and cannot be silently dropped by a query rewrite.
  const staffOnly = (files ?? []).filter(bidderCanSeeFile);

  const withUrls = await Promise.all(
    staffOnly.map(async (f) => {
      const { data: signed } = await admin.storage.from(BUCKET).createSignedUrl(f.file_path, 300);
      // ⚠️ Only the fields the sub needs. `file_path`, `created_by` and `tags`
      // are deliberately NOT returned — internal storage layout and staff ids
      // are not a bidder's business, and #136's lesson is that a payload leaks
      // what the renderer hides.
      return {
        id: f.id,
        file_name: f.file_name,
        file_size: f.file_size,
        mime_type: f.mime_type,
        url: signed?.signedUrl ?? null,
      };
    })
  );
  return NextResponse.json({ files: withUrls });
}

export async function POST(req: Request, { params }: { params: { token: string } }) {
  const admin = getSupabaseAdmin();

  // Resolve the token — it is the only credential. A missing/deleted/expired token is
  // indistinguishable to the caller (no oracle). Shared with GET.
  const resolved = await resolveToken(admin, params.token);
  if (!resolved.ok) return resolved.res;
  const reqRow = resolved.row;

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
      // S107 — ⚠️ THIS ROW MUST BE IDENTIFIABLE AS SUB-UPLOADED, EXPLICITLY.
      // `created_by` is NULL here because the uploader is anonymous (the service
      // role has no auth.uid()), while the PM route stamps `user.id`. That
      // difference is real but INCIDENTAL — a future insert path that simply
      // forgot `created_by` would silently become sub-visible. The tag is the
      // POSITIVE marker, so GET below can exclude on a stated fact rather than
      // on an absence. Both are checked; see the GET's comment.
      tags: [SUB_UPLOAD_TAG],
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
