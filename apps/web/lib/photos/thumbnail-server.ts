import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { derivativePathFor, hasMarkup, thumbPathFor } from '@framefocus/shared/utils/markup';
import { THUMB_TRANSFORM } from './thumbnail';

// [S111 D, option A] Generate and STORE a photo's grid thumbnail — once per
// displayable write (upload, markup save), never per view.
//
// WHY STORED, NOT SIGNED PER VIEW. A `/render/image/` token can only be minted
// one Storage call per photo; measured, 80 photos cost 1.7–4.1 s per page and 3
// concurrent pages lost 5–29 tiles of 80 to "Too many connections issued to the
// database" — which also failed UPLOADS. Storing the thumbnail turns that into a
// one-time cost per photo, and the grid batch-signs thumbnails in ONE call.
//
// SOURCE: the file the photo DISPLAYS AS (D-31) — the `.markup.jpg` derivative
// when annotated, the original otherwise — through `/render/image/`, which also
// transcodes HEIC (measured), so the invisible-HEIC rows get a viewable
// thumbnail as a side effect.
//
// WRITTEN WITH THE SERVICE ROLE. Callers must have established the user's
// right to the file first (the route reads the row under the user's session).
// The bytes are a deterministic function of objects already stored, so the
// write grants nothing; READ authority over the thumbnail is the storage policy
// project_files_select_thumbnail_assigned, which checks assignment itself.

const BUCKET = 'project-files';
const SIGN_TTL_SECONDS = 60;
// Only the part after the original's name — anchored, so a sibling that merely
// starts with the same characters is never touched.
const OWN_THUMB_SUFFIX = /^(\.m[0-9a-f]{8})?\.thumb\.webp$/;

export interface ThumbSourceFile {
  file_path: string;
  mime_type: string | null;
  markup_data: unknown;
}

export type ThumbResult =
  | { ok: true; path: string; bytes: number; ms: number }
  | { ok: false; skipped: true; reason: 'not_image' }
  | { ok: false; skipped?: false; error: string };

export function isThumbnailable(mime: string | null | undefined): boolean {
  return !!mime && mime.startsWith('image/');
}

function splitPath(path: string): { folder: string; base: string } {
  const slash = path.lastIndexOf('/');
  return { folder: path.slice(0, slash), base: path.slice(slash + 1) };
}

/** Every stored thumbnail of this original, whatever markup version it shows. */
async function listThumbs(admin: SupabaseClient, originalPath: string): Promise<string[]> {
  const { folder, base } = splitPath(originalPath);
  const { data } = await admin.storage.from(BUCKET).list(folder, { search: base, limit: 100 });
  return (data ?? [])
    .map((o) => o.name)
    .filter((n) => n.startsWith(base) && OWN_THUMB_SUFFIX.test(n.slice(base.length)))
    .map((n) => `${folder}/${n}`);
}

/**
 * Storage's retry-later answer: 429, code "SlowDown", "Too many connections
 * issued to the database" — measured on rebuild-test (max_connections 60). The
 * write is an idempotent upsert of the same bytes, so a retry cannot double it.
 */
// Also transient gateway/network failures (measured: a 502 on an upload under
// the same load) — the retried write is identical, so it is equally safe.
const SLOW_DOWN = /429|SlowDown|too_many_connections|Too many connections|Bad Gateway|Service Unavailable|Gateway Timeout|\b50[234]\b|fetch failed|ECONNRESET|socket hang up/i;
const ATTEMPTS = 3;

export async function generateThumbnail(
  admin: SupabaseClient,
  file: ThumbSourceFile
): Promise<ThumbResult> {
  if (!isThumbnailable(file.mime_type)) return { ok: false, skipped: true, reason: 'not_image' };
  for (let n = 0; ; n++) {
    const r = await generateOnce(admin, file);
    if (r.ok || r.skipped || n + 1 >= ATTEMPTS || !SLOW_DOWN.test(r.error)) return r;
    await new Promise((res) => setTimeout(res, 500 * 2 ** n));
  }
}

async function generateOnce(admin: SupabaseClient, file: ThumbSourceFile): Promise<ThumbResult> {
  const started = Date.now();
  const source = hasMarkup(file.markup_data) ? derivativePathFor(file.file_path) : file.file_path;
  const target = thumbPathFor(file.file_path, file.markup_data);

  const signed = await admin.storage
    .from(BUCKET)
    .createSignedUrl(source, SIGN_TTL_SECONDS, { transform: { ...THUMB_TRANSFORM } });
  if (signed.error || !signed.data?.signedUrl) {
    return { ok: false, error: `sign ${source}: ${signed.error?.message ?? 'no signedUrl'}` };
  }

  let res: Response;
  try {
    res = await fetch(signed.data.signedUrl, { headers: { Accept: 'image/webp' } });
  } catch (e) {
    return { ok: false, error: `render fetch: ${e instanceof Error ? e.message : String(e)}` };
  }
  const type = res.headers.get('content-type') ?? '';
  if (!res.ok || !type.startsWith('image/webp')) {
    const body = (await res.text().catch(() => '')).slice(0, 200);
    return { ok: false, error: `render ${res.status} ${type}: ${body}` };
  }
  const bytes = new Uint8Array(await res.arrayBuffer());

  const up = await admin.storage
    .from(BUCKET)
    .upload(target, bytes, { contentType: 'image/webp', upsert: true });
  if (up.error) return { ok: false, error: `upload ${target}: ${up.error.message}` };

  // Older versions (a previous markup, or the plain one before markup) are
  // never selected — the name is fingerprinted — so they are only clutter.
  const stale = (await listThumbs(admin, file.file_path)).filter((p) => p !== target);
  if (stale.length) await admin.storage.from(BUCKET).remove(stale);

  return { ok: true, path: target, bytes: bytes.length, ms: Date.now() - started };
}

/** Remove every thumbnail of an original — for the permanent-delete paths. */
export async function removeThumbnails(admin: SupabaseClient, originalPath: string): Promise<number> {
  const thumbs = await listThumbs(admin, originalPath);
  if (thumbs.length) await admin.storage.from(BUCKET).remove(thumbs);
  return thumbs.length;
}
