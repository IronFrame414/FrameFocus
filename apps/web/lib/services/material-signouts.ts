import { createClient } from '@/lib/supabase-server';
import { companyToday } from '@framefocus/shared/utils/dates';
import { getCompanyTimeSettings } from '@/lib/services/company';
import { getSignedUrls } from '@/lib/services/files';
import { DASHBOARD_ROLES } from '@framefocus/shared/constants/roles';
import { getMyProfile } from '@/lib/services/profiles';
import { getProject } from '@/lib/services/projects';
import { formatSiteAddress, getProjectSiteAddress } from '@/lib/services/contact-addresses';
import { canCloseSignout, type MaterialSignout, type PhotoStage } from '@/lib/material-signouts/signout';

// S118 item 11 — server reads for the material sign-out. RLS decides who sees
// a record (the six staff roles, on a project they can view); these reads add
// nothing to that. Both surfaces read through here (PARITY).

// ⚠️ material_signouts has TWO FKs to company_members (released_by, returned_to):
// every embed NAMES its FK, or PostgREST answers PGRST201.
const DETAIL_SELECT =
  '*, released_by:company_members!material_signouts_released_by_member_id_fkey(display_name), returned_to:company_members!material_signouts_returned_to_member_id_fkey(display_name)';

export type SignoutListItem = Pick<
  MaterialSignout,
  | 'id'
  | 'project_id'
  | 'status'
  | 'material_type'
  | 'quantity'
  | 'receiver_company'
  | 'signout_date'
  | 'expected_return_date'
  | 'created_at'
>;

export type SignoutDetail = MaterialSignout & {
  released_by: { display_name: string | null } | null;
  returned_to: { display_name: string | null } | null;
};

export interface SignoutPhoto {
  id: string;
  file_id: string;
  stage: PhotoStage;
  created_at: string;
  taken_by: { display_name: string | null } | null;
  file: { file_name: string; file_path: string; mime_type: string } | null;
  url: string | null;
}

/** A project's sign-outs, newest first (id breaks created_at ties). */
export async function getMaterialSignouts(projectId: string): Promise<SignoutListItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('material_signouts')
    .select('id, project_id, status, material_type, quantity, receiver_company, signout_date, expected_return_date, created_at')
    .eq('project_id', projectId)
    .eq('is_deleted', false)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false });
  if (error) {
    console.error('[getMaterialSignouts]', { projectId, error: error.message });
    return [];
  }
  return (data ?? []) as SignoutListItem[];
}

export async function getMaterialSignout(id: string): Promise<SignoutDetail | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('material_signouts')
    .select(DETAIL_SELECT)
    .eq('id', id)
    .maybeSingle();
  if (error) {
    console.error('[getMaterialSignout]', { id, error: error.message });
    return null;
  }
  return (data as unknown as SignoutDetail | null) ?? null;
}

/**
 * Both photo sets, each photo with who took it and when, signed for display.
 * Ordered by stage, then time, then id — a stable order for the PDF too.
 */
export async function getSignoutPhotos(signoutId: string): Promise<SignoutPhoto[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('material_signout_photos')
    .select(
      'id, file_id, stage, created_at, taken_by:company_members!material_signout_photos_taken_by_member_id_fkey(display_name), file:files!material_signout_photos_file_id_fkey(file_name, file_path, mime_type, is_deleted)'
    )
    .eq('signout_id', signoutId)
    .eq('is_deleted', false)
    .order('stage', { ascending: true })
    .order('created_at', { ascending: true })
    .order('id', { ascending: true });
  if (error) {
    console.error('[getSignoutPhotos]', { signoutId, error: error.message });
    return [];
  }
  type Raw = Omit<SignoutPhoto, 'url' | 'file'> & {
    file: { file_name: string; file_path: string; mime_type: string; is_deleted: boolean } | null;
  };
  const rows = ((data ?? []) as unknown as Raw[]).filter((r) => r.file && !r.file.is_deleted);
  const urls = await getSignedUrls(rows.map((r) => r.file!.file_path));
  return rows.map((r) => ({
    ...r,
    file: r.file ? { file_name: r.file.file_name, file_path: r.file.file_path, mime_type: r.file.mime_type } : null,
    url: r.file ? urls.get(r.file.file_path) ?? null : null,
  }));
}

/** The company's today, for the derived OVERDUE state. */
export async function signoutToday(): Promise<string> {
  const { timezone } = await getCompanyTimeSettings();
  return companyToday(timezone);
}

/** The PDF's signed URL, when one has been generated and is visible. */
export async function getSignoutPdfUrl(pdfFileId: string | null): Promise<string | null> {
  if (!pdfFileId) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from('files')
    .select('file_path, is_deleted')
    .eq('id', pdfFileId)
    .maybeSingle();
  if (!data || data.is_deleted) return null;
  const urls = await getSignedUrls([data.file_path]);
  return urls.get(data.file_path) ?? null;
}

// ── Page loaders, shared by /m and /dashboard (PARITY: one read per screen) ──

export interface SignoutViewer {
  role: string | null;
  signerName: string;
  canCreate: boolean;
  canClose: boolean;
}

export async function getSignoutViewer(): Promise<SignoutViewer> {
  const profile = await getMyProfile();
  const role = profile?.role ?? null;
  return {
    role,
    signerName: [profile?.first_name, profile?.last_name].filter(Boolean).join(' ').trim(),
    // The six staff roles create (RLS: material_signouts_insert_staff).
    canCreate: role !== null && (DASHBOARD_ROLES as string[]).includes(role),
    canClose: canCloseSignout(role),
  };
}

export async function loadNewSignout(projectId: string) {
  const [project, site, viewer, today] = await Promise.all([
    getProject(projectId),
    getProjectSiteAddress(projectId),
    getSignoutViewer(),
    signoutToday(),
  ]);
  if (!project || project.is_deleted) return null;
  return {
    project,
    viewer,
    today,
    defaultJobName: project.name,
    defaultJobAddress: site ? formatSiteAddress(site) : '',
  };
}

export async function loadSignoutRecord(id: string) {
  const record = await getMaterialSignout(id);
  if (!record || record.is_deleted) return null;
  const [photos, viewer, today, pdfUrl, { timezone }] = await Promise.all([
    getSignoutPhotos(id),
    getSignoutViewer(),
    signoutToday(),
    getSignoutPdfUrl(record.pdf_file_id),
    getCompanyTimeSettings(),
  ]);
  return { record, photos, viewer, today, pdfUrl, timeZone: timezone };
}
