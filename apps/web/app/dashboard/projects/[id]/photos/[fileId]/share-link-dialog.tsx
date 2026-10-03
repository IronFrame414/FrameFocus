'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { DesktopViewPhoto } from './desktop-photo-view';
import { cardStyle, color, primaryButtonStyle, secondaryButtonStyle } from '@/lib/theme';

/**
 * S127 item 4e — CREATE A PUBLIC LINK, after seeing EXACTLY what goes public.
 *
 * ⚠️ [RULED #2] THE PREVIEW IS THE SAFEGUARD: a marked-up photo is shared
 * MARKED UP, so internal annotations would go public blind without it. The
 * image below is the photo's `displayUrl` — the same derivative-else-original
 * rule the server applies when it records what to serve
 * (lib/photos/share-link.ts `resolveSharePath`). When markup exists but its
 * derivative does not, sharing is blocked rather than publishing something the
 * preview did not show. Both halves — the preview and one-click revoke — ship
 * together or not at all (stop rule 11).
 */
export function ShareLinkButton({ photo }: { photo: DesktopViewPhoto }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [made, setMade] = useState<{ url: string; expiresAt: string } | null>(null);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/photo-share-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId: photo.id }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        url?: string;
        expiresAt?: string;
        error?: string;
      };
      if (!res.ok || !body.url || !body.expiresAt)
        setError(body.error ?? 'The link was not created.');
      else setMade({ url: body.url, expiresAt: body.expiresAt });
    } catch {
      setError('The link was not created. Check your connection.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        data-testid="photo-share-open"
        onClick={() => {
          setOpen(true);
          setMade(null);
          setError(null);
        }}
        style={{ ...secondaryButtonStyle, padding: '6px 12px' }}
      >
        Share link
      </button>
      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          data-testid="photo-share-dialog"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15,23,41,.55)',
            zIndex: 50,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            style={{ ...cardStyle, padding: '18px', width: 'min(560px, 92vw)', background: '#fff' }}
          >
            <h2 style={{ margin: '0 0 8px', fontSize: '16px' }}>Share this photo publicly</h2>
            <p style={{ margin: '0 0 10px', fontSize: '13px', color: color.bodyAlt }}>
              <strong>This exact image</strong> will be visible to anyone who has the link — no
              sign-in. The page shows only this photo, your company name and logo, and the date: no
              project, address, client or notes. The link expires in 90 days, and you can revoke it
              at any time.
            </p>
            {photo.hasMarkup ? (
              <p
                style={{
                  margin: '0 0 10px',
                  fontSize: '13px',
                  fontWeight: 600,
                  color: color.warning,
                }}
              >
                This photo is marked up. The marked-up version below — annotations included — is
                what will be public.
              </p>
            ) : null}
            {photo.displayUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- a signed, short-lived URL for the preview only
              <img
                src={photo.displayUrl}
                alt="What will be public"
                data-testid="photo-share-preview"
                style={{
                  maxWidth: '100%',
                  maxHeight: '45vh',
                  display: 'block',
                  margin: '0 auto 10px',
                  objectFit: 'contain',
                }}
              />
            ) : null}
            {photo.shareBlocked ? (
              <p
                role="alert"
                style={{ fontSize: '13px', color: color.danger }}
                data-testid="photo-share-blocked"
              >
                The marked-up version of this photo is not ready yet, so it cannot be shared. Open
                it again shortly.
              </p>
            ) : null}
            {made ? (
              <div data-testid="photo-share-made" style={{ fontSize: '13px' }}>
                <p style={{ margin: '0 0 6px' }}>
                  Link created. It expires {new Date(made.expiresAt).toLocaleDateString()}.
                </p>
                <input
                  readOnly
                  value={made.url}
                  data-testid="photo-share-url"
                  onFocus={(e) => e.currentTarget.select()}
                  style={{
                    width: '100%',
                    padding: '6px',
                    border: `1px solid ${color.inputBorder}`,
                    borderRadius: '6px',
                  }}
                />
                <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                  <button
                    type="button"
                    style={{ ...secondaryButtonStyle, padding: '6px 12px' }}
                    onClick={() => void navigator.clipboard?.writeText(made.url)}
                  >
                    Copy link
                  </button>
                  <Link
                    href="/dashboard/photo-links"
                    data-testid="photo-share-manage"
                    style={{ color: color.primary, alignSelf: 'center' }}
                  >
                    Manage and revoke links
                  </Link>
                </div>
              </div>
            ) : null}
            {error ? (
              <p role="alert" style={{ fontSize: '13px', color: color.danger }}>
                {error}
              </p>
            ) : null}
            <div
              style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px' }}
            >
              <button
                type="button"
                onClick={() => setOpen(false)}
                style={{ ...secondaryButtonStyle, padding: '6px 12px' }}
              >
                {made ? 'Done' : 'Cancel'}
              </button>
              {!made ? (
                <button
                  type="button"
                  data-testid="photo-share-confirm"
                  disabled={busy || photo.shareBlocked || !photo.displayUrl}
                  onClick={() => void create()}
                  style={{ ...primaryButtonStyle, padding: '6px 14px' }}
                >
                  {busy ? 'Creating…' : 'Create public link'}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
