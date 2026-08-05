'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

// M6M §4.7 — M-7's project context row: "a project context row (58px) naming
// the project the tiles apply to, TAPPABLE TO SWITCH."
//
// WHY THE SWITCHER IS IN-PAGE AND NOT A ROUTE. §1's route tree gives M-7 exactly
// one file — `field/page.tsx`. There is no `field/switch` route, and inventing
// one would add a mobile route the spec does not list. So the row expands in
// place and each choice is a Link back to /m/field with the project in the
// query string: the switch is a real navigation (deep-linkable, browser-back-
// able) without a new route.
//
// A-13c is the criterion: the row NAMES the project the tiles apply to, tapping
// it switches, AND THE TILES THEN REFLECT THE NEW PROJECT. The tiles re-render
// server-side from the new `?project=` value, so the second half is structural
// rather than a state update this component has to remember to propagate.

export type ProjectChoice = { id: string; name: string; subLine: string };

export function ProjectContextRow({
  current,
  choices,
}: {
  current: ProjectChoice;
  choices: ProjectChoice[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mb-[14px]">
      <button
        type="button"
        data-testid="m-project-context"
        data-project-id={current.id}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        // 58px — §2's list/menu row size, and above the 44px floor (A-5).
        className="flex min-h-[58px] w-full items-center gap-[10px] rounded-[14px] border border-m6m-border bg-m6m-card px-[14px] text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="block font-mono text-[11px] uppercase tracking-wide text-m6m-muted">
            Project
          </span>
          <span className="block truncate text-[16px] font-bold leading-tight text-m6m-navy">
            {current.name}
          </span>
        </span>
        <ChevronDown
          size={20}
          strokeWidth={2}
          aria-hidden
          className={`shrink-0 text-m6m-blue transition-transform duration-150 ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>

      {open ? (
        <ul
          data-testid="m-project-switcher"
          className="mt-[8px] overflow-hidden rounded-[14px] border border-m6m-border bg-m6m-card"
        >
          {choices.map((c) => (
            <li key={c.id} className="border-b border-m6m-border last:border-b-0">
              <Link
                href={`/m/field?project=${c.id}`}
                data-testid="m-project-choice"
                data-project-id={c.id}
                aria-current={c.id === current.id ? 'true' : undefined}
                className="flex min-h-[58px] items-center px-[14px] py-[10px]"
              >
                <span className="min-w-0 flex-1">
                  <span
                    className={`block truncate text-[15px] font-bold leading-tight ${
                      c.id === current.id ? 'text-m6m-blue' : 'text-m6m-navy'
                    }`}
                  >
                    {c.name}
                  </span>
                  {c.subLine ? (
                    <span className="mt-[2px] block truncate font-mono text-[11px] text-m6m-muted">
                      {c.subLine}
                    </span>
                  ) : null}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
