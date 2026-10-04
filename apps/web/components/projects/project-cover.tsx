'use client';

import { useState } from 'react';
import { ImageIcon } from 'lucide-react';

/**
 * S128 Part F — a project's cover, one fixed-size box on every staff surface (desktop list,
 * desktop header, /m list). F-5: the box is the SAME SIZE with or without a cover — no broken
 * image, no stretched placeholder, no row that changes height. A cover the browser cannot draw
 * (a HEIC with no stored thumbnail, a proxy 404) falls back to the same empty state.
 *
 * `src` is lib/projects/cover.ts → the `private` thumbnail proxy URL, or null.
 */
export function ProjectCover({
  src,
  size,
  testId = 'project-cover',
}: {
  src: string | null;
  size: number;
  testId?: string;
}) {
  const [failed, setFailed] = useState(false);
  const show = src != null && !failed;
  return (
    <span
      data-testid={testId}
      data-state={show ? 'image' : 'empty'}
      aria-hidden
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: Math.round(size / 6),
        overflow: 'hidden',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#eef1f6',
        color: '#9aa4b8',
      }}
    >
      {show ? (
        // eslint-disable-next-line @next/next/no-img-element -- the proxy already serves a sized thumbnail
        <img
          src={src}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          onError={() => setFailed(true)}
          style={{ width: size, height: size, objectFit: 'cover', display: 'block' }}
        />
      ) : (
        <ImageIcon size={Math.round(size * 0.42)} strokeWidth={1.6} />
      )}
    </span>
  );
}
