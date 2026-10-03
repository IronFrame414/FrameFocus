import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { LOGO_BUCKET, resolveShareLink } from '@/lib/photos/share-link';

// S127 item 4e — the company LOGO on the public share page, streamed through
// the app like the photo, so the page carries no storage URL at all (the
// public `logo_url` names the storage host and the company's id). Resolved
// against the link on every request: a revoked or expired link serves nothing.
// The path is re-derived and bound to the link's own company
// (`logoStoragePath`), never taken from the request.

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
  if (!link || !link.logoPath)
    return new NextResponse('Not found', { status: 404, headers: HEADERS });
  const { data, error } = await admin.storage.from(LOGO_BUCKET).download(link.logoPath);
  if (error || !data) {
    console.error(
      `[share-logo] download failed for link ${link.linkId}: ${error?.message ?? 'no data'}`
    );
    return new NextResponse('Not found', { status: 404, headers: HEADERS });
  }
  return new NextResponse(await data.arrayBuffer(), {
    status: 200,
    headers: { ...HEADERS, 'Content-Type': data.type || 'image/png' },
  });
}
