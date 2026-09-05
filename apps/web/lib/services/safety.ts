import { createClient } from '@/lib/supabase-server';
import type { Database } from '@framefocus/shared/types/database';
import type { IncidentStatus, IncidentType } from '@framefocus/shared';

// 6C Safety Incidents — server reads (6C-spec §U; handoff 4d). RLS governs
// visibility: project incidents via can_view_project(); project-less
// (shop/yard) incidents are readable by supervisors and the reporter.
// status/outcome/prevention_notes (migration 20260722000000) are not in
// database.ts until the next type regen — the intersection below re-adds
// them; swap to plain Row types then.

type IncidentRow = Database['public']['Tables']['safety_incidents']['Row'];

export type SafetyIncident = Omit<IncidentRow, 'incident_type'> & {
  incident_type: IncidentType;
  prevention_notes: string | null;
  status: IncidentStatus;
  outcome: string | null;
};

export interface IncidentListItem extends SafetyIncident {
  project: { name: string } | null;
  reporter: { display_name: string } | null;
}

export interface IncidentInjury {
  id: string;
  member_id: string | null;
  injured_name: string | null;
  treatment_sought: boolean;
  treatment_notes: string | null;
  is_deleted: boolean | null;
  member: { display_name: string } | null;
}

export interface IncidentWitness {
  id: string;
  member_id: string | null;
  witness_name: string | null;
  is_deleted: boolean | null;
  member: { display_name: string } | null;
}

export interface IncidentDetail extends IncidentListItem {
  injuries: IncidentInjury[];
  witnesses: IncidentWitness[];
}

export type IncidentPhoto = Pick<
  Database['public']['Tables']['files']['Row'],
  'id' | 'file_name' | 'file_path' | 'mime_type' | 'created_at' | 'markup_data'
>;

const LIST_SELECT = '*, project:projects(name), reporter:company_members(display_name)';
const DETAIL_SELECT =
  LIST_SELECT +
  ', injuries:safety_incident_injuries(id, member_id, injured_name, treatment_sought, treatment_notes, is_deleted, member:company_members(display_name))' +
  ', witnesses:safety_incident_witnesses(id, member_id, witness_name, is_deleted, member:company_members(display_name))';

/** Company-wide incident log (4d) — RLS scopes what each viewer sees. */
export async function getIncidents(): Promise<IncidentListItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('safety_incidents')
    .select(LIST_SELECT)
    .eq('is_deleted', false)
    .order('incident_date', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) return [];
  return (data ?? []) as unknown as IncidentListItem[];
}

/** Project-scoped list for the Field Ops Safety tab. */
export async function getIncidentsForProject(projectId: string): Promise<IncidentListItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('safety_incidents')
    .select(LIST_SELECT)
    .eq('project_id', projectId)
    .eq('is_deleted', false)
    .order('incident_date', { ascending: false });
  if (error) return [];
  return (data ?? []) as unknown as IncidentListItem[];
}

/** Single incident (trash-bin convention: no is_deleted filter on the row). */
export async function getIncident(id: string): Promise<IncidentDetail | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('safety_incidents')
    .select(DETAIL_SELECT)
    .eq('id', id)
    .maybeSingle();
  if (error || !data) return null;
  const detail = data as unknown as IncidentDetail;
  detail.injuries = detail.injuries.filter((i) => !i.is_deleted);
  detail.witnesses = detail.witnesses.filter((w) => !w.is_deleted);
  return detail;
}

/** Incident-bound photos (Q5 — files.safety_incident_id, migration 20260722010000). */
export async function getIncidentPhotos(incidentId: string): Promise<IncidentPhoto[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('files')
    .select('id, file_name, file_path, mime_type, created_at, markup_data')
    // .filter — safety_incident_id is not in database.ts until regen.
    .filter('safety_incident_id', 'eq', incidentId)
    .like('mime_type', 'image/%')
    .eq('is_deleted', false)
    .order('created_at', { ascending: true });
  if (error) return [];
  return (data ?? []) as unknown as IncidentPhoto[];
}

export interface FailedRecipient {
  email: string;
  lastError: string | null;
}

/**
 * Recipients whose LATEST notification attempt for this incident failed —
 * powers the Owner/Admin retry banner (§4, open item #5). Reads email_logs
 * under RLS (email_logs_select_manager); callers gate to Owner/Admin.
 */
export async function getFailedIncidentEmails(incidentId: string): Promise<FailedRecipient[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('email_logs')
    .select('recipient_email, status, created_at, metadata')
    .eq('email_type', 'safety_incident')
    .eq('metadata->>incident_id', incidentId)
    .order('created_at', { ascending: false });
  if (error || !data) return [];

  const latest = new Map<string, { status: string; metadata: unknown }>();
  for (const row of data) {
    if (!latest.has(row.recipient_email)) {
      latest.set(row.recipient_email, { status: row.status, metadata: row.metadata });
    }
  }
  return [...latest.entries()]
    .filter(([, v]) => v.status === 'failed')
    .map(([email, v]) => ({
      email,
      lastError:
        typeof v.metadata === 'object' && v.metadata !== null && 'error' in v.metadata
          ? String((v.metadata as { error?: unknown }).error ?? '')
          : null,
    }));
}
