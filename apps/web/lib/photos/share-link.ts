import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { derivativePathFor } from '@framefocus/shared/utils/markup';

// ============================================================================
// S127 item 4e — the public share link's SERVER half. One module for creating,
// resolving and serving, so the rules below cannot drift between the route that
// makes a link and the page that answers it.
//
// ⚠️ NOT A SIGNED URL (lib/share-image.ts, S121 ruling, stands). The token is
// app-issued, stored HASHED, resolved here on every request, revocable,
// expiring, scoped to one photo, and every page view is logged.
// ============================================================================

export const SHARE_BUCKET = 'project-files';

/** A fresh URL token and the hash that is the only thing stored. */
export function newShareToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashShareToken(token) };
}

export function hashShareToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/** A token's shape, checked before any database read. */
export function looksLikeShareToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(token);
}

/**
 * ⚠️ [RULED #2] THE MARKED-UP VERSION when markup exists — the SAME rule the
 * gallery's `displayUrl` follows (D-31), so the pre-confirm preview (which
 * shows `displayUrl`) is the image that goes public. When markup exists but the
 * derivative is MISSING, there is no marked-up image to share: null, and the
 * share is refused rather than silently publishing the unannotated original
 * the preview would not have shown.
 */
export async function resolveSharePath(
  admin: SupabaseClient,
  file: { file_path: string; markup_data: unknown }
): Promise<string | null> {
  const marked = file.markup_data !== null && file.markup_data !== undefined;
  if (!marked) return file.file_path;
  const derivative = derivativePathFor(file.file_path);
  const dir = derivative.slice(0, derivative.lastIndexOf('/'));
  const name = derivative.slice(derivative.lastIndexOf('/') + 1);
  const { data } = await admin.storage.from(SHARE_BUCKET).list(dir, { search: name });
  return (data ?? []).some((o) => o.name === name) ? derivative : null;
}

/**
 * EXACTLY what the public page may show [RULED #3, stop rule 10]: the photo
 * (served through the app), the company logo, the company name, the date.
 * ⚠️ This type IS the payload contract. Adding a field here adds it to a page
 * anyone holding the URL can read — project, address, client, file name and
 * note are excluded by ruling, and e2e/share-link-s127.spec.ts reads the page's
 * bytes to prove it.
 */
export interface PublicSharePayload {
  companyName: string;
  logoUrl: string | null;
  /** YYYY-MM-DD in the company's timezone — the day the photo was taken. */
  date: string;
}

export interface ActiveShareLink {
  linkId: string;
  companyId: string;
  sharePath: string;
  payload: PublicSharePayload;
}

/** The live link for a token, or null (unknown, revoked, expired, or its photo deleted). */
export async function resolveShareLink(
  admin: SupabaseClient,
  token: string
): Promise<ActiveShareLink | null> {
  if (!looksLikeShareToken(token)) return null;
  const { data: link } = await admin
    .from('photo_share_links')
    .select('id, company_id, file_id, share_path, expires_at, revoked_at, is_deleted')
    .eq('token_hash', hashShareToken(token))
    .maybeSingle();
  if (
    !link ||
    link.revoked_at ||
    link.is_deleted ||
    new Date(link.expires_at as string).getTime() <= Date.now()
  ) {
    return null;
  }
  const [{ data: file }, { data: company }] = await Promise.all([
    admin
      .from('files')
      .select('created_at, is_deleted, company_id')
      .eq('id', link.file_id)
      .maybeSingle(),
    admin
      .from('companies')
      .select('name, logo_url, timezone')
      .eq('id', link.company_id)
      .maybeSingle(),
  ]);
  if (!file || file.is_deleted || file.company_id !== link.company_id || !company) return null;
  const tz = (company.timezone as string | null) ?? 'America/New_York';
  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(file.created_at as string));
  return {
    linkId: link.id as string,
    companyId: link.company_id as string,
    sharePath: link.share_path as string,
    payload: {
      companyName: company.name as string,
      logoUrl: (company.logo_url as string | null) ?? null,
      date,
    },
  };
}

/** Log one view of the PAGE (the image request is not counted again). Never throws. */
export async function logShareView(
  admin: SupabaseClient,
  link: ActiveShareLink,
  userAgent: string | null
) {
  try {
    await admin.from('photo_share_link_views').insert({
      company_id: link.companyId,
      link_id: link.linkId,
      user_agent: userAgent ? userAgent.slice(0, 300) : null,
    });
    const { data } = await admin
      .from('photo_share_links')
      .select('view_count')
      .eq('id', link.linkId)
      .single();
    await admin
      .from('photo_share_links')
      .update({
        view_count: ((data?.view_count as number | undefined) ?? 0) + 1,
        last_viewed_at: new Date().toISOString(),
      })
      .eq('id', link.linkId);
  } catch (err) {
    console.error(
      `[share-link] view log failed for ${link.linkId}:`,
      err instanceof Error ? err.message : 'unknown'
    );
  }
}
