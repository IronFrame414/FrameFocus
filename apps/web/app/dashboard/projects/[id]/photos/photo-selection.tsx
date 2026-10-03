'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { setPhotosClientVisible, trashPhotos } from '@/lib/photos/bulk-actions';
import { cardStyle, color, primaryButtonStyle, secondaryButtonStyle } from '@/lib/theme';

// ============================================================================
// S127 item 4d (A-1) — DESKTOP multi-select on the Photos tab: "Show to client"
// and "Move to Trash" on a selection. OWNER/ADMIN ONLY (`canBulkDeletePhotos`,
// `canSharePhotosWithClient`) — RULED A-1a: a checkbox column puts "select all →
// delete" one mis-tap from the photos that matter in a dispute, so the roles are
// narrow, the delete is SOFT, and it CONFIRMS with where the photos go (the
// Trash, 4a). There is deliberately no "select all".
//
// The writes are the SAME module /m's selection bar calls
// (lib/photos/bulk-actions.ts) — one mechanism, both surfaces [PARITY]. The grid
// stays server-rendered; this layer only adds the selection.
// ============================================================================

interface SelectionApi {
  selecting: boolean;
  selected: Set<string>;
  toggle: (id: string) => void;
}

const Ctx = createContext<SelectionApi | null>(null);

