import Link from 'next/link';

// M6M — shared primitives for the §4.13 list screens.
//
// SERVER-SAFE ON PURPOSE. Nothing here is a client component: the six hamburger
// destinations are read-only surfaces (§4.13's common rules), their chips are
// links carrying a search param, and their rows are static. Keeping the whole
// set server-rendered means no client bundle for data and no hydration to wait
// on before the offline strip or the tab bar are usable.

// ---------------------------------------------------------------------------
// §4.13 filter chips.
//
// BOUND TO THE SERVICE FUNCTION, NOT FILTERED IN THE BROWSER. §4.13 specs each
// chip row as "bound to getX({ ... })", so the selection is a search param the
// server component reads and passes to the service call. A client-side filter
// over a full fetch would satisfy the visible behaviour and break the binding
// rule — and would quietly page-cap any list that grows.
//
// Single-select is structural: one param, one active value, no multi-state.
// ---------------------------------------------------------------------------
export type Chip = {
  /** Search-param value. `null` is the unfiltered "All" chip. */
  value: string | null;
  label: string;
};

export function FilterChips({
  chips,
  active,
  basePath,
  param,
}: {
  chips: readonly Chip[];
  active: string | null;
  basePath: string;
  param: string;
}) {
  return (
    <div
      data-testid="m-chips"
      role="group"
      aria-label="Filter"
      className="flex gap-[8px] overflow-x-auto pb-[2px]"
    >
      {chips.map((chip) => {
        const isActive = chip.value === active;
        const href = chip.value === null ? basePath : `${basePath}?${param}=${chip.value}`;
        return (
          <Link
            key={chip.label}
            href={href}
            data-testid={`m-chip-${chip.label}`}
            data-active={isActive ? 'true' : 'false'}
            aria-current={isActive ? 'true' : undefined}
            // 44px min height — §2's floor. Chips are not in the sub-44px
            // exemption, which covers markup colour swatches only.
            className={`flex min-h-[44px] shrink-0 items-center rounded-full border px-[14px] text-[14px] font-semibold transition-transform duration-150 ease-out active:scale-95 ${
              isActive
                ? 'border-m6m-blue bg-m6m-blue text-white'
                : 'border-m6m-border bg-m6m-card text-m6m-navy'
            }`}
          >
            {chip.label}
          </Link>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// §4.13's common rules: "Each renders the app-wide offline strip PLUS ITS OWN
// EMPTY STATE ... The empty state is per-screen and says what is missing, never
// a generic spinner." The copy is the screen's, so it is passed in.
// ---------------------------------------------------------------------------
export function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <p
      data-testid="m-empty"
      className="rounded-[15px] border border-dashed border-m6m-border bg-m6m-card px-[16px] py-[22px] text-center text-[15px] text-m6m-muted"
    >
      {children}
    </p>
  );
}

// ---------------------------------------------------------------------------
// A status pill ALWAYS CARRIES ITS TEXT. §4.13.4 and §4.13.6 both say "carrying
// text", and A-46e/A-49c assert it — the same accessibility class as A-10b and
// A-24. `tone` may tint; it may never be the only signal.
// ---------------------------------------------------------------------------
export function StatusPill({
  label,
  tone = 'muted',
}: {
  label: string;
  tone?: 'muted' | 'danger' | 'blue';
}) {
  const toneClass =
    tone === 'danger'
      ? 'border-m6m-danger-border text-m6m-danger'
      : tone === 'blue'
        ? 'border-m6m-blue text-m6m-blue'
        : 'border-m6m-border text-m6m-muted';
  return (
    <span
      data-testid="m-status-pill"
      className={`shrink-0 rounded-full border bg-m6m-card px-[8px] py-[2px] font-mono text-[11px] font-semibold ${toneClass}`}
    >
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// §2's MONEY TOKEN (D-46). One format for every currency figure on /m.
//
//   positive   $1,234.56
//   negative   -$1,234.56      minus BEFORE the symbol
//   zero       $0.00
//   null       —               the em-dash, NEVER $0.00
//
// NOT INVENTED — this is the format desktop already uses. `style: 'currency'`
// with USD in en-US produces exactly the first three, matching the 15 desktop
// call sites (e.g. dashboard/projects/[id]/page.tsx:25, components/expenses/
// expense-ui.tsx:11) and the PDF templates' hand-rolled `-$` formatter, which
// agree on every case.
//
// THE NULL BRANCH IS THE ONE A NAIVE CALL GETS WRONG. `Number(null ?? 0)`
// renders $0.00, and on a field screen "$0.00" and "not recorded" are different
// facts — the same rule §4.11.1 applies to null dates. A-50 asserts all four.
//
// §2 leaves this function's HOME open (here now, packages/shared/utils/
// eventually), which is why A-50 asserts the rendered string rather than a
// function name: the criterion survives the move.
// ---------------------------------------------------------------------------
export function formatMoney(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return '—';
  const n = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

// ---------------------------------------------------------------------------
// DAYS LEFT — §8a's binding, and the reason it is a function and not an
// expression inlined at two call sites.
//
// SIGNED, AND NULL IS A THIRD STATE. §8a: "**Signed** — it goes negative past
// target — and `null` when the date is unset". A-10e (M-2's card) and A-11d
// (M-3's stat) each assert all THREE states, so a build that clamps at zero, or
// that renders `0` for a missing date, fails both.
//
// The arithmetic is the desktop precedent verbatim —
// app/dashboard/projects/[id]/page.tsx:104-111 — including the 'T00:00:00'
// suffix on both sides. That suffix is load-bearing: `new Date('2026-08-05')`
// parses as UTC midnight while `new Date('2026-08-05T00:00:00')` parses as
// LOCAL midnight, and mixing the two puts the boundary hours off by the
// timezone offset. Two surfaces disagreeing about what "today" means is exactly
// the class of bug §8a's "reference derivation" citations exist to prevent.
// ---------------------------------------------------------------------------
export function daysLeft(targetEndDate: string | null, today: string): number | null {
  if (!targetEndDate) return null;
  return Math.round(
    (new Date(`${targetEndDate}T00:00:00`).getTime() - new Date(`${today}T00:00:00`).getTime()) /
      86400000
  );
}

/**
 * `12 days left` · `-3 days left` · `—`.
 *
 * THE NEGATIVE IS RENDERED AS A NEGATIVE, not reworded to "3 days over" and not
 * clamped — A-10e and A-11d both say "a **negative** count past target rather
 * than a clamp at zero", and the desktop KPI it cites renders the signed number
 * verbatim (`String(daysToTarget)`). Rewording would drop the minus sign and
 * make the two surfaces disagree in the one state that matters most.
 *
 * The em-dash is the null state, NEVER `0` — the same distinction §2's money
 * token draws between "$0.00" and "not recorded".
 */
export function daysLeftLabel(targetEndDate: string | null, today: string): string {
  const n = daysLeft(targetEndDate, today);
  return n === null ? '—' : `${n} days left`;
}

// ---------------------------------------------------------------------------
// THE 76px TILE — §3.3's geometry, reused by §4.3's nine and §4.7's four.
//
// ONE COMPONENT, THREE CALLERS, BY RULE. §4.11's common rules open with
// "Patterns are reused, never re-invented ... hubs use the 76px tile grid
// (§3.3)". The sheet's own tiles stay in mobile-shell.tsx because they carry
// sheet-only state (the current-location highlight, A-3c); the geometry below
// is the same 76px box, icon top-left #2f49d1, bold 15px label bottom-left,
// optional badge top-right.
//
// THE BADGE TONE IS SPECIFIED PER TILE AND IS NOT A FUNCTION OF THE NUMBER.
// §4.3: "Change Orders and Punch List amber, Deliveries red, Photos and Team
// plain mono." A-12b asserts exactly that mapping, so tone is a prop the caller
// sets from the spec's list — not something derived from whether a count is
// non-zero, which would make the colours data-dependent and A-12b unassertable
// on a quiet project.
// ---------------------------------------------------------------------------
export type BadgeTone = 'amber' | 'danger' | 'mono';

export function TileGrid({
  children,
  testId,
}: {
  children: React.ReactNode;
  testId: string;
}) {
  return (
    <div data-testid={testId} className="grid grid-cols-2 gap-[10px]">
      {children}
    </div>
  );
}

export function Tile({
  href,
  label,
  icon,
  badge,
  tone = 'mono',
  testId,
}: {
  href: string;
  label: string;
  icon: React.ReactNode;
  /** Rendered verbatim. Null renders no badge at all, not an empty slot. */
  badge?: string | null;
  tone?: BadgeTone;
  testId: string;
}) {
  const badgeClass =
    tone === 'amber'
      ? 'text-m6m-amber'
      : tone === 'danger'
        ? 'text-m6m-danger'
        : 'text-m6m-muted';

  return (
    <Link
      href={href}
      data-testid={testId}
      data-tone={tone}
      // 76px (§2's tile target), so A-5/A-30e's >=44px floor holds with room.
      className="relative flex h-[76px] flex-col justify-between rounded-[14px] border border-m6m-border bg-m6m-card p-[12px] transition-transform duration-150 ease-out active:scale-[.98]"
    >
      <span className="text-m6m-blue" aria-hidden>
        {icon}
      </span>
      <span className="text-[15px] font-bold leading-none text-m6m-navy">{label}</span>
      {badge !== null && badge !== undefined ? (
        // §2 — every number is mono, badges included.
        <span
          data-testid="m-tile-badge"
          className={`absolute right-[10px] top-[10px] max-w-[60%] truncate text-right font-mono text-[11px] font-semibold ${badgeClass}`}
        >
          {badge}
        </span>
      ) : null}
    </Link>
  );
}

/** Mono uppercase section label — M-8's pattern, reused by §4.13.2's day headers. */
export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-[8px] mt-[18px] font-mono text-[11px] font-medium uppercase tracking-wide text-m6m-muted">
      {children}
    </h2>
  );
}

/** The shared 58px list row (§2's list/menu row size). */
export function ListRow({
  children,
  testId,
}: {
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <li
      data-testid={testId}
      className="flex min-h-[58px] items-center gap-[10px] border-b border-m6m-border px-[2px] py-[10px] last:border-b-0"
    >
      {children}
    </li>
  );
}

// ---------------------------------------------------------------------------
// §4.13.4 / §4.13.6 — phone, mobile and email are TAP-TO-ACT. A-46c.
// 44px square so the floor holds; the label is the icon glyph's accessible name.
// ---------------------------------------------------------------------------
export function ContactActions({
  phone,
  mobile,
  email,
  name,
}: {
  phone?: string | null;
  mobile?: string | null;
  email?: string | null;
  name: string;
}) {
  // `mobile` wins when both are present — it is the number that reaches a person
  // on site, which is the whole argument for these screens existing on a phone.
  const tel = mobile?.trim() || phone?.trim() || null;
  const mail = email?.trim() || null;
  if (!tel && !mail) return null;

  return (
    <div className="ml-auto flex shrink-0 items-center gap-[6px]">
      {tel ? (
        <a
          href={`tel:${tel}`}
          data-testid="m-tel"
          aria-label={`Call ${name}`}
          className="flex h-11 w-11 items-center justify-center rounded-full border border-m6m-border bg-m6m-card text-m6m-blue"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.2a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2Z"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </a>
      ) : null}
      {mail ? (
        <a
          href={`mailto:${mail}`}
          data-testid="m-mail"
          aria-label={`Email ${name}`}
          className="flex h-11 w-11 items-center justify-center rounded-full border border-m6m-border bg-m6m-card text-m6m-blue"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
            <rect x="2" y="4" width="20" height="16" rx="2" stroke="currentColor" strokeWidth="2" />
            <path d="m2 7 10 6 10-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </a>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// §4.11.16 / D-55 — A ROW THAT OPENS ITS OWN PAGE.
//
// ⚠️ WHY THIS IS NOT JUST `<ListRow>` WITH A `<Link>` WRAPPED ROUND IT.
//
// §4.11.16 is explicit that on M-17/M-29 the row gains a navigation target
// **around two existing buttons**: the `tel:` and `mailto:` circles stay, and
// "the affordances must not swallow each other". Nesting an <a> inside an <a>
// is invalid HTML — the browser closes the outer one early, and what actually
// ships is a row where the call button either navigates to the contact or does
// nothing, depending on the engine. Neither is the spec.
//
// So the link and the trailing actions are SIBLINGS. The link fills the row's
// main area and stretches to the full row via `after:absolute` — a click
// anywhere that is not a button hits the link — while `trailing` renders above
// it (`relative z-10`) and keeps its own 44px targets.
//
// All three targets clear §2's 44px floor: the row is min-h-58px and the
// circles are h-11 w-11.
// ---------------------------------------------------------------------------
export function ListRowLink({
  href,
  children,
  trailing,
  testId,
  label,
}: {
  href: string;
  children: React.ReactNode;
  /** Rendered OUTSIDE the link — tap-to-act circles and the like. */
  trailing?: React.ReactNode;
  testId?: string;
  /** Accessible name for the row link when the visible content is a fragment. */
  label?: string;
}) {
  return (
    <li
      data-testid={testId}
      className="relative flex min-h-[58px] items-center gap-[10px] border-b border-m6m-border px-[2px] py-[10px] last:border-b-0"
    >
      <Link
        href={href}
        data-testid="m-row-link"
        aria-label={label}
        // ⚠️ `min-h-[44px]` IS LOAD-BEARING AND WAS ADDED AFTER A-30e CAUGHT IT.
        //
        // The `after:inset-0` pseudo-element already makes the whole 58px row
        // clickable, so the HIT AREA was never the problem. But the anchor's own
        // box was only as tall as its text — 39.75px on a two-line contact row —
        // and A-30e measures element boxes. Leaving it would have meant the
        // thing the suite measures and the thing a thumb lands on were different
        // sizes, which is exactly the discrepancy §2's floor exists to prevent.
        //
        // flex-col + justify-content centres the content when the row is taller
        // than its text, so nothing shifts visually.
        className="flex min-h-[44px] min-w-0 flex-1 flex-col justify-center after:absolute after:inset-0 after:content-['']"
      >
        {children}
      </Link>
      {trailing ? <div className="relative z-10 shrink-0">{trailing}</div> : null}
    </li>
  );
}

// ---------------------------------------------------------------------------
// A-66 — a role that lacks access LANDS SOMEWHERE THAT EXPLAINS ITSELF.
//
// "never a blank screen, never a silent bounce to the hub with no message." A
// route guard that redirects and says nothing has handed the user a bug rather
// than a permission — which is the failure mode §4.11.10a says all three of its
// options can produce by accident.
//
// The guard bounces to the LIST the row lives on, with `?denied=<surface>`, and
// the list renders this. Staying on the list matters: the user is returned to
// something they can still use, with an explanation, rather than to the hub.
// ---------------------------------------------------------------------------
export const DENIED_COPY: Record<string, string> = {
  co: 'Change order details are not available to subcontractors.',
  member: 'Team member details are not available to subcontractors.',
  contact: 'Contact details are not available to subcontractors.',
  file: 'Opening documents is not available to subcontractors.',
};

export function DeniedNotice({ kind }: { kind: string | undefined }) {
  const copy = kind ? DENIED_COPY[kind] : undefined;
  if (!copy) return null;
  return (
    <p
      data-testid="m-denied"
      role="status"
      className="mb-[12px] rounded-[15px] border border-m6m-border bg-m6m-card px-[14px] py-[12px] text-[14px] text-m6m-navy"
    >
      {copy}
    </p>
  );
}

// ---------------------------------------------------------------------------
// Detail-screen field rows. A label and a value, mono where §2 says mono.
// Renders NOTHING when the value is absent — §4.13's "no empty slot where
// null", applied to the five detail views.
// ---------------------------------------------------------------------------
export function DetailField({
  label,
  value,
  mono = false,
  testId,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
  testId?: string;
}) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div data-testid={testId} className="border-b border-m6m-border py-[10px] last:border-b-0">
      <p className="font-mono text-[11px] font-medium uppercase tracking-wide text-m6m-muted">
        {label}
      </p>
      <p className={`mt-[3px] text-[15px] text-m6m-navy ${mono ? 'font-mono' : ''}`}>{value}</p>
    </div>
  );
}

/** The card the detail fields sit in. */
export function DetailCard({
  children,
  testId,
}: {
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <section
      data-testid={testId}
      className="rounded-[15px] border border-m6m-border bg-m6m-card px-[14px]"
    >
      {children}
    </section>
  );
}
