import { createClient } from '@/lib/supabase-server';
import { getMyMember } from '@/lib/services/members';

// S118 item 16 — documents filed against a PERSON. Server reads.
//
// ⚠️ THE DATABASE DECIDES WHO SEES WHAT (20262060000000): Owner/Admin read the
// company's; an employee reads only their OWN live documents. These functions add
// a member filter for the screen's purpose, never as the security boundary.
// The table and its bucket are read by nothing else in the app — see the
// migration header for why they are not `files`.

export interface EmployeeDocument {
  id: string;
  member_id: string;
  file_name: string;
  file_path: string;
  file_size: number;
  mime_type: string | null;
  created_at: string;
  is_deleted: boolean;
}

const COLS = 'id, member_id, file_name, file_path, file_size, mime_type, created_at, is_deleted';

/** One person's live documents (Owner/Admin screen). Newest first. */
export async function getEmployeeDocuments(memberId: string): Promise<EmployeeDocument[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('employee_documents')
    .select(COLS)
    .eq('member_id', memberId)
    .eq('is_deleted', false)
    .order('created_at', { ascending: false });
  if (error) return [];
  return (data ?? []) as EmployeeDocument[];
}

/**
 * The signed-in person's OWN documents (account pages, desktop and /m).
 * Filtered to their own member row explicitly: for an Owner/Admin, RLS alone
 * would return the whole company's.
 */
export async function getMyEmployeeDocuments(): Promise<EmployeeDocument[]> {
  const me = await getMyMember();
  if (!me) return [];
  return getEmployeeDocuments(me.id);
}
