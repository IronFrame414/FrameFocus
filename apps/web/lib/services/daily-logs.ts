import { createClient } from '@/lib/supabase-server';
import type { Database } from '@framefocus/shared/types/database';

// 6B Daily Logs — server reads (6B-1 spec §3/§3a; data spec 6B-spec.md).
// Visibility is RLS-governed: daily_logs_select_visible = company scope +
// can_view_project(project_id). Trash-bin pattern per CLAUDE.md: the list
// filters is_deleted, the single-row fetch does not.

export type DailyLog = Database['public']['Tables']['daily_logs']['Row'];

export interface DailyLogListItem extends DailyLog {
  author: { display_name: string } | null;
}

export interface DailyLogCrewEntry {
  id: string;
  member_id: string;
  is_deleted: boolean | null;
  member: { display_name: string } | null;
}

export interface DailyLogSubEntry {
  id: string;
  member_id: string;
  hours: number;
  note: string | null;
  is_deleted: boolean | null;
  member: { display_name: string } | null;
}

export interface DailyLogDetail extends DailyLogListItem {
  crew: DailyLogCrewEntry[];
  sub_entries: DailyLogSubEntry[];
}

/** One member's presence + derived hours for a project-day (RPC, §5). */
export interface DayPresence {
  member_id: string;
  hours: number;
  warranty_only: boolean;
}

/** files row subset for the 4c photo grid. */
export type LogPhoto = Pick<
  Database['public']['Tables']['files']['Row'],
  'id' | 'file_name' | 'file_path' | 'mime_type' | 'category' | 'created_at'
> & {
  // Migrations 20260721070000/080000 — swap to the generated type after the
  // next `npm run db:push` regenerates database.ts.
  client_visible: boolean;
};

// get_project_day_presence (migration 20260721060000) is not in database.ts
// until the next type regen — unknown-narrowed rpc per the 6A-2 precedent
// (approveMemberWeek).
type UntypedRpc = (
  fn: string,
  args?: Record<string, unknown>
) => PromiseLike<{ data: unknown; error: { message: string } | null }>;

const DETAIL_SELECT =
  '*, author:company_members(display_name), ' +
  'crew:daily_log_crew(id, member_id, is_deleted, member:company_members(display_name)), ' +
  'sub_entries:daily_log_sub_entries(id, member_id, hours, note, is_deleted, member:company_members(display_name))';

/** Per-project list, newest first (§3a). */
export async function getDailyLogs(projectId: string): Promise<DailyLogListItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('daily_logs')
    .select('*, author:company_members(display_name)')
    .eq('project_id', projectId)
    .eq('is_deleted', false)
    .order('log_date', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) return [];
  return (data ?? []) as unknown as DailyLogListItem[];
}

/**
 * Single log with crew + sub entries. Does NOT filter is_deleted on the log
 * (trash-bin convention — restore flows read deleted rows); child rows are
 * post-filtered since junction edits hard-delete but old soft-deletes may
 * exist.
 */
export async function getDailyLog(id: string): Promise<DailyLogDetail | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('daily_logs')
    .select(DETAIL_SELECT)
    .eq('id', id)
    .maybeSingle();
  if (error || !data) return null;
  const detail = data as unknown as DailyLogDetail;
  detail.crew = detail.crew.filter((c) => !c.is_deleted);
  detail.sub_entries = detail.sub_entries.filter((s) => !s.is_deleted);
  return detail;
}

/**
 * Presence + derived hours per member for a project-day, in the company
 * timezone (SECURITY DEFINER — see migration 20260721060000: 6A's tiered time
 * RLS blocks direct segment reads for non-supervisor authors).
 */
export async function getProjectDayPresence(
  projectId: string,
  logDate: string
): Promise<DayPresence[]> {
  const supabase = await createClient();
  const rpc = supabase.rpc.bind(supabase) as unknown as UntypedRpc;
  const { data, error } = await rpc('get_project_day_presence', {
    p_project_id: projectId,
    p_date: logDate,
  });
  if (error || !Array.isArray(data)) return [];
  return data as DayPresence[];
}

/**
 * A log's images for the 4c photo grid — LOG-BOUND via files.daily_log_id
 * (S87 revision; migration 20260721080000). Two same-day logs each show only
 * their own attachments; the earlier project+category+day-window predicate is
 * superseded for log photos (6B-spec open item #8). Mobile capture, when
 * built, binds the same way at capture time.
 */
export async function getLogPhotos(logId: string): Promise<LogPhoto[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('files')
    .select('id, file_name, file_path, mime_type, category, created_at, client_visible')
    // .filter — daily_log_id is not in database.ts until the next type
    // regen; switch to .eq then.
    .filter('daily_log_id', 'eq', logId)
    .like('mime_type', 'image/%')
    .eq('is_deleted', false)
    .order('created_at', { ascending: true });
  if (error) return [];
  return (data ?? []) as unknown as LogPhoto[];
}

export interface ProjectLogSummary {
  project_id: string;
  latest_log_date: string;
  log_count: number;
  hazard_flagged: boolean;
}

/**
 * Hub rollup (Q8, minimal v1): latest log date, count, and any-hazard flag
 * per visible project. RLS scopes the rows; the reduce happens here.
 */
export async function getProjectLogSummaries(): Promise<Map<string, ProjectLogSummary>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('daily_logs')
    .select('project_id, log_date, hazards_present')
    .eq('is_deleted', false)
    .order('log_date', { ascending: false })
    .limit(1000);
  const map = new Map<string, ProjectLogSummary>();
  if (error) return map;
  for (const row of data ?? []) {
    const existing = map.get(row.project_id);
    if (existing) {
      existing.log_count += 1;
      existing.hazard_flagged = existing.hazard_flagged || row.hazards_present;
    } else {
      map.set(row.project_id, {
        project_id: row.project_id,
        latest_log_date: row.log_date,
        log_count: 1,
        hazard_flagged: row.hazards_present,
      });
    }
  }
  return map;
}
