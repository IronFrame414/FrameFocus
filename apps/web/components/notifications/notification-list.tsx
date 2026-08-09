'use client';

import { useCallback, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  dismiss,
  markAllRead,
  markRead,
  setStarred,
  type NotificationFilter,
  type NotificationListItem,
} from '@/lib/services/notifications-client';
import { resolveLink, type LinkParams, type Surface } from '@/lib/notify/links';

/**
 * The notifications list. ONE component, both surfaces.
 *
 * Spec: §10.1 (desktop), §10.3 (mobile), ND-11 (links). A-N19.
 *
 * ---------------------------------------------------------------------------
 * CLAUDE.md → PARITY: ONE FEATURE, BOTH SURFACES, SAME BEHAVIOUR
 * ---------------------------------------------------------------------------
 * "Layout, spacing and input affordances may differ — a phone is not a desktop.
 * What must not differ is behaviour: what gets written, what the rules are, what
 * an error means, and what the user ends up with."
 *
 * So both surfaces render THIS component and pass a different `surface`. What
 * `surface` changes is exactly one thing — where a row NAVIGATES (ND-11: one
 * row, two destinations) — and nothing about what a tap WRITES. Mobile applies
 * M6M D-4's card geometry through `compact`, which is presentation only.
 *
 * A second list under app/m/ that "did the same thing" would be the divergence
 * written in a form that looks like agreement. TECH_DEBT #129 is what that
 * costs: two markup editors silently disagreed about what a save produces, and a
 * desktop annotation rendered on mobile as an unannotated original.
 */

export function NotificationList({
  initial,
  surface,
  filter,
  compact = false,
}: {
  initial: NotificationListItem[];
  surface: Surface;
  filter: NotificationFilter;
  compact?: boolean;
}) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const unreadCount = useMemo(() => items.filter((i) => !i.read_at).length, [items]);

  /** Optimistic local patch, so a tap feels immediate on a weak jobsite signal. */
  const patch = useCallback((id: string, next: Partial<NotificationListItem>) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...next } : i)));
  }, []);

  const onOpen = useCallback(
    async (item: NotificationListItem) => {
      const href = resolveLink(
        item.link_key,
        (item.link_params ?? {}) as LinkParams,
        surface
      );

      // ND-8: a null link is a REAL STATE, not a lookup failure. A non-author PM
      // gets a CO notification with no link because the S121 read floor makes
      // the row unreadable to them and a link would 404. Such a row still marks
      // read — the user has seen it — but navigates nowhere.
      if (!item.read_at) {
        patch(item.id, { read_at: new Date().toISOString() });
        try {
          await markRead(item.id);
        } catch (err) {
          patch(item.id, { read_at: null });
          setError(err instanceof Error ? err.message : 'Could not mark as read');
          return;
        }
      }

      if (href) startTransition(() => router.push(href));
    },
    [patch, router, surface]
  );

  const onToggleStar = useCallback(
    async (item: NotificationListItem) => {
      const next = !item.starred;
      patch(item.id, { starred: next });
      try {
        // One column. R2's expiry rule is the trigger's job, not this
        // component's — see notifications-client.ts.
        await setStarred(item.id, next);
      } catch (err) {
        patch(item.id, { starred: item.starred });
        setError(err instanceof Error ? err.message : 'Could not update');
      }
    },
    [patch]
  );

  const onDismiss = useCallback(async (item: NotificationListItem) => {
    const snapshot = item;
    setItems((prev) => prev.filter((i) => i.id !== item.id));
    try {
      await dismiss(item.id);
    } catch (err) {
      setItems((prev) => [snapshot, ...prev]);
      setError(err instanceof Error ? err.message : 'Could not dismiss');
    }
  }, []);

  const onMarkAllRead = useCallback(async () => {
    const snapshot = items;
    const stamp = new Date().toISOString();
    setItems((prev) => prev.map((i) => (i.read_at ? i : { ...i, read_at: stamp })));
    try {
      await markAllRead();
    } catch (err) {
      setItems(snapshot);
      setError(err instanceof Error ? err.message : 'Could not mark all as read');
    }
  }, [items]);

  if (items.length === 0) {
    // §10.1: "No notifications." No illustration.
    return (
      <div data-testid="notifications-empty">
        <p>
          {filter === 'unread'
            ? 'Nothing unread.'
            : filter === 'starred'
              ? 'Nothing starred.'
              : 'No notifications.'}
        </p>
      </div>
    );
  }

  return (
    <div data-testid="notification-list" data-surface={surface}>
      {error && (
        <p role="alert" data-testid="notification-error">
          {error}
        </p>
      )}

      {unreadCount > 0 && (
        <button type="button" onClick={onMarkAllRead} data-testid="notifications-mark-all">
          Mark all as read
        </button>
      )}

      <ul>
        {items.map((item) => {
          const href = resolveLink(
            item.link_key,
            (item.link_params ?? {}) as LinkParams,
            surface
          );
          const linked = href !== null;

          return (
            <li
              key={item.id}
              data-testid="notification-row"
              data-read={item.read_at ? 'true' : 'false'}
              data-linked={linked ? 'true' : 'false'}
              data-type={item.type}
              data-compact={compact ? 'true' : 'false'}
            >
              {/*
                §10.1: "Rows with no link are visually non-interactive — no
                pointer cursor, no hover affordance. A row that looks clickable
                and does nothing is worse than one that does not."

                So an unlinked row is rendered as a plain block and NOT as a
                button. It still marks read, via its own explicit control below,
                rather than by pretending the whole row is a target.
              */}
              {linked ? (
                <button
                  type="button"
                  onClick={() => void onOpen(item)}
                  data-testid="notification-open"
                >
                  <span data-testid="notification-title">{item.title}</span>
                  {item.body && <span data-testid="notification-body">{item.body}</span>}
                </button>
              ) : (
                <div data-testid="notification-static">
                  <span data-testid="notification-title">{item.title}</span>
                  {item.body && <span data-testid="notification-body">{item.body}</span>}
                </div>
              )}

              <time dateTime={item.created_at ?? undefined}>
                {item.created_at ? new Date(item.created_at).toLocaleString() : ''}
              </time>

              <button
                type="button"
                onClick={() => void onToggleStar(item)}
                aria-pressed={item.starred}
                aria-label={item.starred ? 'Unstar' : 'Star'}
                data-testid="notification-star"
              >
                {item.starred ? '★' : '☆'}
              </button>

              {!item.read_at && (
                <button
                  type="button"
                  onClick={() => void onOpen(item)}
                  data-testid="notification-mark-read"
                  aria-label="Mark as read"
                >
                  Mark read
                </button>
              )}

              <button
                type="button"
                onClick={() => void onDismiss(item)}
                aria-label="Dismiss"
                data-testid="notification-dismiss"
              >
                Dismiss
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
