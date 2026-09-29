import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { resolveEstimateFileAccess } from '@/lib/site-visits/access';
import { BID_SCOPE_TAG, canShareWithBidders } from '@/lib/services/sub-bid-files';

// [S112, RULED Josh] "Share with bidders" — the ONLY way a file reaches a /bid
// token. _Superseded:_ every staff file on the estimate was served to every
// bidder, site-visit photos and voice notes included.
//
// Same floor as the rest of the estimate Files route: a session, then
// resolveEstimateFileAccess(); only a caller who may edit the estimate's files
// (owner/admin on a draft, or the PM who owns it — `canUpload`) may share.
// PDFs and images only (canShareWithBidders), never a sub's own upload.

export async function POST(req: Request, { params }: { params: { id: string; fileId: string } }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const access = await resolveEstimateFileAccess(supabase, user.id, params.id);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  if (access.mode !== 'office' || !access.canUpload) {
    console.error('[POST /api/estimates/[id]/files/[fileId]/share] refused', {
      check: 'resolveEstimateFileAccess: office mode AND canUpload',
      estimateId: params.id,
      mode: access.mode,
    });
    return NextResponse.json(
      { error: 'You cannot change what bidders see on this estimate.' },
      { status: 403 }
    );
  }

  const body = (await req.json().catch(() => ({}))) as { shared?: unknown };
  if (typeof body.shared !== 'boolean') {
    return NextResponse.json({ error: 'Expected { shared: boolean }' }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  const { data: file } = await admin
    .from('files')
    .select('id, mime_type, tags')
    .eq('id', params.fileId)
    .eq('estimate_id', params.id)
    .eq('company_id', access.companyId)
    .eq('is_deleted', false)
    .maybeSingle();
  if (!file) return NextResponse.json({ error: 'File not found' }, { status: 404 });
  if (!canShareWithBidders(file as { mime_type: string; tags: string[] | null })) {
    return NextResponse.json(
      { error: 'Only PDFs and images can be shared with bidders.' },
      { status: 400 }
    );
  }

  const current = ((file as { tags: string[] | null }).tags ?? []).filter(
    (t) => t !== BID_SCOPE_TAG
  );
  const tags = body.shared ? [...current, BID_SCOPE_TAG] : current;
  const { error } = await admin.from('files').update({ tags }).eq('id', params.fileId);
  if (error) {
    console.error('[POST /api/estimates/[id]/files/[fileId]/share] update failed', {
      estimateId: params.id,
      fileId: params.fileId,
      message: error.message,
    });
    return NextResponse.json({ error: 'Could not update the file.' }, { status: 500 });
  }
  return NextResponse.json({ shared: body.shared });
}
