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
