import { createClient } from '@/lib/supabase-server';
import type { Database } from '@framefocus/shared/types/database';
import { companyToday } from '@framefocus/shared/utils/dates';

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

// ---------------------------------------------------------------------------
// M6M §4.6 — M-6's COMPANY-WIDE list.
//
// `getDailyLogs(projectId)` above is per-project and is what M-7's tile badge
// and the desktop use. M-6 is a TAB: it spans every project the caller can
// reach, with All / Mine / This project chips over the top. Added here rather
// than queried inline from the page, per §1's shared-service rule and A-28b
// ("no lib/services/* file is duplicated for mobile").
//
// RLS does the tenant and project scoping, as everywhere else — this function
// adds no role logic of its own.
// ---------------------------------------------------------------------------

export interface MobileLogRow {
  id: string;
  log_date: string;
  work_performed: string | null;
  project_id: string;
  project_name: string | null;
  project_number: string | null;
  author_name: string | null;
  photo_count: number;
}

export interface MobileLogFeed {
  rows: MobileLogRow[];
  /** §4.6's app-bar figure — `{n} this week`. */
  thisWeek: number;
}

/** Monday-start week containing `today`, as an ISO date string. */
function weekStart(todayIso: string): string {
  const d = new Date(`${todayIso}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7; // Mon = 0
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

export async function getMobileDailyLogs(filters?: {
  /** `author_member_id = me` — the "Mine" chip. */
  mineMemberId?: string | null;
  /** The "This project" chip. */
  projectId?: string | null;
  /** Company day, so "this week" is not computed in UTC. */
  today?: string;
}): Promise<MobileLogFeed> {
  const supabase = await createClient();

  let query = supabase
    .from('daily_logs')
    .select('id, log_date, work_performed, project_id, author:company_members(display_name), project:projects(name, project_number)')
    .eq('is_deleted', false)
    .order('log_date', { ascending: false })
    .order('created_at', { ascending: false });

  if (filters?.mineMemberId) query = query.eq('author_member_id', filters.mineMemberId);
  if (filters?.projectId) query = query.eq('project_id', filters.projectId);

  const { data, error } = await query;
  if (error || !data) return { rows: [], thisWeek: 0 };

  type Raw = {
    id: string;
    log_date: string;
    work_performed: string | null;
    project_id: string;
    author: { display_name: string } | null;
    project: { name: string; project_number: string | null } | null;
  };
  const raw = data as unknown as Raw[];

  // Photo counts in ONE query rather than N — a field user's week can carry a
  // lot of logs, and a per-row count would be the screen's slowest part.
  const ids = raw.map((r) => r.id);
  const counts = new Map<string, number>();
  if (ids.length > 0) {
    const { data: photos } = await supabase
      .from('files')
      .select('daily_log_id')
      .in('daily_log_id', ids)
      .eq('is_deleted', false);
    for (const p of (photos ?? []) as { daily_log_id: string | null }[]) {
      if (!p.daily_log_id) continue;
      counts.set(p.daily_log_id, (counts.get(p.daily_log_id) ?? 0) + 1);
    }
  }

  const rows: MobileLogRow[] = raw.map((r) => ({
    id: r.id,
    log_date: r.log_date,
    work_performed: r.work_performed,
    project_id: r.project_id,
    project_name: r.project?.name ?? null,
    project_number: r.project?.project_number ?? null,
    author_name: r.author?.display_name ?? null,
    photo_count: counts.get(r.id) ?? 0,
  }));

  // ⚠️ `{n} this week` counts THE UNFILTERED WEEK, not the filtered rows.
  // A user who taps "Mine" has not changed how many logs the week holds, and a
  // figure that moved with the chips would be reporting the filter rather than
  // the week.
  // #116 [S103]: fall back to the COMPANY day, not the UTC day (tomorrow after
  // ~20:00 EDT). `companies` is RLS-scoped to the caller's own row.
  const { data: coTz } = await supabase.from('companies').select('timezone').maybeSingle();
  const start = weekStart(
    filters?.today ?? companyToday(coTz?.timezone ?? 'America/New_York')
  );
  const { count: weekCount } = await supabase
    .from('daily_logs')
    .select('id', { count: 'exact', head: true })
    .eq('is_deleted', false)
    .gte('log_date', start);

  return { rows, thisWeek: weekCount ?? 0 };
}
