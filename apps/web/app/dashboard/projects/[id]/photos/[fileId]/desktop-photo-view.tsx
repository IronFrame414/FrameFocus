'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { markupHref } from '@/lib/markup/return-to';
import {
  cardStyle,
  color,
  microLabelStyle,
  primaryButtonStyle,
  secondaryButtonStyle,
} from '@/lib/theme';

export interface DesktopViewPhoto {
  id: string;
  fileName: string;
  /** The marked-up derivative when markup exists, else the original (D-31). */
  displayUrl: string | null;
  hasMarkup: boolean;
  /** Already formatted by lib/photos/format-taken.ts — the /m words. */
  taken: string;
  by: string;
}

/**
 * S127 item 4b — view mode, prev/next and arrow keys over a gallery read ONCE.
 * Changing photo swaps client state and REPLACES the URL (so a reload or a
 * copied link lands on the same photo) without re-running the server page.
 */
export function DesktopPhotoView({
  projectId,
  photos,
  initialIndex,
}: {
  projectId: string;
  photos: DesktopViewPhoto[];
  initialIndex: number;
}) {
  const [index, setIndex] = useState(initialIndex);
  const photo = photos[index];
  const base = `/dashboard/projects/${projectId}/photos`;

  const go = useCallback(
    (next: number) => {
      if (next < 0 || next >= photos.length) return;
      setIndex(next);
      window.history.replaceState(window.history.state, '', `${base}/${photos[next].id}`);
    },
    [photos, base]
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.key === 'ArrowLeft') go(index - 1);
      if (e.key === 'ArrowRight') go(index + 1);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, index]);

  return (
    <div data-testid="photo-view" data-file-id={photo.id}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          marginBottom: '10px',
          flexWrap: 'wrap',
        }}
      >
        <Link href={base} style={{ color: color.primary, fontSize: '13px' }}>
          ← Back to photos
        </Link>
        <span style={{ ...microLabelStyle, margin: 0 }} data-testid="photo-view-position">
          {index + 1} of {photos.length}
        </span>
        <span style={{ flex: 1 }} />
        <button
          type="button"
          data-testid="photo-view-prev"
          disabled={index === 0}
          onClick={() => go(index - 1)}
          style={{ ...secondaryButtonStyle, padding: '6px 12px' }}
          aria-label="Previous photo"
        >
          ← Previous
        </button>
        <button
          type="button"
          data-testid="photo-view-next"
          disabled={index === photos.length - 1}
          onClick={() => go(index + 1)}
          style={{ ...secondaryButtonStyle, padding: '6px 12px' }}
          aria-label="Next photo"
        >
          Next →
        </button>
        <Link
          href={markupHref(projectId, photo.id, 'photos')}
          // Its href changes with every previous/next, and a production
          // prefetch of each new one is a server round trip per photo, the
          // cost this view exists to avoid (S125 finding 3; same call as the
          // grid tiles, H-5 [S115]). The e2e counts 0 RSC requests while moving.
          prefetch={false}
          data-testid="photo-view-markup"
          style={{ ...primaryButtonStyle, padding: '6px 14px', textDecoration: 'none' }}
        >
          Mark up
        </Link>
      </div>

      <div
        style={{
          ...cardStyle,
          background: '#0d1220',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          padding: '8px',
        }}
      >
        {photo.displayUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- a signed, short-lived URL
          <img
            key={photo.id}
            src={photo.displayUrl}
            alt={photo.fileName}
            data-testid="photo-view-image"
            // A-3: fit the VIEWPORT HEIGHT — a phone portrait is the common case.
            style={{
              maxHeight: 'calc(100vh - 240px)',
              maxWidth: '100%',
              objectFit: 'contain',
              display: 'block',
            }}
          />
        ) : (
          <p style={{ color: '#fff', padding: '48px' }}>This photo could not be loaded.</p>
        )}
      </div>

      <dl
        style={{
          display: 'flex',
          gap: '24px',
          flexWrap: 'wrap',
          margin: '10px 0 0',
          fontSize: '13px',
          color: color.bodyAlt,
        }}
      >
        <div>
          <dt style={{ color: color.faint, display: 'inline' }}>Taken </dt>
          <dd style={{ display: 'inline', margin: 0 }} data-testid="photo-view-taken">
            {photo.taken}
          </dd>
        </div>
        <div>
          <dt style={{ color: color.faint, display: 'inline' }}>By </dt>
          <dd style={{ display: 'inline', margin: 0 }} data-testid="photo-view-by">
            {photo.by}
          </dd>
        </div>
        <div
          style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            maxWidth: '40ch',
          }}
        >
          {photo.fileName}
          {photo.hasMarkup ? ' · marked up' : ''}
        </div>
      </dl>
    </div>
  );
}
