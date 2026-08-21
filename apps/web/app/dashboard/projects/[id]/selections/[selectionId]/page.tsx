import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';
import {
  getAllowanceBudgetLines,
  getProjectSelections,
  getSelection,
  getSelectionSigningSessions,
  getSelectionThread,
} from '@/lib/services/selections';
import { SelectionSheet } from './selection-sheet';

/**
 * The company SELECTION SHEET — §9.1. [S171, stage 3]
 *
 * Owner/Admin/PM edit; Foreman reads and edits internal notes; Crew and Sub
 * land here from the tab and see what the tab shows plus the thread. What each
 * role gets is decided by RLS in `getSelection()`: a reader the floors exclude
 * receives `amounts: null` and `notes: null`, and the sheet renders a dash —
 * never a zero, never an empty textarea that looks editable.
 */
export default async function SelectionSheetPage({ params }: { params: { id: string; selectionId: string } }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('user_id', user.id)
    .eq('is_deleted', false)
    .single();
  if (!profile) redirect('/dashboard');

  const selection = await getSelection(params.selectionId, supabase);
  if (!selection || selection.project_id !== params.id) notFound();

  const [areas, allowances, thread, sessions] = await Promise.all([
    getProjectSelections(params.id, supabase),
    getAllowanceBudgetLines(params.id, supabase),
    getSelectionThread(params.selectionId, supabase),
    getSelectionSigningSessions(params.selectionId, supabase),
  ]);

  return (
    <SelectionSheet
      projectId={params.id}
      role={profile.role}
      myProfileId={profile.id}
      selection={selection}
      areas={areas.filter((a) => a.id !== '__unassigned__').map((a) => ({ id: a.id, name: a.name }))}
      allowances={allowances}
      thread={thread}
      sessions={sessions.map((s) => ({ id: s.id, status: s.status, signed_at: s.signed_at, superseded_at: s.superseded_at, signer_name: s.signer_name, declined_at: s.declined_at, decline_notes: s.decline_notes }))}
    />
  );
}
