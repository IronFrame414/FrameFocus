'use client';

import { useEffect, useRef, useState } from 'react';
import { useT } from '@/components/i18n/language-provider';

/**
 * S109 #161 — every page of a PDF, stacked, for the file sheet.
 *
 * Same pdf.js as `components/box-map/pdf-page-raster.tsx` (the box editor's
 * single-page raster), and the same three constraints, for the same reasons:
 *   · DYNAMIC, CLIENT-ONLY import — ~350 KB; never in the shared bundle.
 *   · the `legacy` entry point, matching the worker `scripts/copy-pdf-worker.mjs`
 *     copies to `/pdf.worker.min.mjs` (Node 20 LTS; the modern build can fail).
 *   · never throws upward — failure is reported through `onFailed`, and the
 *     sheet decides what to show (re-sign once, then "Reload").
 *
 * Pages render LAZILY as they scroll into view (an IntersectionObserver per
 * placeholder), at the container's width × devicePixelRatio (capped), so a
 * 60-page drawing set does not rasterise 60 canvases up front on a phone.
 *
 * Once the document is loaded the BYTES ARE IN MEMORY: an expiring signed URL
 * cannot blank a page that is already showing (FILL-161.4).
 */

type PdfDoc = {
  numPages: number;
  getPage: (n: number) => Promise<PdfPage>;
  destroy?: () => Promise<void>;
};
type PdfPage = {
  getViewport: (o: { scale: number }) => { width: number; height: number };
  render: (o: { canvasContext: CanvasRenderingContext2D; viewport: unknown }) => {
    promise: Promise<void>;
  };
};

const MAX_RENDER_PX = 2400;

export function PdfPages({ url, onFailed }: { url: string; onFailed: (message: string) => void }) {
  const [doc, setDoc] = useState<PdfDoc | null>(null);
  const t = useT();
  const tRef = useRef(t);
  tRef.current = t;
  const onFailedRef = useRef(onFailed);
  onFailedRef.current = onFailed;

  useEffect(() => {
    let cancelled = false;
    let loaded: PdfDoc | null = null;
    // The latest translator, read without making it an effect dependency.
    const t = tRef.current;
    setDoc(null);
    (async () => {
      try {
        const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
        pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
        loaded = (await pdfjs.getDocument({ url }).promise) as unknown as PdfDoc;
        if (cancelled) return;
        setDoc(loaded);
      } catch (err) {
        if (cancelled) return;
        onFailedRef.current(
          err instanceof Error ? err.message : t('shell.file.pdfCouldNotDisplay')
        );
      }
    })();
    return () => {
      cancelled = true;
      void loaded?.destroy?.();
    };
  }, [url]);

  if (!doc) {
    return (
      <p className="p-6 text-center text-sm text-gray-500" data-testid="file-sheet-loading">
        {t('shell.loading')}
      </p>
    );
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-3 p-3" data-testid="file-sheet-pdf" data-pages={doc.numPages}>
      {Array.from({ length: doc.numPages }, (_, i) => (
        <PdfPageCanvas key={i} doc={doc} pageNumber={i + 1} onFailed={onFailedRef.current} />
      ))}
    </div>
  );
}

function PdfPageCanvas({
  doc,
  pageNumber,
  onFailed,
}: {
  doc: PdfDoc;
  pageNumber: number;
  onFailed: (message: string) => void;
}) {
  const holderRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [visible, setVisible] = useState(pageNumber === 1);
  const [aspect, setAspect] = useState(11 / 8.5);
  const t = useT();

  useEffect(() => {
    const el = holderRef.current;
    if (!el || visible) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: '600px 0px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    (async () => {
      try {
        const page = await doc.getPage(pageNumber);
        if (cancelled) return;
        const base = page.getViewport({ scale: 1 });
        setAspect(base.height / base.width);
        const cssWidth = holderRef.current?.clientWidth || 800;
        const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
        const target = Math.min(cssWidth * dpr, MAX_RENDER_PX);
        const viewport = page.getViewport({ scale: target / base.width });
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.width = Math.round(viewport.width);
        canvas.height = Math.round(viewport.height);
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        await page.render({ canvasContext: ctx, viewport }).promise;
      } catch (err) {
        if (!cancelled)
          onFailed(
            err instanceof Error
              ? err.message
              : t('shell.file.pageCouldNotDisplay', { n: pageNumber })
          );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, doc, pageNumber, onFailed, t]);

  return (
    <div
      ref={holderRef}
      className="w-full bg-white shadow"
      style={{ aspectRatio: `1 / ${aspect}` }}
    >
      {visible && (
        <canvas
          ref={canvasRef}
          aria-label={t('shell.file.pageOf', { n: pageNumber, total: doc.numPages })}
          style={{ display: 'block', width: '100%', height: '100%' }}
        />
      )}
    </div>
  );
}
