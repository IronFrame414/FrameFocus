'use client';

import { useEffect, useState } from 'react';
import type { MarkupShape } from '@framefocus/shared/types/markup';
import { MarkupCanvas } from './markup-canvas';

// M6M §4.7a.1 — the canvas cannot open until it knows the image's NATURAL
// dimensions, because every stored coordinate is in that space and the SVG's
// viewBox is `0 0 naturalWidth naturalHeight`.
//
// An already-annotated photo carries them in `markup_data` and the server hands
// them straight over. A photo being annotated for the FIRST time has never had
// them written, so they are measured here, once, from the loaded image.
//
// WHY THIS IS A SEPARATE COMPONENT RATHER THAN A BRANCH INSIDE MarkupCanvas:
// a viewBox of `0 0 0 0` makes getScreenCTM().inverse() map every pointer event
// to NaN. Marks placed in that window are silently unrecoverable — they carry
// NaN coordinates, render nowhere, and still count as unsaved work the user
// believes they did. Refusing to mount the editor until the dimensions are real
// removes the window rather than guarding inside it.

export function MeasureThenEdit({
  fileId,
  filePath,
  fileName,
  originalUrl,
  initialShapes,
  dims,
  returnHref,
}: {
  fileId: string;
  filePath: string;
  fileName: string;
  originalUrl: string;
  initialShapes: MarkupShape[];
  dims: { w: number; h: number } | null;
  returnHref: string;
}) {
  const [measured, setMeasured] = useState<{ w: number; h: number } | null>(dims);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (measured) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => setMeasured({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => setFailed(true);
    img.src = originalUrl;
  }, [measured, originalUrl]);

  if (failed) {
    return (
      <div className="flex min-h-full items-center justify-center bg-m6m-canvas px-[18px]">
        <p data-testid="m-markup-load-failed" className="text-center text-[15px] text-[#f0908a]">
          This photo could not be loaded, so it cannot be marked up.
        </p>
      </div>
    );
  }

  if (!measured) {
    return (
      <div className="flex min-h-full items-center justify-center bg-m6m-canvas">
        <p data-testid="m-markup-loading" className="text-[15px] text-m6m-muted-navy">
          Loading photo…
        </p>
      </div>
    );
  }

  return (
    <MarkupCanvas
      fileId={fileId}
      filePath={filePath}
      fileName={fileName}
      originalUrl={originalUrl}
      initialShapes={initialShapes}
      imageDims={measured}
      returnHref={returnHref}
    />
  );
}
