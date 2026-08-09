'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

// M6M §4.2 — M-2's search field and card list.
//
// WHY THIS HALF IS A CLIENT COMPONENT AND THE CHIPS ARE NOT.
//   §4.2 ends "Search filters live", and A-9c asserts it: "Typing in the search
//   field filters the list WITHOUT A SUBMIT ACTION." That is the one behaviour
//   on this screen a server round-trip cannot give, so the input and the rows it
//   filters live here.
//   The CHIPS stay server-side Links (mobile-ui's FilterChips), because A-9's
//   single-select is structural in a search param — one param, one value, no
//   way to hold two — and because §4.13's screens already established that
//   pattern. Mixing the two is deliberate, not an inconsistency: the chip is a
//   navigation, the search is a filter over what that navigation returned.
//
// THE ROWS ARRIVE PRE-COMPUTED. Every figure on the card is derived on the
// server (§8a's bindings) and passed as a plain view-model. Nothing here
// queries, and nothing here recomputes a bound figure — this component decides
// only which of the given cards match the typed text.

export type ProjectCard = {
  id: string;
  name: string;
  /** `PRJ-### · {client}` — already composed, may be empty. */
  subLine: string;
  statusLabel: string;
  /** §8a: signed, or the em-dash when target_end_date is null. */
  daysLeftLabel: string;
  /** §8a's `{total} open` punch callout, or the em-dash at zero. */
  punchCallout: string;
  /** §4.2 — the project the caller's OPEN SEGMENT names. Zero or one card. */
  onSite: boolean;
};

export function ProjectsList({ cards }: { cards: ProjectCard[] }) {
  const [query, setQuery] = useState('');

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return cards;
    // Name AND sub-line: the sub-line carries the project number and the client,
    // which is how a foreman actually looks for a job.
    return cards.filter(
      (c) => c.name.toLowerCase().includes(q) || c.subLine.toLowerCase().includes(q)
    );
  }, [cards, query]);

  return (
    <>
      {/* §4.2 — "A 48px search field". Above §2's 44px floor already. */}
      <input
        type="search"
        data-testid="m-search"
        aria-label="Search projects"
        placeholder="Search projects"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="h-[48px] w-full rounded-[12px] border border-m6m-border bg-m6m-card px-[14px] text-[15px] text-m6m-navy placeholder:text-m6m-muted"
      />

      <div className="mt-[12px] flex flex-col gap-[11px]">
        {visible.length === 0 ? (
          <p
            data-testid="m-empty"
            className="rounded-[15px] border border-dashed border-m6m-border bg-m6m-card px-[16px] py-[22px] text-center text-[15px] text-m6m-muted"
          >
            {cards.length === 0 ? 'No projects.' : 'No projects match that search.'}
          </p>
        ) : (
          visible.map((c) => <Card key={c.id} card={c} />)
        )}
      </div>
    </>
  );
}

function Card({ card }: { card: ProjectCard }) {
  return (
    <Link
      href={`/m/p/${card.id}`}
      data-testid="m-project-card"
      data-on-site={card.onSite ? 'true' : 'false'}
      // §4.2 — 15px radius, 15-16px padding. The clocked-into project carries
      // the 1.5px #2f49d1 border; every other card carries the 1px card border.
      // Written as a ternary on the SAME element so the two can never both apply.
      className={`block rounded-[15px] bg-m6m-card p-[15px] transition-transform duration-150 ease-out active:scale-[.99] ${
        card.onSite ? 'border-[1.5px] border-m6m-blue' : 'border border-m6m-border'
      }`}
    >
      <div className="flex items-start gap-[10px]">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[17px] font-bold leading-tight text-m6m-navy">{card.name}</p>
          {card.subLine ? (
            <p className="mt-[3px] truncate font-mono text-[11px] text-m6m-muted">{card.subLine}</p>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-[4px]">
          {/* §4.2 — "status pill top-right (ALWAYS CARRIES TEXT, never colour
              alone)". A-10b. Deliberately untinted: a text label needs no fill
              to be read, and a fill would be a second, weaker signal. */}
          <span
            data-testid="m-status-pill"
            className="rounded-full border border-m6m-border bg-m6m-card px-[8px] py-[2px] font-mono text-[11px] font-semibold text-m6m-muted"
          >
            {card.statusLabel}
          </span>
          {/* §4.2 — the "On site" pill rides with the blue border, never alone.
              A-8 asserts BOTH on the same card; A-8b asserts that on a break /
              travel / shop segment NEITHER appears on any card. */}
          {card.onSite ? (
            <span
              data-testid="m-on-site"
              className="rounded-full border border-m6m-blue bg-m6m-card px-[8px] py-[2px] font-mono text-[11px] font-semibold text-m6m-blue"
            >
              On site
            </span>
          ) : null}
        </div>
      </div>

      {/* §4.2 as amended by D-19 — THE FOOTER IS DAYS-LEFT AND THE CALLOUT.
          There is NO progress bar and NO percentage: the card lost a row of
          height rather than gaining filler, and A-10d fails a build that puts
          either back. Do not add one. */}
      <div className="mt-[10px] flex items-center justify-between">
        <span data-testid="m-days-left" className="font-mono text-[13px] text-m6m-muted">
          {card.daysLeftLabel}
        </span>
        <span data-testid="m-punch-callout" className="font-mono text-[13px] text-m6m-muted">
          {card.punchCallout}
        </span>
      </div>
    </Link>
  );
}
