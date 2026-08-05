import { getPunchLists, PUNCH_STATUS_LABELS, isItemClosed } from '@/lib/services/punch';
import { getMyMember } from '@/lib/services/members';
import { SectionHeader } from '../section-header';
import { EmptyState, FilterChips, ListRow, StatusPill, type Chip } from '../../../mobile-ui';

// M6M §4.11.4 — M-14 · Punch List.
//
// THE CHIPS USE D-16's TWO EXPRESSIONS, NOT NEW ONES (A-34): "Mine" is
// assignee_id = my member id, "Open" is status IN ('open','in_progress'). Those
// are the same two the M-3 Punch stat and the tile badge use, which is what
// keeps the badge and this screen in agreement.
//
// THE D-16 DIVERGENCE IS INHERITED, NOT RE-DECIDED (A-34b). isItemClosed()
// (punch.ts:36) and D-16's "open" are NOT complements: an item at 'complete'
// awaiting verification is neither open NOR closed, so it appears under All and
// under neither filter. M-14 must not invent a third definition to tidy that up.

const CHIPS: readonly Chip[] = [
  { value: 'mine', label: 'Mine' },
  { value: 'open', label: 'Open' },
  { value: null, label: 'All' },
];

export default async function ProjectPunchPage({
  params,
  searchParams,
}: {
  params: { projectId: string };
  searchParams: { filter?: string };
}) {
  const raw = searchParams.filter;
  const active = raw === 'mine' || raw === 'open' ? raw : null;

  const [lists, myMember] = await Promise.all([
    getPunchLists(params.projectId),
    getMyMember(),
  ]);

  const allItems = lists.flatMap((l) => l.items ?? []);

  const items =
    active === 'mine'
      ? allItems.filter((i) => i.assignee_id && myMember && i.assignee_id === myMember.id)
      : active === 'open'
        ? allItems.filter((i) => i.status === 'open' || i.status === 'in_progress')
        : allItems;

  const emptyCopy =
    active === 'mine' ? 'Nothing assigned to you.' : active === 'open' ? 'Nothing open.' : 'No punch items.';

  return (
    <div className="px-[18px] pb-[18px] pt-[14px]">
      <SectionHeader projectId={params.projectId} title="Punch List" />

      <FilterChips
        chips={CHIPS}
        active={active}
        basePath={`/m/p/${params.projectId}/punch`}
        param="filter"
      />

      {items.length === 0 ? (
        <div className="pt-[18px]">
          <EmptyState>{emptyCopy}</EmptyState>
        </div>
      ) : (
        <ul className="mt-[14px] rounded-[15px] border border-m6m-border bg-m6m-card px-[12px]">
          {items.map((item) => (
            <ListRow key={item.id} testId="m-punch-row">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[17px] font-bold leading-tight text-m6m-navy">
                  {item.title}
                </p>
                {item.location || item.trade ? (
                  <p className="mt-[2px] truncate font-mono text-[11px] text-m6m-muted">
                    {[item.location, item.trade].filter(Boolean).join(' · ')}
                  </p>
                ) : null}
                <p className="mt-[3px] flex flex-wrap items-center gap-[6px]">
                  <StatusPill label={PUNCH_STATUS_LABELS[item.status] ?? item.status} />
                  {item.priority ? (
                    <span className="font-mono text-[11px] font-semibold text-m6m-muted">
                      {item.priority}
                    </span>
                  ) : null}
                  {/* Inherited divergence, surfaced rather than tidied: an item
                      at 'complete' is not closed until verified. */}
                  {item.status === 'complete' && !isItemClosed(item) ? (
                    <span className="font-mono text-[11px] text-m6m-muted">awaiting verification</span>
                  ) : null}
                </p>
              </div>
            </ListRow>
          ))}
        </ul>
      )}
    </div>
  );
}
