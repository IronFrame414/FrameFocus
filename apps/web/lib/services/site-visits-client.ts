import { createClient } from '@/lib/supabase-browser';
import type {
  SiteVisit,
  SiteVisitDetail,
  SiteVisitMeasurement,
  SiteVisitNote,
  SiteVisitNoteKind,
  SiteVisitVoiceNote,
} from '@/lib/services/site-visits';

export type {
  SiteVisit,
  SiteVisitDetail,
  SiteVisitMeasurement,
  SiteVisitNote,
  SiteVisitNoteKind,
  SiteVisitVoiceNote,
};

// S108 Spec A — SITE VISIT WRITES. Every one is an RPC (ASK-A8: "via the RPC
// only — never through a SELECT grant") or one of the two server routes that
// carry a file. Desktop and mobile call THESE, so both surfaces write the same
// way and are refused by the same rules (PARITY [S122]).

type Result = { success: boolean; error?: string };

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<{ data?: T; error?: string }> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc(fn as never, args as never);
  if (error) return { error: error.message };
  return { data: data as T };
}

export interface NewContactInput {
  first_name: string;
  last_name: string;
  phone?: string;
  email?: string;
}
export interface NewAddressInput {
  address_line1: string;
  address_line2?: string;
  city: string;
  state: string;
  zip: string;
}

/** Creates the visit through the server route, which calls create_site_visit
 *  on the caller's session. It does NOT notify — the office is told at FINISH
 *  (ASK-A4 amended, 2026-09-23). */
export async function createSiteVisit(input: {
  title: string;
  contact_id?: string | null;
  contact_address_id?: string | null;
  new_contact?: NewContactInput | null;
  new_address?: NewAddressInput | null;
}): Promise<{ success: boolean; id?: string; error?: string }> {
  const res = await fetch('/api/site-visits', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const body = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
  if (!res.ok || !body.id) return { success: false, error: body.error ?? 'Could not record the visit.' };
  return { success: true, id: body.id };
}

export async function updateSiteVisit(estimateId: string, title: string): Promise<Result> {
  const r = await rpc('update_site_visit', { p_estimate_id: estimateId, p_title: title });
  return r.error ? { success: false, error: r.error } : { success: true };
}

export async function saveSiteVisitNote(input: {
  estimate_id: string;
  id?: string | null;
  kind: SiteVisitNoteKind;
  body: string;
  resolved?: boolean;
}): Promise<{ success: boolean; id?: string; error?: string }> {
  const r = await rpc<string>('save_site_visit_note', {
    p_estimate_id: input.estimate_id,
    p_note_id: input.id ?? null,
    p_kind: input.kind,
    p_body: input.body,
    p_resolved: input.resolved ?? false,
  });
  return r.error ? { success: false, error: r.error } : { success: true, id: r.data };
}

export async function deleteSiteVisitNote(id: string): Promise<Result> {
  const r = await rpc('delete_site_visit_note', { p_note_id: id });
  return r.error ? { success: false, error: r.error } : { success: true };
}

export async function saveSiteVisitMeasurement(input: {
  estimate_id: string;
  id?: string | null;
  area_name: string;
  length_ft: number;
  width_ft: number;
  notes?: string | null;
}): Promise<{ success: boolean; id?: string; error?: string }> {
  const r = await rpc<string>('save_site_visit_measurement', {
    p_estimate_id: input.estimate_id,
    p_measurement_id: input.id ?? null,
    p_area_name: input.area_name,
    p_length_ft: input.length_ft,
    p_width_ft: input.width_ft,
    p_notes: input.notes ?? null,
  });
  return r.error ? { success: false, error: r.error } : { success: true, id: r.data };
}

export async function deleteSiteVisitMeasurement(id: string): Promise<Result> {
  const r = await rpc('delete_site_visit_measurement', { p_measurement_id: id });
  return r.error ? { success: false, error: r.error } : { success: true };
}

export async function updateVoiceTranscript(id: string, transcript: string): Promise<Result> {
  const r = await rpc('update_voice_note_transcript', { p_voice_note_id: id, p_transcript: transcript });
  return r.error ? { success: false, error: r.error } : { success: true };
}

/** FINISH — "done capturing, ready to price". NOT promotion: it stamps the
 *  money-free site_visits row and nothing else; no number, status unchanged.
 *  The office, or the recorder while it is still a visit. Idempotent.
 *  Through the server route, which runs finish_site_visit on the caller's
 *  session and then tells the office (ASK-A4 amended — notify at FINISH). */
export async function finishSiteVisit(estimateId: string): Promise<Result> {
  const res = await fetch(`/api/site-visits/${estimateId}/finish`, { method: 'POST' });
  if (res.ok) return { success: true };
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  return { success: false, error: body.error ?? 'Could not finish the visit.' };
}

/** PROMOTE — owner/admin/PM only: assigns the estimate number and creates the
 *  first money-bearing state. Never a side effect; only the office's explicit
 *  "Create estimate from this visit" calls this. */
export async function promoteSiteVisit(
  estimateId: string
): Promise<{ success: boolean; estimateNumber?: string; error?: string }> {
  const r = await rpc<string>('promote_site_visit', { p_estimate_id: estimateId });
  return r.error ? { success: false, error: r.error } : { success: true, estimateNumber: r.data };
}

export async function abandonSiteVisit(estimateId: string): Promise<Result> {
  const r = await rpc('abandon_site_visit', { p_estimate_id: estimateId });
  return r.error ? { success: false, error: r.error } : { success: true };
}

/** A photo, through the estimate-files route (the only access control for a
 *  project-less file). `id` makes a replay from the offline queue idempotent. */
export async function uploadSiteVisitPhoto(estimateId: string, file: Blob, fileName: string, id: string): Promise<Result> {
  const form = new FormData();
  form.set('file', new File([file], fileName, { type: file.type || 'image/jpeg' }));
  form.set('id', id);
  const res = await fetch(`/api/estimates/${estimateId}/files`, { method: 'POST', body: form });
  if (res.ok) return { success: true };
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  return { success: false, error: body.error ?? `Upload failed (${res.status})` };
}

/** A voice note: stored first, transcribed after (voice ruling). A failed
 *  transcription is still a SUCCESSFUL upload — the audio is kept. */
export async function uploadVoiceNote(
  estimateId: string,
  audio: Blob,
  durationSeconds: number,
  id: string
): Promise<{ success: boolean; transcriptStatus?: string; error?: string }> {
  const form = new FormData();
  form.set('file', new File([audio], `voice-${id}`, { type: audio.type || 'audio/webm' }));
  form.set('duration_seconds', String(durationSeconds));
  form.set('id', id);
  const res = await fetch(`/api/site-visits/${estimateId}/voice`, { method: 'POST', body: form });
  const body = (await res.json().catch(() => ({}))) as { transcript_status?: string; error?: string };
  if (!res.ok) return { success: false, error: body.error ?? `Upload failed (${res.status})` };
  return { success: true, transcriptStatus: body.transcript_status };
}

export async function retryTranscription(voiceNoteId: string): Promise<{ success: boolean; error?: string }> {
  const res = await fetch(`/api/site-visits/voice/${voiceNoteId}/transcribe`, { method: 'POST' });
  const body = (await res.json().catch(() => ({}))) as { transcript_status?: string; error?: string };
  if (!res.ok || body.transcript_status !== 'done') {
    return { success: false, error: body.error ?? 'Transcription failed — the recording is saved. Try again.' };
  }
  return { success: true };
}
