import { createClient } from '@/lib/supabase-server';
import type { Database } from '@framefocus/shared/types/database';

// S108 Spec A — SITE VISITS, server reads. Every read is the caller's SESSION
// through RLS on the money-free site_visit_* tables:
//   owner / admin / PM → every visit in the company;
//   foreman / crew     → only what THEY recorded (created_by), before AND
//                        after promotion.
// ⚠️ NOTHING HERE READS `estimates`. A foreman or crew member cannot, and the
// recorder's view must be buildable without it — that is the Floor (ASK-A1).

type SiteVisitRow = Database['public']['Tables']['site_visits']['Row'];
type NoteRow = Database['public']['Tables']['site_visit_notes']['Row'];
type MeasurementRow = Database['public']['Tables']['site_visit_measurements']['Row'];
type VoiceRow = Database['public']['Tables']['site_visit_voice_notes']['Row'];

export type SiteVisitNoteKind = 'condition' | 'scope' | 'blocker';
export type TranscriptStatus = 'pending' | 'done' | 'failed';

export type SiteVisitNote = Omit<NoteRow, 'kind'> & { kind: SiteVisitNoteKind };
export type SiteVisitMeasurement = MeasurementRow;
export type SiteVisitVoiceNote = Omit<VoiceRow, 'transcript_status'> & {
  transcript_status: TranscriptStatus;
};

export type SiteVisit = SiteVisitRow & {
  contact: { first_name: string; last_name: string; company_name: string | null } | null;
  address: { address_line1: string; city: string; state: string; zip: string } | null;
};

export interface SiteVisitDetail {
  visit: SiteVisit;
  notes: SiteVisitNote[];
  measurements: SiteVisitMeasurement[];
  voiceNotes: SiteVisitVoiceNote[];
}

const VISIT_SELECT =
  '*, contact:contacts(first_name, last_name, company_name), address:contact_addresses(address_line1, city, state, zip)';

/** Open visits first, then promoted ones; abandoned (soft-deleted) never. */
export async function listSiteVisits(opts?: { openOnly?: boolean }): Promise<SiteVisit[]> {
  const supabase = await createClient();
  let q = supabase
    .from('site_visits')
    .select(VISIT_SELECT)
    .eq('is_deleted', false)
    .order('visited_at', { ascending: false })
    .order('id', { ascending: true });
  if (opts?.openOnly) q = q.is('promoted_at', null);
  const { data, error } = await q;
  if (error) {
    console.error('[site-visits] list failed', { message: error.message });
    return [];
  }
  return (data ?? []) as unknown as SiteVisit[];
}

/** One visit and everything captured on it. Null = not visible to the caller
 *  (RLS) or does not exist — the same answer either way. Does NOT filter
 *  is_deleted on the visit itself, so an abandoned visit can be shown as such. */
export async function getSiteVisit(estimateId: string): Promise<SiteVisitDetail | null> {
  const supabase = await createClient();
  const { data: visit } = await supabase
    .from('site_visits')
    .select(VISIT_SELECT)
    .eq('estimate_id', estimateId)
    .maybeSingle();
  if (!visit) return null;

  const [notes, measurements, voice] = await Promise.all([
    supabase
      .from('site_visit_notes')
      .select('*')
      .eq('estimate_id', estimateId)
      .eq('is_deleted', false)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true }),
    supabase
      .from('site_visit_measurements')
      .select('*')
      .eq('estimate_id', estimateId)
      .eq('is_deleted', false)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true }),
    supabase
      .from('site_visit_voice_notes')
      .select('*')
      .eq('estimate_id', estimateId)
      .eq('is_deleted', false)
      .order('created_at', { ascending: true }),
  ]);

  return {
    visit: visit as unknown as SiteVisit,
    notes: (notes.data ?? []) as SiteVisitNote[],
    measurements: (measurements.data ?? []) as SiteVisitMeasurement[],
    voiceNotes: (voice.data ?? []) as SiteVisitVoiceNote[],
  };
}

/** Whether the caller may still WRITE to the visit (recorder pre-promotion, or
 *  office). Decided in the database by site_visit_access(). */
export async function getSiteVisitAccess(estimateId: string): Promise<'office' | 'recorder' | null> {
  const supabase = await createClient();
  const { data } = await supabase.rpc('site_visit_access', { p_estimate_id: estimateId });
  return (data as 'office' | 'recorder' | null) ?? null;
}

export interface ContactOption {
  id: string;
  label: string;
  addresses: Array<{ id: string; label: string }>;
}

/** Contacts + addresses for the create form. Foreman and crew ALREADY read
 *  every contact and address in the company (FILL-A10 — the S131 floor excludes
 *  only subcontractor and client), so this widens nothing. */
export async function listContactOptions(): Promise<ContactOption[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('contacts')
    .select('id, first_name, last_name, company_name, contact_addresses(id, address_line1, city, is_deleted)')
    .eq('is_deleted', false)
    .order('last_name', { ascending: true })
    .order('first_name', { ascending: true })
    .order('id', { ascending: true });
  return (data ?? []).map((c) => {
    const row = c as unknown as {
      id: string;
      first_name: string;
      last_name: string;
      company_name: string | null;
      contact_addresses: Array<{ id: string; address_line1: string; city: string; is_deleted: boolean | null }>;
    };
    return {
      id: row.id,
      label: [`${row.first_name} ${row.last_name}`.trim(), row.company_name].filter(Boolean).join(' · '),
      addresses: (row.contact_addresses ?? [])
        .filter((a) => !a.is_deleted)
        .map((a) => ({ id: a.id, label: `${a.address_line1}, ${a.city}` })),
    };
  });
}
