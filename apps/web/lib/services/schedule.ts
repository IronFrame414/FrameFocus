import { createClient } from '@/lib/supabase-server';
import { getExpiringCompliance } from '@/lib/services/payables';
import type { ComplianceDocType, ComplianceStatus } from '@/lib/services/payables-shared';
import type { Database } from '@framefocus/shared/types/database';

type ScheduleEntryRow = Database['public']['Tables']['schedule_entries']['Row'];
type InspectionRow = Database['public']['Tables']['inspections']['Row'];

export type GeneralKind = 'project' | 'pto' | 'shop' | 'other';
export type InspectionResult = 'pass' | 'fail' | 'pending';

export type ScheduleEntry = Omit<ScheduleEntryRow, 'general_kind'> & {
  general_kind: GeneralKind;
  member: {
    id: string;
    display_name: string;
    member_type: string;
    schedule_color: string | null;
  } | null;
  project: { id: string; name: string; project_number: string } | null;
};

export type Inspection = Omit<InspectionRow, 'result'> & {
  result: InspectionResult;
};

export const GENERAL_KIND_LABELS: Record<GeneralKind, string> = {
  project: 'On Site',
  pto: 'PTO',
  shop: 'Shop',
  other: 'Other',
};

/**
 * Unified calendar event (Q-N5 UNION at read): dated tasks + general entries,
 * plus inspections as a job-level third source (5B §7 divergence — an
 * inspection has no member, so it renders at job level, not a person's row).
 */
export interface CalendarEvent {
  id: string;
  source: 'task' | 'general' | 'inspection' | 'compliance';
  title: string;
  start_date: string;
  end_date: string; // same as start for single-day
  member_id: string | null; // null for inspections
  member_name: string | null;
  /** company_members.member_type ('crew' | 'subcontractor'); null for inspections. */
  member_type: string | null;
  color: string | null;
  project_id: string | null;
  project_label: string | null;
  detail: {
    status?: string;
    kind?: GeneralKind;
    result?: InspectionResult;
    notes?: string | null;
    /** 7C §3.3 — 'expiring_soon' | 'expired' on a compliance event. */
    complianceStatus?: ComplianceStatus;
  };
}

const ENTRY_JOIN =
  '*, member:company_members(id, display_name, member_type, schedule_color), project:projects(id, name, project_number)';

export async function getScheduleEntries(filters?: {
  projectId?: string;
  from?: string;
  to?: string;
}): Promise<ScheduleEntry[]> {
  const supabase = await createClient();

  let query = supabase
    .from('schedule_entries')
    .select(ENTRY_JOIN)
    .eq('is_deleted', false)
    .order('entry_date', { ascending: true });

  if (filters?.projectId) query = query.eq('project_id', filters.projectId);
  if (filters?.from) query = query.gte('entry_date', filters.from);
  if (filters?.to) query = query.lte('entry_date', filters.to);

  const { data, error } = await query;
  if (error) return [];
  return (data ?? []) as unknown as ScheduleEntry[];
}

export async function getInspections(projectId?: string): Promise<Inspection[]> {
  const supabase = await createClient();

  let query = supabase
    .from('inspections')
    .select('*')
    .eq('is_deleted', false)
    .order('scheduled_date', { ascending: true, nullsFirst: false });

  if (projectId) query = query.eq('project_id', projectId);

  const { data, error } = await query;
  if (error) return [];
  return (data ?? []) as Inspection[];
}

/**
 * Assemble the calendar UNION for a project (project-scoped) or the whole
 * company (cross-project dashboard calendar). RLS scopes rows per role; for
 * crew the caller should additionally pass ownMemberId so dated TASKS are
 * filtered to self (5B §9 interpretation: in-project task list/Gantt show all,
 * calendars are own-only for crew).
 */
