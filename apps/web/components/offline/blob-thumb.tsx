'use client';

import { useEffect, useState } from 'react';

// S120 2-C — ONE thumbnail for a photo that exists only on this phone.
//
// Josh had 30 photos held on his phone and ~300 in his camera roll, and no
// screen showed WHICH 30: the capture tray listed file names, the waiting-to-
// sync list listed "Photo · 10:32". Both lists now show the photo itself and
// the DATE and time it was taken, through this one component (the held tray on
// /m/capture and the queue on /m/offline — one mechanism, not two).

/** Date AND time — a phone can hold photos from more than one day. */
export function capturedWhen(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function BlobThumb({ blob, testId }: { blob: Blob; testId: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    const url = URL.createObjectURL(blob);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [blob]);
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element -- a local blob: URL, not an optimisable asset
    <img
      src={src}
      alt=""
      data-testid={testId}
      className="h-[52px] w-[52px] shrink-0 rounded-[10px] border border-m6m-border object-cover"
    />
  ) : (
    <span className="h-[52px] w-[52px] shrink-0 rounded-[10px] border border-m6m-border bg-m6m-surface" />
  );
}
