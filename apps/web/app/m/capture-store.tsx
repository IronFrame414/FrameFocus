'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';

// M6M §6 — WHERE THE SHOT LIVES BETWEEN THE SHUTTER AND THE PROJECT PROMPT.
//
// ===========================================================================
// WHY A STORE EXISTS AT ALL, AND WHY IT IS NOT A ROUTE PARAM
// ===========================================================================
// §6's sequence is the whole design: the camera opens from the TAB BAR, and
// everything after the shutter happens on `/m/capture`. So a `File` has to
// cross a navigation. It cannot go in the URL, and it must not go to the server
// first — §7a means a non-owner/admin INSERT without a `project_id` is refused
// by RLS, so with no project in context there is nothing valid to send yet.
//
// §6, quoted: "The photo is held there until a project is chosen, which is not
// a UX preference but the only sequence the database permits (§7a, A-21c)."
//
// **So the shot is held in memory, client-side, and A-21c is the criterion.**
// A build that uploaded first and patched `project_id` afterwards would work
// for an owner and fail for every field user — which is exactly the shape of
// bug this arrangement exists to prevent.
//
// ===========================================================================
// IT IS DELIBERATELY NOT PERSISTED
// ===========================================================================
// Not IndexedDB, not the offline queue — not yet. A photo only enters the queue
// once it HAS a project (§5.2, and `buildPhotoEntry` requires `projectId`). A
// reload before choosing loses the shot, and that is the honest behaviour: the
// alternative is a persisted blob nothing can ever legally insert, which would
// sit in storage looking like a queued item that never syncs.

export interface PendingShot {
  file: File;
  /** Where the shot was taken from — carried so the confirmation can say so. */
  projectId: string | null;
  takenAt: string;
}

interface CaptureStore {
  pending: PendingShot | null;
  hold: (file: File, projectId: string | null) => void;
  clear: () => void;
}

const Ctx = createContext<CaptureStore | null>(null);

export function useCaptureStore(): CaptureStore | null {
  return useContext(Ctx);
}

export function CaptureStoreProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<PendingShot | null>(null);

  const hold = useCallback((file: File, projectId: string | null) => {
    setPending({ file, projectId, takenAt: new Date().toISOString() });
  }, []);

  const clear = useCallback(() => setPending(null), []);

  const value = useMemo<CaptureStore>(() => ({ pending, hold, clear }), [pending, hold, clear]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/**
 * The project the capture applies to, derived from where the user IS.
 *
 * Two sources, because the app has two ways of saying "this project":
 *   · the path — every `/m/p/{id}/**` screen (§4.11's section screens)
 *   · `?project=` — M-7's context row switches with a query param (§4.7), and
 *     M-6 carries the same param from M-7's Daily-logs tile
 *
 * Returns null when neither is present, which is A-21's case: the tab bar on
 * Timeclock, Logs or a company-scoped screen. That null is what triggers the
 * prompt AFTER the shot.
 */
export function projectInContext(pathname: string, search: URLSearchParams): string | null {
  const fromPath = /^\/m\/p\/([0-9a-f-]{36})(\/|$)/.exec(pathname);
  if (fromPath) return fromPath[1];

  const fromQuery = search.get('project');
  return fromQuery && /^[0-9a-f-]{36}$/.test(fromQuery) ? fromQuery : null;
}
