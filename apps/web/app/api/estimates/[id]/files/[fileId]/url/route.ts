import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { resolveEstimateFileAccess } from '@/lib/site-visits/access';
import { SIGNED_URL_TTL_SECONDS } from '@/lib/services/signed-url-ttl';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import type { EstimateFileUrlResponse } from '@/lib/api-contracts/estimate-files';

// S109 #161 [RULED Josh, 161.B] — SIGN ON CLICK, NOT AT LIST TIME.
//
// The list route (`../../route.ts` GET) used to sign every file for 300 s when
// the tab loaded, and the tab only re-fetched on mount or after an upload — so
// a file clicked more than five minutes after the tab opened was a dead link.
// A live bug on the tab that prompted #161. The list now returns no URLs; the
// file sheet calls THIS when it opens a file.
//
// ⚠️ THE SAME FLOOR, IN THE SAME ORDER, AS THE LIST ROUTE. Estimate files are
// `project_id IS NULL`, which `files_select_non_client` refuses to non-owner
// roles, so the ordinary `/api/files/signed-url` (session client) cannot sign
// them and this route signs with the SERVICE ROLE. The service role bypasses
// RLS entirely, so the session read — `resolveEstimateFileAccess()`, shared
// with the list, upload and voice routes — runs FIRST and the admin client is
// never constructed before it passes (`s109-estimate-file-url-order.test.ts`,
// the s107 pattern). The file must belong to THIS estimate and company, and the
// recorder arm still sees only files they uploaded.

const BUCKET = 'project-files';

export async function GET(
  _req: Request,
  { params }: { params: { id: string; fileId: string } }
) {
  const { id: estimateId, fileId } = params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  // THE FLOOR — session reads only (no existence oracle: blocked = nonexistent).
  const access = await resolveEstimateFileAccess(supabase, user.id, estimateId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  // [S110 F] Typed, so `satisfies` below checks the real selected columns.
  const admin = getSupabaseAdmin() as SupabaseClient<Database>;
  let q = admin
    .from('files')
    .select('file_path, file_name, mime_type')
    .eq('id', fileId)
    .eq('estimate_id', estimateId)
    .eq('company_id', access.companyId)
    .eq('is_deleted', false);
  // [S110 A, Q4] the visit arm signs site-visit captures only.
  if (access.scope === 'capture') q = q.eq('site_visit_capture', true);
  const { data: file, error } = await q.maybeSingle();
  if (error) {
    console.error('[GET /api/estimates/[id]/files/[fileId]/url] lookup failed', {
      check: 'admin files select by id + estimate_id (session floor passed)',
      estimateId,
      fileId,
      mode: access.mode,
      message: error.message,
    });
    return NextResponse.json({ error: 'Could not open file' }, { status: 500 });
  }
  if (!file) {
    // Auth passed and the row genuinely is not on this estimate for this caller.
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }

  const { data: signed, error: signErr } = await admin.storage
    .from(BUCKET)
    .createSignedUrl(file.file_path, SIGNED_URL_TTL_SECONDS);
  if (signErr || !signed?.signedUrl) {
    console.error('[GET /api/estimates/[id]/files/[fileId]/url] createSignedUrl failed', {
      check: 'service-role storage sign',
      estimateId,
      fileId,
      message: signErr?.message ?? 'no signedUrl returned',
    });
    return NextResponse.json({ error: 'Could not open file' }, { status: 500 });
  }

  // [S110 F] A CONTRACT with named consumers — lib/api-contracts/registry.ts.
  return NextResponse.json({
    url: signed.signedUrl,
    file_name: file.file_name,
    mime_type: file.mime_type,
  } satisfies EstimateFileUrlResponse);
}
