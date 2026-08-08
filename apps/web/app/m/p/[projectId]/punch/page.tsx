import Link from 'next/link';
import { getPunchLists, PUNCH_STATUS_LABELS, isItemClosed } from '@/lib/services/punch';
import { getMyMember } from '@/lib/services/members';
import { SectionHeader } from '../section-header';
import { EmptyState, FilterChips, ListRowLink, StatusPill, type Chip } from '../../../mobile-ui';

// D-55 — every row opens M-34. NO ROLE GATE, and that is deliberate: D-52's
// subcontractor exclusion was withdrawn [S110] and replaced by D-57's
// visibility NARROWING, which is enforced in the DATABASE
// (20260828000000_punch_subcontractor_visibility.sql). A sub sees only rows
// they are assigned or authored, so every row they can see here is one they
// may open. §4.11.10a: gating a fourth surface "because there is a pattern
// now" exceeds D-54.

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

  // D-61 / A-67c — the parent list is a LABEL ON THE ROW, not a level of
  // hierarchy. D-60 makes every item belong to a list the author chose, which
  // invites the inference that M-14 should group by list; D-61 rules it out
  // explicitly, because three things break if it nests: the Mine/Open/All chips
  // filter ITEMS and mean nothing over lists, D-16's counters would stop
  // agreeing with M-3's badge, and A-34b asserts a flat `open <= all` a grouped
  // list cannot express.
  //
  // So the name is looked up and rendered on the row. `m-punch-row` count still
  // equals the visible ITEM count, which is exactly what A-67c checks.
  const listNameByItemId = new Map<string, string>();
  for (const list of lists) {
    for (const item of list.items ?? []) listNameByItemId.set(item.id, list.name);
  }

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

      {/* A-56 — the create controls, for EVERY role including subcontractors.
          No `canReachDetail` here and no role prop: D-52 as corrected opens
          M-33 to all six roles, and gating these links would be the hidden half
          of a permission that does not exist. `punch_lists_insert_authenticated`
          admits every role too, so the second control carries no gate either.

          TWO CONTROLS AS OF D-63 [S121, Josh] — "punch lists are standalone".
          Reported from a device: the only control here said **New punch item**,
          and the sole way to bring a list into existence was an option buried in
          that form's picker. A list now exists in its own right and holds
          unlimited items, so it gets its own front door.

          THE ITEM STAYS PRIMARY. Item creation is the frequent act — a punch
          walk files many items into few lists — so it keeps the full-width blue
          treatment and the list control is the secondary beside it. Equal weight
          would misstate how often each is used. */}
      <div className="mt-[14px] flex items-stretch gap-[8px]">
        <Link
          href={`/m/p/${params.projectId}/punch/new`}
          data-testid="m-punch-new"
          className="flex min-h-[52px] flex-1 items-center justify-center rounded-[14px] bg-m6m-blue text-[15px] font-bold text-white"
        >
          New punch item
        </Link>
        <Link
          href={`/m/p/${params.projectId}/punch/lists/new`}
          data-testid="m-punch-list-new"
          className="flex min-h-[52px] shrink-0 items-center justify-center rounded-[14px] border border-m6m-blue px-[14px] text-[15px] font-bold text-m6m-blue"
        >
          New list
        </Link>
      </div>

      {items.length === 0 ? (
        <div className="pt-[18px]">
          <EmptyState>{emptyCopy}</EmptyState>
        </div>
      ) : (
        <ul className="mt-[14px] rounded-[15px] border border-m6m-border bg-m6m-card px-[12px]">
          {items.map((item) => (
            <ListRowLink
              key={item.id}
              testId="m-punch-row"
              href={`/m/p/${params.projectId}/punch/${item.id}`}
              label={item.title}
            >
                <p className="truncate text-[17px] font-bold leading-tight text-m6m-navy">
                  {item.title}
                </p>
                {/* D-61's row label. Rendered even when location and trade are
                    both null — knowing which list an item is in is the whole
                    point of D-60's targeting, and hiding it on sparse rows
                    would make the choice invisible on exactly the items where
                    it is the only distinguishing fact. */}
                <p className="mt-[2px] truncate font-mono text-[11px] text-m6m-muted">
                  {[listNameByItemId.get(item.id), item.location, item.trade]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
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
            </ListRowLink>
          ))}
        </ul>
      )}
    </div>
  );
}
