import { redirect } from 'next/navigation';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import { createClient } from '@/lib/supabase-server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { getTasks, getPhases } from '@/lib/services/tasks';
import { ensureScheduleFresh } from '@/lib/critical-path/recompute';
import { loadCriticalPathData } from '@/lib/critical-path/load';
import { canSeeCriticalPathTab } from '@/lib/critical-path/access';
import { loadPendingEdits } from '@/lib/critical-path/pending';
import { getMyMember } from '@/lib/services/members';
import { CriticalPathTab, type CpHistoryRow, type CpLostDay } from './critical-path-tab';

// S122 Part 4 — Projects → Work → Critical Path. Staff supervisors only
// (lib/critical-path/access.ts); this page REPEATS the tab strip's gate.
// Everything is read as the CALLER (RLS decides), after the read-check has
// brought the stored dates up to date (Q9 trigger 9 and the net under the rest).
// Float is computed in the browser from the engine input — staff only; the
// client's read is Part 7's narrowed function and never reaches this page.

export default async function CriticalPathPage({ params }: { params: { id: string } }) {
  const supabase = (await createClient()) as unknown as SupabaseClient<Database>;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('user_id', user.id)
    .eq('is_deleted', false)
    .single();
  if (!profile) redirect('/dashboard');
  if (!canSeeCriticalPathTab(profile.role)) redirect(`/dashboard/projects/${params.id}/schedule`);

  const { data: visible } = await supabase.from('projects').select('id, name').eq('id', params.id).maybeSingle();
  if (!visible) redirect('/dashboard/projects');

  const fresh = await ensureScheduleFresh(getSupabaseAdmin() as SupabaseClient<Database>, params.id);
  if (fresh.status === 'failed') console.error(`[critical-path page] recompute ${params.id}: ${fresh.error}`);

  const [loaded, tasks, phases, history, lost, editor, pending, me] = await Promise.all([
    loadCriticalPathData(supabase, params.id),
    getTasks(params.id),
    getPhases(params.id),
    // Q18-A: Owner/Admin, a PM on the project, its PE. A foreman reads none (RLS).
    supabase
      .from('project_finish_history')
      .select('id, previous_finish, new_finish, cause_kind, cause_task_id, created_at')
      .eq('project_id', params.id)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(20),
    supabase
      .from('project_lost_days')
      .select('id, start_date, end_date, reason, icon')
      .eq('project_id', params.id)
      .eq('is_deleted', false)
      .order('start_date', { ascending: true }),
    supabase.rpc('critical_path_schedule_editor', { p_project_id: params.id }),
    // [S122 Part 5] Held changes — the approval lives INSIDE this tab [Josh].
    loadPendingEdits(supabase, params.id),
    getMyMember(),
  ]);
  if (!pending.ok) console.error(`[critical-path page] pending ${params.id}: ${pending.error}`);
  if (!loaded.ok) {
    console.error(`[critical-path page] load ${params.id}: ${loaded.error}`);
    throw new Error('The schedule could not be read.');
  }
  if (history.error) console.error(`[critical-path page] history ${params.id}: ${history.error.message}`);
  if (lost.error) console.error(`[critical-path page] lost days ${params.id}: ${lost.error.message}`);

  return (
    <CriticalPathTab
      projectId={params.id}
      role={profile.role}
      canEdit={editor.data === true}
      settings={loaded.data.settings}
      input={loaded.data.input}
      usingDefaultCalendar={loaded.data.usingDefaultCalendar}
      tasks={tasks}
      phases={phases}
      history={(history.data ?? []) as CpHistoryRow[]}
      historyVisible={!history.error && ['owner', 'admin', 'project_manager', 'project_executive'].includes(profile.role)}
      lostDays={(lost.data ?? []) as CpLostDay[]}
      pending={pending.ok ? pending.edits : []}
      pendingError={!pending.ok}
      myMemberId={me?.id ?? null}
    />
  );
}
