'use client';

import { useLazySrc } from '@/lib/photos/use-lazy-src';

// [S111 D] The desktop gallery tile's image: the stored 400x400 THUMBNAIL — or
// the full file when the photo has none yet (ruled fallback) — loaded once it is
// within the desktop buffer of the viewport, through the shared load queue. The
// mechanism — thumbnail size, buffer, observer — is lib/photos, shared with
// /m's grid; only this presentation is desktop's.
export function GridThumb({ url, alt }: { url: string | null; alt: string }) {
  const { ref, src, inRange, onLoad, onError } = useLazySrc<HTMLImageElement>(url, 'desktop');
  if (!url) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={ref}
      src={src}
      alt={alt}
      data-testid="photos-grid-thumb"
      data-lazy={src ? 'loaded' : inRange ? 'queued' : 'pending'}
      onLoad={onLoad}
      onError={() => void onError()}
      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
    />
  );
}
