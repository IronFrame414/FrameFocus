import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';

// S118 item 14 — "already-sent documents keep the name they were sent under".
// A sent document (an issued invoice, a sent change order and its signed copy)
// is re-rendered from live data, so it asks for the name that was in effect
// when it was SENT: project_name_at() reads the rename log
// (project_name_history, 20262090000000). A document not yet sent (a draft)
// always shows the live name. ONE resolver for every document (PARITY: lib/).
//
// `sentAt` null = not sent: the live name. A refusal or an error falls back to
// the live name and is LOGGED — never silently.

export async function projectNameAt(
  supabase: SupabaseClient<Database>,
  projectId: string,
  sentAt: string | null,
  liveName: string
): Promise<string> {
  if (!sentAt) return liveName;
  const { data, error } = await supabase.rpc('project_name_at', {
    p_project_id: projectId,
    p_at: sentAt,
  });
  if (error || typeof data !== 'string') {
    console.error('[projectNameAt] fell back to the live name', {
      projectId,
      sentAt,
      error: error?.message ?? 'no row',
    });
    return liveName;
  }
  return data;
}
