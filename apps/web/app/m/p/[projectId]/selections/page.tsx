import { createClient } from '@/lib/supabase-server';
import { getProjectSelections } from '@/lib/services/selections';
import { SectionHeader } from '../section-header';
import { EmptyState, SectionLabel, StatusPill } from '../../../mobile-ui';

// [S171, stage 3] /m counterpart of the project Selections tab (§9.2, §9.5
// parity). Read-only, grouped by area, NO COSTS — the same getProjectSelections()
// as desktop, under the caller's RLS, with `amounts` never reaching the markup.
//
// NOT A HUB TILE. The project hub is a ruled nine-tile set ("NINE TILES, AND
// NONE IS FINANCE — A-12, D-9 as narrowed by D-37"); adding a tenth is an M6M
// ruling change, flagged in the stage 3 report. The route is reachable by URL
// and from the desktop tab's parity contract; the tile is Josh's call.
//
// Editing is desktop-only for now: the sheet's four image paths (drag/drop,
// clipboard paste) and the catalog picker are desktop affordances, and
// M6M-edit-surfaces-spec decides which edits get an /m surface. Flagged too.

const STATUS: Record<string, string> = {
  draft: 'Draft',
  in_discussion: 'In discussion',
  awaiting_approval: 'Awaiting approval',
  approved: 'Approved',
};

export default async function MobileSelectionsPage({ params }: { params: { projectId: string } }) {
  const supabase = await createClient();
  const areas = (await getProjectSelections(params.projectId, supabase)).filter((a) => a.selections.length > 0);

  return (
    <>
      <SectionHeader projectId={params.projectId} title="Selections" />
      <div className="px-[16px] pb-[24px]" data-testid="m-selections">
        {areas.length === 0 && <EmptyState>No selections yet.</EmptyState>}
        {areas.map((area) => (
          <section key={area.id} className="mt-[14px]" data-testid={`m-selection-area-${area.id}`}>
            <SectionLabel>{area.name}</SectionLabel>
            <ul className="mt-[6px] divide-y divide-m6m-border rounded-[12px] border border-m6m-border bg-white">
              {area.selections.map((s) => {
                const chosen = s.options.filter((o) => o.is_chosen);
                return (
                  <li key={s.id} className="px-[14px] py-[12px]" data-testid={`m-selection-${s.id}`}>
                    <div className="flex items-center justify-between gap-[8px]">
                      <span className="text-[15px] font-semibold text-m6m-navy">{s.name}</span>
                      <StatusPill label={STATUS[s.status] ?? s.status} tone={s.status === 'awaiting_approval' ? 'blue' : 'muted'} />
                    </div>
                    {chosen.length > 0 ? (
                      <p className="mt-[2px] text-[13px] text-m6m-muted">
                        Chosen: {chosen.map((o) => o.name).join(', ')}
                        {chosen[0]?.spec_detail ? ` — ${chosen[0].spec_detail}` : ''}
                      </p>
                    ) : s.options.length > 0 ? (
                      <p className="mt-[2px] text-[13px] text-m6m-muted">{s.options.length} option{s.options.length === 1 ? '' : 's'} offered</p>
                    ) : (
                      <p className="mt-[2px] text-[13px] text-m6m-muted">In discussion</p>
                    )}
                    {s.client_supplied && <p className="text-[12px] text-m6m-muted">Client supplies this item</p>}
                    {s.due_date && <p className="text-[12px] text-m6m-muted">Due {s.due_date}</p>}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}
