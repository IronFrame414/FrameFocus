import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { MarkupData } from '@framefocus/shared/types/markup';
import { hasMarkup } from '@framefocus/shared/utils/markup';
import { createClient } from '@/lib/supabase-server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { SIGNED_URL_TTL_SECONDS } from '@/lib/services/signed-url-ttl';
import { authorizeSiteVisitMarkup } from './markup-access';

// [S114 C-8] What BOTH site-visit markup pages (/m and desktop) load — the same
// shared authority check the save route runs (authorizeSiteVisitMarkup), then
// the ORIGINAL signed with the service role (A-23c: the editor is always fed
// the original, never the derivative). One loader, both surfaces.

export type SiteVisitMarkupPageData =
  | {
      ok: true;
      fileId: string;
      filePath: string;
      fileName: string;
      originalUrl: string;
      markup: MarkupData | null;
    }
  | { ok: false; status: number; error: string; frozen: boolean };

export async function loadSiteVisitMarkup(
  estimateId: string,
  fileId: string
): Promise<SiteVisitMarkupPageData> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, status: 401, error: 'Not signed in.', frozen: false };

  const access = await authorizeSiteVisitMarkup(
    supabase as unknown as SupabaseClient,
    () => getSupabaseAdmin() as unknown as SupabaseClient,
    user.id,
    estimateId,
    fileId
  );
  if (!access.ok)
    return { ok: false, status: access.status, error: access.error, frozen: !!access.frozen };

  const { data: signed } = await access.admin.storage
    .from('project-files')
    .createSignedUrl(access.file.file_path, SIGNED_URL_TTL_SECONDS);
  if (!signed?.signedUrl)
    return { ok: false, status: 500, error: 'Could not load the photo.', frozen: false };

  return {
    ok: true,
    fileId: access.file.id,
    filePath: access.file.file_path,
    fileName: access.file.file_name,
    originalUrl: signed.signedUrl,
    markup: hasMarkup(access.file.markup_data) ? (access.file.markup_data as MarkupData) : null,
  };
}
