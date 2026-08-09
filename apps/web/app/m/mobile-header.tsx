'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';

// M6M §3.1 — the app bar's title block.
//
// §3.1 gives the app bar a per-screen title and "an IBM Plex Mono 11px sub-line
// for project/company context". The shell renders that bar once, in
// mobile-shell.tsx, but only the SCREEN knows what belongs in it — M-5 wants
// "Timeclock" + today's date, M-3 wants the project name + its client. A route
// table in the shell cannot supply either, because both are data.
//
// So: screens declare their header and the shell reads it. The shell keeps a
// pathname-derived DEFAULT so a screen that declares nothing still gets a
// correct bar rather than an empty one.
//
// This is shell infrastructure, not speculation about later slices — §3.1 is
// unbuildable without some version of it.

export type MobileHeader = {
  title: string;
  /** The mono sub-line. Null renders no sub-line at all, not an empty one. */
  sub?: string | null;
};

type HeaderStore = {
  header: MobileHeader | null;
  setHeader: (h: MobileHeader | null) => void;
};

const MobileHeaderContext = createContext<HeaderStore | null>(null);

export function MobileHeaderProvider({ children }: { children: React.ReactNode }) {
  const [header, setHeader] = useState<MobileHeader | null>(null);
  const value = useMemo(() => ({ header, setHeader }), [header]);
  return (
    <MobileHeaderContext.Provider value={value}>{children}</MobileHeaderContext.Provider>
  );
}

/** Read the current header. Shell-internal. */
export function useMobileHeader(): MobileHeader | null {
  return useContext(MobileHeaderContext)?.header ?? null;
}

/**
 * Declare this screen's app-bar title. Render it anywhere in the page; it draws
 * nothing and clears itself on unmount so the next screen never inherits a
 * stale title.
 */
export function SetMobileHeader({ title, sub = null }: MobileHeader) {
  const store = useContext(MobileHeaderContext);
  const setHeader = store?.setHeader;

  useEffect(() => {
    if (!setHeader) return;
    setHeader({ title, sub });
    return () => setHeader(null);
    // Primitives only, so this re-runs when the text changes and not when the
    // parent re-renders. Passing the object itself would loop.
  }, [setHeader, title, sub]);

  return null;
}
