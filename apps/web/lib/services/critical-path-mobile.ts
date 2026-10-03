import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import type { CpInput } from '@framefocus/shared/utils/critical-path';
import { createClient } from '@/lib/supabase-server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { canSeeCriticalPathTab } from '@/lib/critical-path/access';
import { ensureScheduleFresh } from '@/lib/critical-path/recompute';
import { loadCriticalPathData } from '@/lib/critical-path/load';

// S122 Part 9 — the /m Critical Path card's READ, as a data-layer service: the
// same freshness check and the same caller-scoped load the desktop tab uses.
// Null unless the role sees the desktop Critical Path tab AND the project is on
// Critical Path. (A service, so /m's page does not import the recompute's
// notification layer directly — the S110 /m guard walks pages, not services.)
export async function getMobileCriticalPath(projectId: string, role: string | null): Promise<CpInput | null> {
  if (!canSeeCriticalPathTab(role)) return null;
  // [S127 P-4, finding 7] A project NOT on Critical Path answers null — and used
  // to find that out only AFTER a freshness check and the full load. One small
  // read first; the answer is the same, the work is not.
  const supabase = await createClient();
  const { data: settings } = await supabase
    .from('project_schedule_settings')
    .select('critical_path_enabled')
    .eq('project_id', projectId)
    // One LIVE row per project (project_schedule_settings_live_unique); a
    // soft-deleted one beside it would make maybeSingle() error.
    .eq('is_deleted', false)
    .maybeSingle();
  if (!settings?.critical_path_enabled) return null;
  const fresh = await ensureScheduleFresh(getSupabaseAdmin() as SupabaseClient<Database>, projectId);
  if (fresh.status === 'failed') console.error(`[m schedule] recompute ${projectId}: ${fresh.error}`);
  const loaded = await loadCriticalPathData(supabase as unknown as SupabaseClient<Database>, projectId);
  if (!loaded.ok) {
    console.error(`[m schedule] critical path load ${projectId}: ${loaded.error}`);
    return null;
  }
  return loaded.data.settings?.critical_path_enabled ? loaded.data.input : null;
}
