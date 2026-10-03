import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { derivativePathFor, thumbPathFor } from '@framefocus/shared/utils/markup';
import {
  THUMB_CACHE_CONTROL,
  THUMB_NOT_FOUND_CACHE_CONTROL,
  THUMB_SOURCE_HEADER,
  type ThumbSource,
} from '@/lib/photos/thumb-proxy';

// ============================================================================
// S127 P-3 — PHOTO THUMBNAILS THROUGH A PROXY ROUTE (S125 finding 4, R2).
//
// THE PROBLEM. Thumbnails were Supabase signed URLs minted fresh on every
// render, so the URL changed every visit and the browser could cache nothing:
// the iPhone grid re-downloaded the project's thumbnails each time.
//
// THE FIX. A STABLE URL per thumbnail — `/api/photos/{id}/thumb?v={version}`,
// where `v` changes when the markup does (the stored name carries the markup
// fingerprint) — answered by the app, which re-checks authorisation on every
// request it actually receives. ⚠️ S157's ruling (no re-check per thumbnail,
// because that was a round trip per photo) is NARROWED, not overturned: behind
// a cacheable URL the round trip is per cache MISS, so the premise differs.
//
// ⚠️⚠️ HARD CONDITION: `Cache-Control: private`. A `public` header would let
// Vercel's CDN keep the bytes and serve one company's thumbnail to another
// company's user requesting the same URL. `private` means only THIS browser
// may keep it. Proven by test (s127-thumb-proxy.test.ts reads this header;
// the e2e reads it off a real response).
//
// AUTHORISATION IS THE CALLER'S, TWICE: the `files` row is read through the
// caller's RLS (a row they cannot see is a 404, never a hint), and the bytes
// are downloaded through the caller's storage client, so the storage policies
// decide too. No service role here.
// ============================================================================

// The cache contract lives in lib/photos/thumb-proxy.ts: a route file may
// export only its handlers and Next's config names.
export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest, { params }: { params: { fileId: string } }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: 'Not authenticated' },
      { status: 401, headers: { 'Cache-Control': THUMB_NOT_FOUND_CACHE_CONTROL } }
    );
  }

  const { data: file } = await supabase
    .from('files')
    .select('id, file_path, markup_data, is_deleted, mime_type')
    .eq('id', params.fileId)
    .maybeSingle();
  if (!file || file.is_deleted || !String(file.mime_type ?? '').startsWith('image/')) {
    return new NextResponse('Not found', {
      status: 404,
      headers: { 'Cache-Control': THUMB_NOT_FOUND_CACHE_CONTROL },
    });
  }

  const marked = file.markup_data !== null && file.markup_data !== undefined;
  // The stored thumbnail first; then — the ruled fallback ("a slow tile is
  // acceptable, an invisible photo is not") — the full display file.
  const candidates: Array<[ThumbSource, string]> = [
    ['thumb', thumbPathFor(file.file_path, file.markup_data)],
    ...(marked ? [['derivative', derivativePathFor(file.file_path)] as [ThumbSource, string]] : []),
    ['original', file.file_path],
  ];
  for (const [source, path] of candidates) {
    const { data } = await supabase.storage.from('project-files').download(path);
    if (data) {
      return new NextResponse(await data.arrayBuffer(), {
        status: 200,
        headers: {
          'Content-Type': data.type || 'image/webp',
          'Cache-Control': THUMB_CACHE_CONTROL,
          'X-Content-Type-Options': 'nosniff',
          [THUMB_SOURCE_HEADER]: source,
        },
      });
    }
  }
  console.error(`[photo-thumb] no readable object for file ${file.id} (user ${user.id})`);
  return new NextResponse('Not found', {
    status: 404,
    headers: { 'Cache-Control': THUMB_NOT_FOUND_CACHE_CONTROL },
  });
}