export async function getCalendarEvents(options: {
  projectId?: string;
  ownMemberId?: string; // set for crew: filters task + general events to self
}): Promise<CalendarEvent[]> {
  const supabase = await createClient();
  const events: CalendarEvent[] = [];

  // Source 1: dated tasks
  let taskQuery = supabase
    .from('tasks')
    .select(
      'id, title, status, start_date, due_date, notes:description, project_id, assignee:company_members(id, display_name, member_type, schedule_color), project:projects(id, name, project_number)'
    )
    .eq('is_deleted', false)
    .eq('is_scheduled', true);
  if (options.projectId) taskQuery = taskQuery.eq('project_id', options.projectId);

  const { data: tasks } = await taskQuery;
  for (const t of tasks ?? []) {
    const assignee = t.assignee as unknown as {
      id: string;
      display_name: string;
      member_type: string;
      schedule_color: string | null;
    } | null;
    if (options.ownMemberId && assignee?.id !== options.ownMemberId) continue;
    const project = t.project as unknown as {
      id: string;
      name: string;
      project_number: string;
    } | null;
    const start = t.start_date ?? t.due_date!;
    const end = t.due_date ?? t.start_date!;
    events.push({
      id: t.id,
      source: 'task',
      title: t.title,
      start_date: start,
      end_date: end,
      member_id: assignee?.id ?? null,
      member_name: assignee?.display_name ?? null,
      member_type: assignee?.member_type ?? null,
      color: assignee?.schedule_color ?? null,
      project_id: t.project_id,
      project_label: project ? project.project_number : null,
      detail: { status: t.status },
    });
  }

  // Source 2: general schedule entries (RLS already limits crew to own)
  const entries = await getScheduleEntries({ projectId: options.projectId });
  for (const e of entries) {
    if (options.ownMemberId && e.member_id !== options.ownMemberId) continue;
    events.push({
      id: e.id,
      source: 'general',
      title:
        e.general_kind === 'project'
          ? e.project
            ? `${e.project.name}`
            : 'On site'
          : GENERAL_KIND_LABELS[e.general_kind],
      start_date: e.entry_date,
      end_date: e.end_date ?? e.entry_date,
      member_id: e.member_id,
      member_name: e.member?.display_name ?? null,
      member_type: e.member?.member_type ?? null,
      color: e.member?.schedule_color ?? null,
      project_id: e.project_id,
      project_label: e.project?.project_number ?? null,
      detail: { kind: e.general_kind, notes: e.notes },
    });
  }

  // Source 3: dated inspections — job-level events, no member row
  const inspections = await getInspections(options.projectId);
  for (const i of inspections) {
    if (!i.scheduled_date) continue;
    events.push({
      id: i.id,
      source: 'inspection',
      title: `Inspection: ${i.inspection_type}`,
      start_date: i.scheduled_date,
      end_date: i.scheduled_date,
      member_id: null,
      member_name: null,
      member_type: null,
      color: null,
      project_id: i.project_id,
      project_label: null,
      detail: { result: i.result, notes: i.notes },
    });
  }

  // Source 4: subcontractor compliance expiries (7C §3.3) — DERIVED AT READ,
  // never stored as calendar rows. A COI's expiry is a date on the compliance
  // document; materialising it here would need a sync trigger and would go
  // stale the moment the document is renewed.
  //
  // ⚠️ PROJECT-SCOPED CALENDARS GET NONE OF THESE, deliberately. Compliance is
  // company-wide (a member's COI is not a property of any one job), so
  // attaching it to a project calendar would either duplicate it across every
  // job the sub touches or pick one arbitrarily.
  //
  // The read is Owner/Admin by RLS (20260921000000). For every other role it
  // returns an empty list and no compliance events appear — the floor, not a
  // filter written here.
  if (!options.projectId && !options.ownMemberId) {
    const expiring = await getExpiringCompliance();
    for (const doc of expiring) {
      if (!doc.expiration_date) continue; // NULL never alerts (W-9 rule)
      events.push({
        id: `compliance:${doc.id}`,
        source: 'compliance',
        title: `${COMPLIANCE_CALENDAR_LABELS[doc.doc_type]} ${
          doc.derivedStatus === 'expired' ? 'expired' : 'expires'
        } — ${doc.member?.display_name ?? 'Subcontractor'}`,
        start_date: doc.expiration_date,
        end_date: doc.expiration_date,
        member_id: doc.member?.id ?? null,
        member_name: doc.member?.display_name ?? null,
        member_type: 'subcontractor',
        color: null,
        project_id: null,
        project_label: null,
        detail: { complianceStatus: doc.derivedStatus, notes: doc.notes },
      });
    }
  }

  events.sort((a, b) => a.start_date.localeCompare(b.start_date));
  return events;
}

/** Short labels for the calendar — the sub record spells them out in full. */
const COMPLIANCE_CALENDAR_LABELS: Record<ComplianceDocType, string> = {
  coi: 'COI',
  license: 'License',
  w9: 'W-9',
  other: 'Compliance doc',
};
