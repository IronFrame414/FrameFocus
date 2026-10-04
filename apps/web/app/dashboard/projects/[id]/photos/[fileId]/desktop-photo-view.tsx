'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { markupHref } from '@/lib/markup/return-to';
import { ShareLinkButton } from './share-link-dialog';
import { setProjectCover } from '@/lib/services/project-covers-client';
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
  /** [S127 4e] Marked up, derivative missing — nothing marked-up to share yet. */
  shareBlocked: boolean;
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
  canShare = false,
  canSetCover = false,
  coverFileId = null,
}: {
  projectId: string;
  photos: DesktopViewPhoto[];
  initialIndex: number;
  canShare?: boolean;
  /** [S128 Part F] lib/projects/cover-access.ts — the same rule /m reads. */
  canSetCover?: boolean;
  coverFileId?: string | null;
}) {
  const [index, setIndex] = useState(initialIndex);
  const [cover, setCover] = useState<string | null>(coverFileId);
  const [coverError, setCoverError] = useState<string | null>(null);
  const [coverBusy, setCoverBusy] = useState(false);
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
        {canShare ? <ShareLinkButton photo={photo} /> : null}
        {/* [S128 F-1] Choose the cover. A cover is an internal label: it never changes
            whether the client can see the photo (client_visible is not touched). */}
        {canSetCover ? (
          cover === photo.id ? (
            <span data-testid="photo-view-is-cover" style={{ fontSize: '13px', color: color.success }}>
              ✓ Project cover
            </span>
          ) : (
            <button
              type="button"
              data-testid="photo-view-set-cover"
              disabled={coverBusy}
              onClick={async () => {
                setCoverBusy(true);
                setCoverError(null);
                const r = await setProjectCover(projectId, photo.id);
                setCoverBusy(false);
                if (r.success) setCover(photo.id);
                else setCoverError(r.error ?? 'Could not set the cover');
              }}
              style={{ ...secondaryButtonStyle, padding: '6px 12px' }}
            >
              Set as cover
            </button>
          )
        ) : null}
        {coverError ? (
          <span role="alert" style={{ fontSize: '12px', color: color.danger }}>
            {coverError}
          </span>
        ) : null}
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
