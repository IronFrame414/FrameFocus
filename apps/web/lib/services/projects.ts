import { createClient } from '@/lib/supabase-server';
import type { Database } from '@framefocus/shared/types/database';

type ProjectRow = Database['public']['Tables']['projects']['Row'];

export type ProjectType = 'fixed_price' | 'time_and_materials' | 'cost_plus';
export type ProjectStatus = 'active' | 'on_hold' | 'complete' | 'archived' | 'cancelled';

export type Project = Omit<ProjectRow, 'project_type' | 'status'> & {
  project_type: ProjectType;
  status: ProjectStatus;
};

/** Project row joined with its client contact for list/detail headers. */
export type ProjectWithContact = Project & {
  contact: {
    id: string;
    first_name: string;
    last_name: string;
    company_name: string | null;
    email: string | null;
    phone: string | null;
  } | null;
};

// Presentation constants live in the client-safe sibling so client components
// can import them without dragging this server module (next/headers) into the
// client bundle. Re-exported here for server-side consumers.
export { PROJECT_STATUS_LABELS, PROJECT_TYPE_LABELS } from './projects-client';

const CONTACT_JOIN = 'contact:contacts(id, first_name, last_name, company_name, email, phone)';

export async function getProjects(filters?: {
  status?: ProjectStatus;
}): Promise<ProjectWithContact[]> {
  const supabase = await createClient();

  let query = supabase
    .from('projects')
    .select(`*, ${CONTACT_JOIN}`)
    .eq('is_deleted', false)
    .order('created_at', { ascending: false });

  if (filters?.status) {
    query = query.eq('status', filters.status);
  }

  const { data, error } = await query;
  if (error) return [];
  return (data ?? []) as unknown as ProjectWithContact[];
}

/**
 * Single project by id. Does NOT filter is_deleted (trash-bin pattern —
 * a restore flow must be able to fetch a soft-deleted project).
 */
export async function getProject(id: string): Promise<ProjectWithContact | null> {
  const supabase = await createClient();

  const { data } = await supabase
    .from('projects')
    .select(`*, ${CONTACT_JOIN}`)
    .eq('id', id)
    .single();

  return (data as unknown as ProjectWithContact | null) ?? null;
}

/** Soft-deleted projects for a trash UI (Owner/Admin surface). */
export async function getProjectTrash(): Promise<ProjectWithContact[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('projects')
    .select(`*, ${CONTACT_JOIN}`)
    .eq('is_deleted', true)
    .order('deleted_at', { ascending: false });

  if (error) return [];
  return (data ?? []) as unknown as ProjectWithContact[];
}
