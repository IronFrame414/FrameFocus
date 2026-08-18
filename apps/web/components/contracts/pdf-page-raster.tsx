'use client';

import { useEffect, useRef, useState } from 'react';

// 7I R6 [S150] — rasterise one page of a PDF to a canvas, so boxes can be
// dragged onto the actual form instead of typed as numbers.
//
// ⚠️ EVERY IMPORT OF pdf.js HERE IS DYNAMIC AND CLIENT-ONLY. It is ~350 KB and
// only the box editor needs it; a static import would put it in the shared
// bundle for every dashboard page. It also touches `DOMMatrix` and `document`,
// which do not exist during SSR.
//
// ⚠️ THE `legacy` ENTRY POINT, MATCHING THE WORKER. pdf.js v4's modern build
// uses `Promise.withResolvers()` (Chrome 119+ / Node 22+); Node 20 is this
// repo's LTS, so that build can fail at BUILD time in a way that reads as a
// bundler fault. `scripts/copy-pdf-worker.mjs` copies the legacy worker for the
// same reason — the API and worker builds must match or pdf.js refuses to run.
//
// ⚠️ THIS COMPONENT NEVER THROWS UPWARD. A PDF that will not rasterise — an
// encrypted form, a corrupt scan, a storage URL that expired — must not make a
// template unmappable. It reports through `onError` and the editor falls back
// to the coordinate panel, which is the whole reason the panel survives R6.

type RasterState = 'loading' | 'ready' | 'failed';

export function PdfPageRaster({
  fileUrl,
  pageIndex,
  onPageCount,
  onStateChange,
}: {
  /** A signed URL. Null while it is still being resolved. */
  fileUrl: string | null;
  /** Zero-based, matching `contract_template_boxes.page`. */
  pageIndex: number;
  onPageCount: (count: number) => void;
  onStateChange: (state: RasterState, message?: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // The loaded document, kept across page changes so paging does not re-download
  // and re-parse the whole file.
  const docRef = useRef<{ numPages: number; getPage: (n: number) => Promise<unknown> } | null>(null);
  // Guards against two renders racing onto one canvas when the user pages fast.
  const renderSeq = useRef(0);
  const [ready, setReady] = useState(false);

  // ── Load the document once per URL ─────────────────────────────────────────
  useEffect(() => {
    if (!fileUrl) return;
    let cancelled = false;
    docRef.current = null;
    setReady(false);
    onStateChange('loading');

    (async () => {
      try {
        const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
        // Served from public/ by the prebuild copy. A bare filename would be
        // resolved against the current route, which is not the app root.
        pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

        const doc = await pdfjs.getDocument({ url: fileUrl }).promise;
        if (cancelled) return;

        docRef.current = doc as unknown as typeof docRef.current;
        onPageCount(doc.numPages);
        setReady(true);
        onStateChange('ready');
      } catch (err) {
        if (cancelled) return;
        // Named, not swallowed — "the form would not open" with no reason is
        // the kind of dead end that gets reported as "the editor is broken".
        onStateChange(
          'failed',
          err instanceof Error ? err.message : 'This PDF could not be displayed.'
        );
      }
    })();

    return () => {
      cancelled = true;
    };
    // onPageCount / onStateChange are stable callbacks from the parent; adding
    // them here would re-download the PDF on every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileUrl]);

  // ── Draw the requested page ────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    const doc = docRef.current;
    if (!ready || !doc || !canvas) return;

    const seq = ++renderSeq.current;
    let cancelled = false;

    (async () => {
      try {
        // pdf.js pages are 1-based; `page` on a box is 0-based.
        const wanted = Math.min(Math.max(pageIndex + 1, 1), doc.numPages);
        const page = (await doc.getPage(wanted)) as {
          getViewport: (o: { scale: number }) => { width: number; height: number };
          render: (o: { canvasContext: CanvasRenderingContext2D; viewport: unknown }) => {
            promise: Promise<void>;
            cancel: () => void;
          };
        };
        if (cancelled || seq !== renderSeq.current) return;

        // Render at a fixed pixel width and let CSS scale it down. Boxes are
        // FRACTIONS, so the raster's resolution is a legibility choice and
        // nothing else — it never enters a stored coordinate.
        const base = page.getViewport({ scale: 1 });
        const scale = RENDER_WIDTH_PX / base.width;
        const viewport = page.getViewport({ scale });

        canvas.width = Math.round(viewport.width);
        canvas.height = Math.round(viewport.height);

        const context = canvas.getContext('2d');
        if (!context) return;
        context.clearRect(0, 0, canvas.width, canvas.height);

        const task = page.render({ canvasContext: context, viewport });
        await task.promise;
      } catch (err) {
        if (cancelled || seq !== renderSeq.current) return;
        onStateChange(
          'failed',
          err instanceof Error ? err.message : 'This page could not be displayed.'
        );
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, pageIndex]);

  return (
    <canvas
      ref={canvasRef}
      style={{ display: 'block', width: '100%', height: 'auto' }}
      aria-label="Contract form page"
    />
  );
}

/**
 * Raster width in device pixels.
 *
 * Roughly 2x a US Letter page's 612pt, so the form stays readable when the
 * modal scales it down and on a high-DPI screen. Not a coordinate — see the
 * note above.
 */
const RENDER_WIDTH_PX = 1200;
