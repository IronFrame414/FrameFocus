import { getMembers } from '@/lib/services/members';
import { SetMobileHeader } from '../mobile-header';
import { EmptyState, FilterChips, ListRow, type Chip } from '../mobile-ui';

// M6M §4.13.5 — M-28 · Team.
//
// ─────────────────────────────────────────────────────────────────────────────
// BOUND TO getMembers(), NOT getTeamMembers(). THEY ARE NOT INTERCHANGEABLE.
// ─────────────────────────────────────────────────────────────────────────────
//   getMembers()      -> company_members  — the operational roster
//                        (display_name, member_type, schedule_color)
//   getTeamMembers()  -> profiles         — login accounts (first/last, role)
//
// §4.13.5 rules getMembers() for three reasons: it is the entity M-18 already
// renders for a project's crew, so the two agree by construction; schedule_color
// gives the same avatar tint M-18 and M-12 use; and it INCLUDES SUBCONTRACTOR
// MEMBERS, who are on site and are not `profiles` rows at all. Binding to
// getTeamMembers() would silently drop every sub from the roster — A-47 asserts
// exactly that, plus the absence of `profiles.role`.
//
// It is also what §3.3's Team tile badge is bound to (mobile-shell.tsx), so the
// badge and this screen cannot disagree — A-47b.

const CHIPS: readonly Chip[] = [
  { value: null, label: 'All' },
  // `company_members_member_type_check` permits exactly these two, so the chips
  // cover the domain and All = Crew ∪ Subs (A-47d).
  { value: 'crew', label: 'Crew' },
  { value: 'subcontractor', label: 'Subs' },
];

/** First initial of the first and last word of the roster name. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? '') : '';
  return (first + last).toUpperCase() || '?';
}

export default async function MobileTeamPage({
  searchParams,
}: {
  searchParams: { type?: string };
}) {
  const raw = searchParams.type;
  const active = raw === 'crew' || raw === 'subcontractor' ? raw : null;

  const members = await getMembers(active ? { member_type: active } : undefined);

  const emptyCopy =
    active === 'crew' ? 'No crew.' : active === 'subcontractor' ? 'No subs.' : 'No team members.';

  return (
    <div className="px-[18px] pb-[18px] pt-[14px]">
      <SetMobileHeader title="Team" sub="Company roster" />

      <FilterChips chips={CHIPS} active={active} basePath="/m/team" param="type" />

      {members.length === 0 ? (
        <div className="pt-[18px]">
          <EmptyState>{emptyCopy}</EmptyState>
        </div>
      ) : (
        <ul className="mt-[14px] rounded-[15px] border border-m6m-border bg-m6m-card px-[12px]">
          {members.map((m) => (
            <ListRow key={m.id} testId="m-member-row">
              {/* §4.13.5 — initials avatar tinted with schedule_color, FALLING
                  BACK TO §2's AMBER when null. The column is nullable and the
                  null case is the one a build skips; A-47e asserts it. */}
              <span
                data-testid="m-member-avatar"
                data-tint={m.schedule_color ?? '#f59e0b'}
                aria-hidden
                className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full font-mono text-[13px] font-semibold text-m6m-navy"
                style={{ background: m.schedule_color ?? '#f59e0b' }}
              >
                {initials(m.display_name)}
              </span>

              <div className="min-w-0 flex-1">
                <p className="truncate text-[17px] font-bold leading-tight text-m6m-navy">
                  {m.display_name}
                </p>
                <p
                  data-testid="m-member-type"
                  className="mt-[2px] font-mono text-[11px] font-semibold text-m6m-muted"
                >
                  {m.member_type === 'subcontractor' ? 'subcontractor' : 'crew'}
                </p>
              </div>

              {/* NO tap-to-act here, and it is a CUT rather than an omission:
                  company_members carries no phone or email column, and no named
                  list function selects profiles.phone. §4.13.5 cuts it rather
                  than deriving it — see TECH_DEBT #135's neighbour entry. */}
            </ListRow>
          ))}
        </ul>
      )}
    </div>
  );
}
