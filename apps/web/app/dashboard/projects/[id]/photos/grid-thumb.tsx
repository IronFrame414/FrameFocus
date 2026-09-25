'use client';

import { useLazySrc } from '@/lib/photos/use-lazy-src';

// [S111 D] The desktop gallery tile's image: the 400x400 THUMBNAIL (never the
// original), loaded once it is within the desktop buffer of the viewport. The
// mechanism — thumbnail size, buffer, observer — is lib/photos, shared with
// /m's grid; only this presentation is desktop's.
export function GridThumb({ url, alt }: { url: string | null; alt: string }) {
  const { ref, src } = useLazySrc<HTMLImageElement>(url, 'desktop');
  if (!url) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={ref}
      src={src}
      alt={alt}
      data-testid="photos-grid-thumb"
      data-lazy={src ? 'loaded' : 'pending'}
      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
    />
  );
}
