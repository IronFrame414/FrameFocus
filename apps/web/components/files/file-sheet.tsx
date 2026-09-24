'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { ModalSheet } from '@/components/sheet/modal-sheet';
import { PdfPages } from '@/components/files/pdf-pages';
import { canPrint, fileViewKind, isIOS, withDownload, type FileViewKind } from '@/lib/files/file-view';
import { SIGNED_URL_TTL_SECONDS } from '@/lib/services/signed-url-ttl';
import { useT } from '@/components/i18n/language-provider';

/**
 * S109 #161 — A FILE OPENS IN A SHEET OVER THE CURRENT SCREEN.
 * [RULED Josh: "A PDF opens in a SHEET over the current screen by default, so
 * the user never loses their place. Explicit actions on that sheet: open in a
 * new tab · print · download. Applies wherever a file is viewed."]
 *
 *   const openFile = useFileSheet();
 *   openFile({ fileName, mimeType, resolveUrl: () => signSomehow() });
 *
 * ONE viewer for both surfaces: `FileSheetProvider` is mounted by the dashboard
 * layout AND the /m layout, and every call site — desktop, /m, and the shared
 * chat thread — opens the same sheet (CLAUDE.md → PARITY). It sits on
 * `ModalSheet`, the reusable modal (ruling 161.A).
 *
 * THE SHEET TAKES A RESOLVER, NOT A URL (FILL-161.4). It signs when it OPENS,
 * so a list signed twenty minutes ago is irrelevant — which is also why the
 * Estimate Files tab's 300-second list-time links could die before a click
 * (ruling 161.B). Expiry, handled rather than assumed away:
 *   · once a PDF is loaded its bytes are in memory — expiry cannot blank it;
 *   · a view that fails to load re-resolves ONCE, silently; if that fails too,
 *     the sheet says so and offers Reload — never a silent blank;
 *   · the ACTIONS (new tab, download, print) use a URL refreshed before the
 *     standard TTL runs out, so they work on a sheet left open for hours.
 *
 * "Open in new tab" and "Download" are real `<a>` elements over a URL the
 * sheet ALREADY HOLDS — not `window.open` after an `await`, which is detached
 * from the click and is what popup blockers stop.
 */

/** What a resolver may return: a URL, or a URL plus the name/type it learned
 *  while signing (callers that hold only a file id), or null when it cannot sign. */
export type ResolvedFile =
  | string
  | { url: string; fileName?: string; mimeType?: string | null }
  | null;

export interface OpenFileRequest {
  /** Shown while resolving; replaced by the resolver's `fileName` if it returns one. */
  fileName: string;
  mimeType?: string | null;
  /** Returns a URL the browser can load, or null when it cannot be signed. */
  resolveUrl: () => Promise<ResolvedFile>;
}

function urlOf(r: ResolvedFile): string | null {
  return r == null ? null : typeof r === 'string' ? r : r.url;
}

type OpenFile = (req: OpenFileRequest) => void;

const FileSheetContext = createContext<OpenFile | null>(null);

/**
 * Outside a provider (a surface that has not adopted the sheet), this keeps the
 * OLD behaviour — resolve, then open in a new tab — rather than throwing, so a
 * shared component (e.g. the chat thread) can adopt the hook everywhere at once.
 */
export function useFileSheet(): OpenFile {
  const ctx = useContext(FileSheetContext);
  return useMemo<OpenFile>(
    () =>
      ctx ??
      ((req) => {
        void req.resolveUrl().then((r) => {
          const url = urlOf(r);
          if (url) window.open(url, '_blank', 'noopener');
        });
      }),
    [ctx]
  );
}

export function FileSheetProvider({ children }: { children: ReactNode }) {
  const [req, setReq] = useState<OpenFileRequest | null>(null);
  const open = useCallback<OpenFile>((r) => setReq(r), []);
  return (
    <FileSheetContext.Provider value={open}>
      {children}
      {req && <FileSheet request={req} onClose={() => setReq(null)} />}
    </FileSheetContext.Provider>
  );
}

type ViewState =
  | { phase: 'resolving' }
  | { phase: 'ready'; url: string }
  | { phase: 'failed'; message: string };

// Refresh the actions' URL a little before the standard TTL runs out.
const ACTION_REFRESH_MS = Math.max(60, SIGNED_URL_TTL_SECONDS - 300) * 1000;

