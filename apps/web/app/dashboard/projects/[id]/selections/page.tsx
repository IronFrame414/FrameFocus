import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';
import { getProjectSelections } from '@/lib/services/selections';
import { SelectionsTab } from './selections-tab';

/**
 * The project SELECTIONS tab — §9.2. [S171, stage 3]
 *
 * Visible to EVERY role that can view the project, subcontractors included
 * (Q10), and it carries NO COSTS OF ANY KIND — not a column, not a tooltip,
 * not a sum. Josh: "selections page on project does not have costs." That is
 * not a rendering choice this page makes: `getProjectSelections()` reads
 * `selection_option_amounts` under the caller's RLS, and a sub/foreman/crew
 * gets NO ROW from the floor (20261026000000). This page additionally never
 * passes `amounts` to the tab component, so even an owner's amounts are not
 * in this surface — money is read on the sheet, by the roles that may.
 */
export default async function ProjectSelectionsPage({ params }: { params: { id: string } }) {
  const supabase = await createClient();
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

  const areas = await getProjectSelections(params.id, supabase);
  // Strip money and notes BEFORE the client boundary — the tab is a no-cost surface.
  const safe = areas.map((a) => ({
    id: a.id,
    name: a.name,
    selections: a.selections.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      due_date: s.due_date,
      status: s.status,
      mode: s.mode,
      client_supplied: s.client_supplied,
      allowance_description: s.allowance?.description ?? null,
      options: s.options.map((o) => ({
        id: o.id,
        name: o.name,
        spec_detail: o.spec_detail,
        is_chosen: o.is_chosen,
        image_file_id: o.image_file_id ?? o.link_thumbnail_file_id ?? null,
        link_url: o.link_url,
      })),
    })),
  }));

  return <SelectionsTab projectId={params.id} role={profile.role} areas={safe} />;
}
