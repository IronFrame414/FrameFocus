import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { SHARE_BUCKET, resolveShareLink } from '@/lib/photos/share-link';

// S127 item 4e — the shared photo's BYTES, streamed through the app on every
// request, resolved against the link each time: a revoked or expired link
// stops serving at once. ⚠️ No storage URL — signed or public — ever leaves the
// server. ⚠️ `private, no-store`: no CDN or shared cache may keep a copy that
// would outlive a revoke or be served to anyone else.

export const dynamic = 'force-dynamic';

const HEADERS = {
  'Cache-Control': 'private, no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex, nofollow',
  'X-Content-Type-Options': 'nosniff',
};

export async function GET(_request: NextRequest, { params }: { params: { token: string } }) {
  const admin = getSupabaseAdmin();
  const link = await resolveShareLink(admin, params.token);
  if (!link) return new NextResponse('Not found', { status: 404, headers: HEADERS });
  const { data, error } = await admin.storage.from(SHARE_BUCKET).download(link.sharePath);
  if (error || !data) {
    console.error(
      `[share-image] download failed for link ${link.linkId}: ${error?.message ?? 'no data'}`
    );
    return new NextResponse('Not found', { status: 404, headers: HEADERS });
  }
  return new NextResponse(await data.arrayBuffer(), {
    status: 200,
    headers: { ...HEADERS, 'Content-Type': data.type || 'image/jpeg' },
  });
}