export function FileSheet({ request, onClose }: { request: OpenFileRequest; onClose: () => void }) {
  const [meta, setMeta] = useState({ fileName: request.fileName, mimeType: request.mimeType ?? null });
  const kind: FileViewKind = fileViewKind(meta.mimeType, meta.fileName);
  const [view, setView] = useState<ViewState>({ phase: 'resolving' });
  const [actionUrl, setActionUrl] = useState<string | null>(null);
  const [previewBroken, setPreviewBroken] = useState(false);
  const [printing, setPrinting] = useState(false);
  const t = useT();
  const retried = useRef(false);
  const resolveRef = useRef(request.resolveUrl);
  resolveRef.current = request.resolveUrl;

  const resolve = useCallback(
    async (reason: 'open' | 'retry' | 'reload') => {
      if (reason !== 'retry') retried.current = false;
      setView({ phase: 'resolving' });
      setPreviewBroken(false);
      let resolved: ResolvedFile = null;
      try {
        resolved = await resolveRef.current();
      } catch {
        resolved = null;
      }
      const url = urlOf(resolved);
      if (resolved && typeof resolved === 'object') {
        const r = resolved;
        setMeta((m) => ({
          fileName: r.fileName ?? m.fileName,
          mimeType: r.mimeType !== undefined ? r.mimeType : m.mimeType,
        }));
      }
      if (!url) {
        setView({ phase: 'failed', message: t('shell.file.couldNotOpen') });
        return;
      }
      setView({ phase: 'ready', url });
      setActionUrl(url);
    },
    [t]
  );

  useEffect(() => {
    void resolve('open');
  }, [resolve]);

  // Keep the actions' URL fresh on a sheet left open; the VIEW keeps its bytes.
  useEffect(() => {
    const timer = setInterval(() => {
      void resolveRef
        .current()
        .then((r) => {
          const u = urlOf(r);
          if (u) setActionUrl(u);
        })
        .catch(() => {});
    }, ACTION_REFRESH_MS);
    return () => clearInterval(timer);
  }, []);

  /** A view that would not load: re-sign once, silently; then say so. */
  const onViewFailed = useCallback(
    (message: string) => {
      if (!retried.current) {
        retried.current = true;
        void resolve('retry');
        return;
      }
      if (kind === 'heic' || kind === 'image' || kind === 'video' || kind === 'audio') {
        // The link worked twice and the browser still cannot show it — a
        // format problem (e.g. HEIC outside Safari), not an expired link.
        setPreviewBroken(true);
        return;
      }
      setView({ phase: 'failed', message: t('shell.file.couldNotDisplay', { message }).trim() });
    },
    [kind, resolve, t]
  );

  async function print() {
    if (!actionUrl) return;
    if (isIOS(navigator.userAgent, navigator.maxTouchPoints ?? 0)) {
      // FILL-161.3 — iOS standalone printing of an iframe is unreliable; the
      // share sheet's Print is the dependable path.
      window.open(actionUrl, '_blank', 'noopener');
      return;
    }
    setPrinting(true);
    try {
      // Print the REAL bytes, same-origin: a cross-origin signed URL in an
      // iframe cannot be printed from script.
      const res = await fetch(actionUrl);
      if (!res.ok) throw new Error(String(res.status));
      const blobUrl = URL.createObjectURL(await res.blob());
      const frame = document.createElement('iframe');
      frame.style.position = 'fixed';
      frame.style.width = '0';
      frame.style.height = '0';
      frame.style.border = '0';
      frame.src = blobUrl;
      frame.onload = () => {
        try {
          frame.contentWindow?.focus();
          frame.contentWindow?.print();
        } finally {
          setTimeout(() => {
            frame.remove();
            URL.revokeObjectURL(blobUrl);
          }, 60_000);
        }
      };
      document.body.appendChild(frame);
    } catch {
      window.open(actionUrl, '_blank', 'noopener');
    } finally {
      setPrinting(false);
    }
  }

  const actionClass =
    'rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50 sm:text-sm';
  const actions = actionUrl ? (
    <>
      <a
        href={actionUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={actionClass}
        data-testid="file-sheet-new-tab"
      >
        <span className="hidden sm:inline">{t('shell.file.openInNewTab')}</span>
        <span className="sm:hidden">{t('shell.file.newTab')}</span>
      </a>
      {canPrint(kind) && !previewBroken && (
        <button
          type="button"
          onClick={() => void print()}
          disabled={printing}
          className={actionClass}
          data-testid="file-sheet-print"
        >
          {printing ? t('shell.file.preparing') : t('shell.file.print')}
        </button>
      )}
      <a
        href={withDownload(actionUrl, meta.fileName)}
        className={actionClass}
        data-testid="file-sheet-download"
      >
        {t('shell.file.download')}
      </a>
    </>
  ) : null;

  return (
    <ModalSheet open onClose={onClose} title={meta.fileName} actions={actions} testId="file-sheet">
      {view.phase === 'resolving' && (
        <p className="p-6 text-center text-sm text-gray-500" data-testid="file-sheet-loading">
          {t('shell.loading')}
        </p>
      )}
      {view.phase === 'failed' && (
        <div className="flex flex-col items-center gap-3 p-8 text-center" data-testid="file-sheet-failed">
          <p className="max-w-md text-sm text-gray-700">{view.message}</p>
          <button
            type="button"
            onClick={() => void resolve('reload')}
            className="rounded-md bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600"
          >
            {t('shell.file.reload')}
          </button>
        </div>
      )}
      {view.phase === 'ready' &&
        (previewBroken || kind === 'none' ? (
          <NoPreview fileName={meta.fileName} />
        ) : kind === 'pdf' ? (
          <PdfPages url={view.url} onFailed={onViewFailed} />
        ) : kind === 'image' || kind === 'heic' ? (
          <div className="flex min-h-full items-center justify-center p-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- a signed storage URL, not an optimisable asset */}
            <img
              src={view.url}
              alt={meta.fileName}
              data-testid="file-sheet-image"
              className="max-h-full max-w-full object-contain"
              onError={() => onViewFailed(t('shell.file.imageWouldNotLoad'))}
            />
          </div>
        ) : kind === 'video' ? (
          <div className="flex min-h-full items-center justify-center p-3">
            <video
              src={view.url}
              controls
              className="max-h-full max-w-full"
              onError={() => onViewFailed(t('shell.file.videoWouldNotLoad'))}
            />
          </div>
        ) : (
          <div className="flex min-h-full items-center justify-center p-6">
            <audio
              src={view.url}
              controls
              onError={() => onViewFailed(t('shell.file.audioWouldNotLoad'))}
            />
          </div>
        ))}
    </ModalSheet>
  );
}

function NoPreview({ fileName }: { fileName: string }) {
  const t = useT();
  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-2 p-8 text-center" data-testid="file-sheet-no-preview">
      <div className="text-4xl" aria-hidden>
        📄
      </div>
      <p className="text-sm font-semibold text-gray-900">{fileName}</p>
      <p className="max-w-sm text-sm text-gray-600">{t('shell.file.noPreview')}</p>
    </div>
  );
}
