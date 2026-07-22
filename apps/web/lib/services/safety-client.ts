import { createClient } from '@/lib/supabase-browser';
import type { Database } from '@framefocus/shared/types/database';
import type { IncidentStatus } from '@framefocus/shared';
import type { IncidentCreateInput } from '@framefocus/shared/validation/safety';
import { uploadFile } from '@/lib/services/files-client';
export type {
  SafetyIncident,
  IncidentDetail,
  IncidentListItem,
  IncidentInjury,
  IncidentWitness,
  IncidentPhoto,
} from '@/lib/services/safety';

// 6C — client mutations. RLS: edit = reporter OR Owner/Admin (accepted live
// breadth, Phase 3 Q4 — status/outcome controls are UI-gated to Owner/Admin);
// soft-delete = Owner/Admin. Creation goes through the server route (atomic
// RPC + PDF + hierarchy notification).

type MutationResult = { success: boolean; error?: string };

type FilesUpdate = Database['public']['Tables']['files']['Update'];
type IncidentUpdate = Database['public']['Tables']['safety_incidents']['Update'];

export interface IncidentFields {
  incident_date?: string;
  incident_type?: 'injury' | 'property_damage' | 'near_miss';
  description?: string;
  prevention_notes?: string | null;
}

export interface PersonRowInput {
  id?: string;
  member_id?: string | null;
  name?: string | null;
}

export interface InjuryRowInput extends PersonRowInput {
  treatment_sought: boolean;
  treatment_notes?: string | null;
}

