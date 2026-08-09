'use client';

import { useState } from 'react';

// M6M §4.11.16 — "Opening a file from M-16 — the tap that does not exist today".
//
// ===========================================================================
// WHY A ROUTE HANDLER AND NOT A SERVER-RENDERED LINK
// ===========================================================================
// §4.11.16 is explicit: "A Route Handler, not a server-rendered link — a signed
// URL minted at render time starts expiring when the page renders, and a mobile
// list is exactly the surface a user leaves open." A field user opens M-16,
// pockets the phone, walks to the far end of the site and taps. A URL signed at
// render time may already be dead; one signed at tap time has its full hour.
//
// ===========================================================================
// RLS IS THE GATE AND THERE IS NO SECOND CHECK
// ===========================================================================
// `getSignedUrl` (files.ts:70) uses the USER'S RLS-scoped server client, so
// `createSignedUrl` on `project-files` is bound by
// `project_files_select_non_client`. §4.11.6's rule — "RLS does the gating, not
// the UI ... must not add a second role check" — applies to the open path
// unchanged. This component adds NO role logic and must not acquire any: a UI
// filter that disagrees with RLS is how a "missing file" bug that is really a
// permission becomes unexplainable.
//
// The CATEGORY floor is real enforcement: files_select_non_client restricts
// contracts / change_orders / invoices to owner/admin (+PM for invoices), so a
// foreman tapping a contract is refused BY THE DATABASE. What is UI-only is the
// SUBCONTRACTOR exclusion — a sub passes that policy (they are not `client`),
// which is why the row is not rendered as a link for them at all. See
// app/m/detail-access.ts.
//
// ===========================================================================
// INLINE, NOT DOWNLOAD — RULED [§4.11.16]
// ===========================================================================
// A Supabase signed URL serves Content-Disposition: inline by default; adding
// `?download={filename}` is what forces a save (CLAUDE.md, Codespaces gotchas).
// `/m` opens INLINE and does not append it: previewing a plan on site is the
// field need, and saving to a phone's filesystem is not.
//
// CUT: an in-app document viewer. The browser handles the MIME type or it does
// not — `files` permits arbitrary uploads and this spec designs no fallback.
//
// ✅ TECH_DEBT #142 CLOSED [S122] — AND THE COPY BELOW CHANGED BECAUSE OF IT.
// /api/files/signed-url used to answer 500 for everything, because
// `getSignedUrl` discarded Storage's error before the route ever saw it. The
// cause is now preserved (`signedUrlFor`) and the route answers 403 when
// Storage refuses the path, 500 only for a genuine failure. So this component
// can finally say which — and does, below.
//
// It still adds NO role logic to decide that. It reports the STATUS THE SERVER
// RETURNED. That distinction is the whole of §4.11.6: a UI that infers a
// permission is a second gate that can disagree with RLS; a UI that renders the
// answer RLS already gave cannot.

export function OpenFileButton({
  path,
  fileName,
  children,
  className,
}: {
  path: string;
  fileName: string;
  children: React.ReactNode;
  className?: string;
}) {
  const [state, setState] = useState<'idle' | 'opening' | 'error' | 'denied'>('idle');

  async function open() {
    if (state === 'opening') return;
    setState('opening');
    try {
      const response = await fetch(`/api/files/signed-url?path=${encodeURIComponent(path)}`);
      if (!response.ok) {
        // 403 is the server saying RLS refused this path (#142). Anything else
        // is a failure, and the two must not read the same to a field user
        // standing in front of a file they cannot open.
        setState(response.status === 403 ? 'denied' : 'error');
        return;
      }
      const body = (await response.json()) as { url?: string };
      if (!body.url) {
        setState('error');
        return;
      }
      // Same tab. A phone has no window management to speak of, and the back
      // gesture returning to the list is the behaviour a field user expects.
      window.location.href = body.url;
    } catch {
      setState('error');
    }
  }

  return (
    <button
      type="button"
      onClick={open}
      data-testid="m-file-open"
      aria-label={`Open ${fileName}`}
      // min-h-[44px] — §2's floor. The row is 58px but the target is this
      // button, so the floor is asserted on the button rather than inherited.
      className={`flex min-h-[44px] w-full items-center gap-[10px] text-left ${className ?? ''}`}
    >
      <span className="min-w-0 flex-1">{children}</span>
      {state === 'opening' ? (
        <span className="shrink-0 font-mono text-[11px] text-m6m-muted">opening…</span>
      ) : null}
      {state === 'denied' ? (
        // Storage refused the path. It does NOT distinguish "you may not read
        // this" from "it is not there" — that conflation is deliberate on
        // Storage's side (anti-enumeration), so the copy covers both rather
        // than naming the one we cannot verify.
        <span data-testid="m-file-denied" className="shrink-0 text-[12px] text-m6m-danger">
          No access
        </span>
      ) : null}
      {state === 'error' ? (
        // A genuine failure, now that a refusal has its own branch above.
        <span data-testid="m-file-error" className="shrink-0 text-[12px] text-m6m-danger">
          Could not open
        </span>
      ) : null}
    </button>
  );
}
