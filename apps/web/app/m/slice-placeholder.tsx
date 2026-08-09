'use client';

import { SetMobileHeader } from './mobile-header';

// NOT A SPECCED SCREEN. Read this before treating any of it as a design.
//
// This slice builds the SHELL (§1's layout, §3.1, §3.2, §3.3, §4.4's strip and
// M-4) and nothing else. M-2, M-5, M-6, M-7 and M-3 are later slices.
//
// They still need ROUTES, because three of the criteria this slice must assert
// are about navigation between them and cannot be asserted against 404s:
//   A-1   the tab bar renders on every /m/** route
//   A-1c  the active tab reflects the current screen, naming /m/p/{id}
//   A-2   tapping Timeclock THROUGH the open sheet navigates
//
// So each tab target and the project hub get a deliberately inert placeholder.
// Each one:
//   - declares its app-bar title, exercising §3.1's title block for real;
//   - contains NO interactive element, so A-5 measures the shell's controls and
//     not invented ones;
//   - says on screen that it is a placeholder, so no one mistakes it for M-5.
//
// The later slice REPLACES these files. It does not build alongside them.

export function SlicePlaceholder({
  screen,
  title,
  sub = null,
}: {
  /** e.g. "M-5 · Timeclock" — the spec's own identifier for what belongs here. */
  screen: string;
  title: string;
  sub?: string | null;
}) {
  return (
    <div className="px-[18px] py-[18px]">
      <SetMobileHeader title={title} sub={sub} />
      <div
        data-testid="m-placeholder"
        data-screen={screen}
        className="rounded-[15px] border border-dashed border-m6m-border bg-m6m-card p-[16px]"
      >
        <p className="font-mono text-[11px] font-medium uppercase tracking-wide text-m6m-muted">
          {screen}
        </p>
        <p className="mt-[8px] text-[15px] leading-snug text-m6m-navy">
          Not built in this slice. The shell around it — app bar, tab bar, menu
          sheet and offline strip — is.
        </p>
      </div>
    </div>
  );
}