/** Create via the server route — atomic insert + PDF + hierarchy email. */
export async function createIncident(
  input: IncidentCreateInput
): Promise<{ success: boolean; incidentId?: string; emailErrors?: string[]; error?: string }> {
  const res = await fetch('/api/safety-incidents', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const body = (await res.json().catch(() => null)) as
    | { incidentId?: string; emailErrors?: string[]; error?: string }
    | null;
  if (!res.ok) return { success: false, error: body?.error ?? `Create failed (${res.status})` };
  return { success: true, incidentId: body?.incidentId, emailErrors: body?.emailErrors };
}

export async function updateIncident(
  id: string,
  fields: IncidentFields
): Promise<MutationResult> {
  const supabase = createClient();
  // Triggers own updated_at / updated_by. prevention_notes (migration
  // 20260722000000) is not in database.ts until regen — hence the cast.
  const { error } = await supabase
    .from('safety_incidents')
    .update(fields as IncidentUpdate)
    .eq('id', id);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

/** Owner/Admin resolution controls (§2 [S87]) — UI gates; RLS is row-level. */
export async function setIncidentResolution(
  id: string,
  status: IncidentStatus,
  outcome: string | null
): Promise<MutationResult> {
  const supabase = createClient();
  const updates = { status, outcome } as unknown as IncidentUpdate;
  const { error } = await supabase.from('safety_incidents').update(updates).eq('id', id);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

function personColumns(row: PersonRowInput, nameColumn: 'injured_name' | 'witness_name') {
  return {
    member_id: row.member_id || null,
    [nameColumn]: row.member_id ? null : row.name?.trim() || null,
  };
}

/** Reconcile injured parties. The deferred DB trigger holds the injury invariant. */
export async function setIncidentInjuries(
  incidentId: string,
  rows: InjuryRowInput[]
): Promise<MutationResult> {
  const supabase = createClient();
  const { data: current, error: readError } = await supabase
    .from('safety_incident_injuries')
    .select('id')
    .eq('incident_id', incidentId)
    .eq('is_deleted', false);
  if (readError) return { success: false, error: readError.message };

  const keptIds = new Set(rows.filter((r) => r.id).map((r) => r.id as string));
  const removeIds = (current ?? []).map((r) => r.id).filter((id) => !keptIds.has(id));
  if (removeIds.length > 0) {
    const { error } = await supabase.from('safety_incident_injuries').delete().in('id', removeIds);
    if (error) return { success: false, error: error.message };
  }
  for (const row of rows) {
    const values = {
      ...personColumns(row, 'injured_name'),
      treatment_sought: row.treatment_sought,
      treatment_notes: row.treatment_notes?.trim() || null,
    };
    if (row.id) {
      const { error } = await supabase
        .from('safety_incident_injuries')
        .update(values)
        .eq('id', row.id);
      if (error) return { success: false, error: error.message };
    } else {
      const { error } = await supabase
        .from('safety_incident_injuries')
        .insert({ ...values, incident_id: incidentId });
      if (error) return { success: false, error: error.message };
    }
  }
  return { success: true };
}

export async function setIncidentWitnesses(
  incidentId: string,
  rows: PersonRowInput[]
): Promise<MutationResult> {
  const supabase = createClient();
  const { data: current, error: readError } = await supabase
    .from('safety_incident_witnesses')
    .select('id')
    .eq('incident_id', incidentId)
    .eq('is_deleted', false);
  if (readError) return { success: false, error: readError.message };

  const keptIds = new Set(rows.filter((r) => r.id).map((r) => r.id as string));
  const removeIds = (current ?? []).map((r) => r.id).filter((id) => !keptIds.has(id));
  if (removeIds.length > 0) {
    const { error } = await supabase
      .from('safety_incident_witnesses')
      .delete()
      .in('id', removeIds);
    if (error) return { success: false, error: error.message };
  }
  for (const row of rows) {
    const values = personColumns(row, 'witness_name');
    if (row.id) {
      const { error } = await supabase
        .from('safety_incident_witnesses')
        .update(values)
        .eq('id', row.id);
      if (error) return { success: false, error: error.message };
    } else {
      const { error } = await supabase
        .from('safety_incident_witnesses')
        .insert({ ...values, incident_id: incidentId });
      if (error) return { success: false, error: error.message };
    }
  }
  return { success: true };
}

/**
 * Incident-bound photo (Q5): category 'safety', linked via
 * files.safety_incident_id, client_visible stays false. Requires the
 * incident's project — project-less (shop/yard) incidents skip photo upload
 * in v1 (files storage paths are project-keyed).
 */
export async function uploadIncidentPhoto(
  file: File,
  projectId: string,
  incidentId: string
): Promise<{ success: boolean; id?: string; error?: string }> {
  const uploaded = await uploadFile(file, { project_id: projectId, category: 'safety' });
  if (!uploaded.success || !uploaded.id) return uploaded;

  const supabase = createClient();
  const link = { safety_incident_id: incidentId } as unknown as FilesUpdate;
  const { error } = await supabase.from('files').update(link).eq('id', uploaded.id);
  if (error) {
    return {
      success: false,
      id: uploaded.id,
      error: `Photo uploaded but not linked: ${error.message}`,
    };
  }
  return uploaded;
}

export async function softDeleteIncident(id: string): Promise<MutationResult> {
  const supabase = createClient();
  const { error } = await supabase
    .from('safety_incidents')
    .update({ is_deleted: true, deleted_at: new Date().toISOString() })
    .eq('id', id);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function generateIncidentPdf(
  incidentId: string
): Promise<{ success: boolean; error?: string }> {
  const res = await fetch(`/api/safety-incidents/${incidentId}/pdf`, { method: 'POST' });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    return { success: false, error: body?.error ?? `PDF generation failed (${res.status})` };
  }
  return { success: true };
}

/** Owner/Admin retry for failed notification sends (§4 / Phase 3 Q6). */
export async function retryIncidentNotifications(
  incidentId: string
): Promise<{ success: boolean; resent?: number; emailErrors?: string[]; error?: string }> {
  const res = await fetch(`/api/safety-incidents/${incidentId}/notify`, { method: 'POST' });
  const body = (await res.json().catch(() => null)) as
    | { resent?: number; emailErrors?: string[]; error?: string }
    | null;
  if (!res.ok) return { success: false, error: body?.error ?? `Retry failed (${res.status})` };
  return { success: true, resent: body?.resent, emailErrors: body?.emailErrors };
}