export function PhotoSelectionProvider({
  enabled,
  canBulkDelete,
  canShareWithClient,
  trashHref,
  children,
}: {
  /** False for every role but Owner/Admin: the grid renders exactly as before. */
  enabled: boolean;
  canBulkDelete: boolean;
  canShareWithClient: boolean;
  trashHref: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string> | null>(null);
  const [confirm, setConfirm] = useState<'trash' | 'client' | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  if (!enabled) return <>{children}</>;

  const selecting = selected !== null;
  const ids = [...(selected ?? [])];
  const n = ids.length;
  const plural = n === 1 ? 'photo' : 'photos';

  function toggle(id: string) {
    setSelected((cur) => {
      if (!cur) return cur;
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function cancel() {
    setSelected(null);
    setConfirm(null);
    setNote(null);
  }

  async function run(kind: 'trash' | 'client') {
    setBusy(true);
    setNote(null);
    const outcome =
      kind === 'trash' ? await trashPhotos(ids) : await setPhotosClientVisible(ids, true);
    setBusy(false);
    setConfirm(null);
    if (outcome.done < outcome.total) {
      setNote(
        `${outcome.total - outcome.done} of ${outcome.total} could not be ${
          kind === 'trash' ? 'moved to Trash' : 'shown to the client'
        }.`
      );
      router.refresh();
      return;
    }
    setSelected(null);
    router.refresh();
  }

  return (
    <Ctx.Provider value={{ selecting, selected: selected ?? new Set(), toggle }}>
      <div
        data-testid="desktop-photo-selection-bar"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          flexWrap: 'wrap',
          marginBottom: '12px',
          minHeight: '34px',
        }}
      >
        {selecting ? (
          <>
            <span
              data-testid="desktop-selection-count"
              style={{ fontSize: '13px', fontWeight: 600 }}
            >
              {n} selected
            </span>
            {canShareWithClient ? (
              <button
                type="button"
                data-testid="desktop-bulk-client"
                disabled={busy || n === 0}
                onClick={() => setConfirm('client')}
                style={{ ...secondaryButtonStyle, padding: '6px 12px', opacity: n === 0 ? 0.5 : 1 }}
              >
                Show to client
              </button>
            ) : null}
            {canBulkDelete ? (
              <button
                type="button"
                data-testid="desktop-bulk-trash"
                disabled={busy || n === 0}
                onClick={() => setConfirm('trash')}
                style={{
                  ...secondaryButtonStyle,
                  padding: '6px 12px',
                  color: color.danger,
                  opacity: n === 0 ? 0.5 : 1,
                }}
              >
                Move to Trash
              </button>
            ) : null}
            <button
              type="button"
              data-testid="desktop-selection-cancel"
              onClick={cancel}
              style={{ ...secondaryButtonStyle, padding: '6px 12px' }}
            >
              Cancel
            </button>
          </>
        ) : (
          <button
            type="button"
            data-testid="desktop-select-mode"
            onClick={() => setSelected(new Set())}
            style={{ ...secondaryButtonStyle, padding: '6px 12px' }}
          >
            Select
          </button>
        )}
        {note ? (
          <span
            role="status"
            data-testid="desktop-selection-note"
            style={{ fontSize: '13px', color: color.danger }}
          >
            {note}
          </span>
        ) : null}
      </div>

      {confirm ? (
        <div
          role="dialog"
          aria-modal="true"
          data-testid={
            confirm === 'trash' ? 'desktop-bulk-trash-confirm' : 'desktop-bulk-client-confirm'
          }
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
            style={{ ...cardStyle, padding: '18px', width: 'min(460px, 92vw)', background: '#fff' }}
          >
            {confirm === 'trash' ? (
              <>
                <h2 style={{ margin: '0 0 8px', fontSize: '16px' }}>
                  Move {n} {plural} to Trash?
                </h2>
                <p style={{ margin: '0 0 14px', fontSize: '13px', color: color.bodyAlt }}>
                  They leave the gallery and wait in{' '}
                  <Link href={trashHref} style={{ color: color.primary }}>
                    Photos → Trash
                  </Link>
                  , full resolution, where they can be restored. After 6 months in the Trash they
                  are deleted for good.
                </p>
              </>
            ) : (
              <>
                <h2 style={{ margin: '0 0 8px', fontSize: '16px' }}>
                  Show {n} {plural} in the client portal?
                </h2>
                <p style={{ margin: '0 0 14px', fontSize: '13px', color: color.bodyAlt }}>
                  Only a client with full portal access sees them; a documents-only client sees
                  nothing. A marked-up photo shows its markup.
                </p>
              </>
            )}
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button
                type="button"
                data-testid="desktop-bulk-confirm-no"
                onClick={() => setConfirm(null)}
                style={{ ...secondaryButtonStyle, padding: '6px 12px' }}
              >
                Cancel
              </button>
              <button
                type="button"
                data-testid="desktop-bulk-confirm-yes"
                disabled={busy}
                onClick={() => run(confirm)}
                style={{
                  ...primaryButtonStyle,
                  padding: '6px 12px',
                  ...(confirm === 'trash' ? { backgroundColor: color.danger } : {}),
                }}
              >
                {busy ? 'Working…' : confirm === 'trash' ? 'Move to Trash' : 'Show to client'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {children}
    </Ctx.Provider>
  );
}

/**
 * One grid tile. Outside selection mode it is exactly its children (the link to
 * the photo's view). In selection mode a click SELECTS instead of navigating,
 * and a check mark shows the state.
 */
export function SelectablePhotoTile({ id, children }: { id: string; children: ReactNode }) {
  const api = useContext(Ctx);
  if (!api || !api.selecting) return <>{children}</>;
  const on = api.selected.has(id);
  return (
    <div
      data-testid="desktop-photo-select"
      data-photo-id={id}
      data-selected={on ? 'true' : 'false'}
      onClickCapture={(e) => {
        e.preventDefault();
        e.stopPropagation();
        api.toggle(id);
      }}
      style={{
        position: 'relative',
        borderRadius: '11px',
        outline: on ? `3px solid ${color.primary}` : 'none',
        outlineOffset: '2px',
        cursor: 'pointer',
      }}
    >
      {children}
      <span
        aria-hidden
        style={{
          position: 'absolute',
          top: '6px',
          right: '6px',
          width: '22px',
          height: '22px',
          borderRadius: '50%',
          border: '2px solid #fff',
          background: on ? color.primary : 'rgba(15,23,41,.35)',
          color: '#fff',
          fontSize: '13px',
          lineHeight: '18px',
          textAlign: 'center',
        }}
      >
        {on ? '✓' : ''}
      </span>
    </div>
  );
}
