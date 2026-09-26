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
import { useT } from '@/components/i18n/language-provider';

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
 * ---------------------------------------------------------------------------
 * PRESENTATION [Josh, 2026-09-24 — /m visual sweep, Q1]
 * ---------------------------------------------------------------------------
 * Until this date the component shipped with NO styling at all, on either
 * surface: title and body ran together, the timestamp ran inline, and every
 * control rendered as bare text. Not a regression — no version since 7b07ddce
 * (2026-08-09) carried a class. Styled HERE, once, so both surfaces get it: the
 * m6m tokens are the product palette on desktop too (R6). `compact` raises every
 * target to /m's 44px floor; it changes nothing a tap writes.
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
  rollUpRepeats = false,
}: {
  initial: NotificationListItem[];
  surface: Surface;
  filter: NotificationFilter;
  compact?: boolean;
  /** §8.11.2 — desktop roll-up: a run of ≥4 consecutive same-type rows
   *  collapses to the first plus "N more — Expand". Presentation only: the
   *  hidden rows are the same rows, and expanding writes nothing. */
  rollUpRepeats?: boolean;
}) {
  const router = useRouter();
  const t = useT();
  const [items, setItems] = useState(initial);
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [expandedRuns, setExpandedRuns] = useState<ReadonlySet<string>>(new Set());

  const unreadCount = useMemo(() => items.filter((i) => !i.read_at).length, [items]);

  // Roll-up entries. Keyed on the FIRST item's id (stable under dismissals),
  // not the index. A run stays collapsed until its Expand is clicked.
  const entries = useMemo(() => {
    type Entry =
      | { kind: 'item'; item: NotificationListItem }
      | { kind: 'rollup'; runKey: string; count: number; type: string };
    const out: Entry[] = [];
    if (!rollUpRepeats) {
      for (const item of items) out.push({ kind: 'item', item });
      return out;
    }
    let i = 0;
    while (i < items.length) {
      let j = i;
      while (j < items.length && items[j].type === items[i].type) j++;
      const run = j - i;
      if (run >= 4 && !expandedRuns.has(items[i].id)) {
        out.push({ kind: 'item', item: items[i] });
        out.push({ kind: 'rollup', runKey: items[i].id, count: run - 1, type: items[i].type });
      } else {
        for (let k = i; k < j; k++) out.push({ kind: 'item', item: items[k] });
      }
      i = j;
    }
    return out;
  }, [items, rollUpRepeats, expandedRuns]);

  /** Optimistic local patch, so a tap feels immediate on a weak jobsite signal. */
  const patch = useCallback((id: string, next: Partial<NotificationListItem>) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...next } : i)));
  }, []);

  const onOpen = useCallback(
    async (item: NotificationListItem) => {
      const href = resolveLink(item.link_key, (item.link_params ?? {}) as LinkParams, surface);

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
          setError(err instanceof Error ? err.message : t('shell.notif.couldNotMarkRead'));
          return;
        }
      }

      if (href) startTransition(() => router.push(href));
    },
    [patch, router, surface, t]
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
        setError(err instanceof Error ? err.message : t('shell.notif.couldNotUpdate'));
      }
    },
    [patch, t]
  );

  const onDismiss = useCallback(
    async (item: NotificationListItem) => {
      const snapshot = item;
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      try {
        await dismiss(item.id);
      } catch (err) {
        setItems((prev) => [snapshot, ...prev]);
        setError(err instanceof Error ? err.message : t('shell.notif.couldNotDismiss'));
      }
    },
    [t]
  );

  const onMarkAllRead = useCallback(async () => {
    const snapshot = items;
    const stamp = new Date().toISOString();
    setItems((prev) => prev.map((i) => (i.read_at ? i : { ...i, read_at: stamp })));
    try {
      await markAllRead();
    } catch (err) {
      setItems(snapshot);
      setError(err instanceof Error ? err.message : t('shell.notif.couldNotMarkAllRead'));
    }
  }, [items, t]);

  // 44px on /m (§2's touch floor); a desktop pointer does not need it.
  const target = compact ? 'min-h-[44px]' : 'min-h-[34px]';
  const secondaryButton = `inline-flex ${target} items-center justify-center rounded-[10px] border border-m6m-border bg-m6m-card px-[12px] text-[13px] font-bold transition-colors hover:bg-m6m-surface`;

  if (items.length === 0) {
    // §10.1: "No notifications." No illustration.
    return (
      <div data-testid="notifications-empty">
        <p className="rounded-[15px] border border-dashed border-m6m-border bg-m6m-card px-[16px] py-[22px] text-center text-[15px] text-m6m-muted">
          {filter === 'unread'
            ? t('shell.notif.nothingUnread')
            : filter === 'starred'
              ? t('shell.notif.nothingStarred')
              : t('shell.notif.none')}
        </p>
      </div>
    );
  }

  return (
    <div
      data-testid="notification-list"
      data-surface={surface}
      className="flex flex-col gap-[12px]"
    >
      {error && (
        <p
          role="alert"
          data-testid="notification-error"
          className="rounded-[12px] border border-m6m-danger-border bg-m6m-card px-[14px] py-[10px] text-[14px] font-semibold text-m6m-danger"
        >
          {error}
        </p>
      )}

      {unreadCount > 0 && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onMarkAllRead}
            data-testid="notifications-mark-all"
            className={`${secondaryButton} text-m6m-blue`}
          >
            {t('shell.notif.markAllRead')}
          </button>
        </div>
      )}

      <ul className="overflow-hidden rounded-[15px] border border-m6m-border bg-m6m-card">
        {entries.map((entry) => {
          if (entry.kind === 'rollup') {
            return (
              <li
                key={`rollup-${entry.runKey}`}
                data-testid="notification-rollup"
                className="border-b border-m6m-border last:border-b-0"
              >
                <button
                  type="button"
                  onClick={() => setExpandedRuns((prev) => new Set([...prev, entry.runKey]))}
                  data-testid="notification-rollup-expand"
                  className={`flex w-full ${target} items-center px-[14px] py-[10px] text-left text-[14px] font-bold text-m6m-blue hover:bg-m6m-surface`}
                >
                  {t('shell.notif.rollupMore', {
                    n: entry.count,
                    type: entry.type.replace(/_/g, ' '),
                  })}
                </button>
              </li>
            );
          }
          const item = entry.item;
          const href = resolveLink(item.link_key, (item.link_params ?? {}) as LinkParams, surface);
          const linked = href !== null;
          const unread = !item.read_at;
          const text = (
            <>
              <span
                data-testid="notification-title"
                className={`block text-[15px] leading-snug text-m6m-navy ${unread ? 'font-bold' : 'font-semibold'}`}
              >
                {item.title}
              </span>
              {item.body && (
                <span
                  data-testid="notification-body"
                  className="mt-[2px] block text-[14px] leading-snug text-m6m-navy/70"
                >
                  {item.body}
                </span>
              )}
            </>
          );

          return (
            <li
              key={item.id}
              data-testid="notification-row"
              data-read={item.read_at ? 'true' : 'false'}
              data-linked={linked ? 'true' : 'false'}
              data-type={item.type}
              data-compact={compact ? 'true' : 'false'}
              className="flex gap-[10px] border-b border-m6m-border px-[14px] py-[12px] last:border-b-0"
            >
              {/* Unread marker. Decorative: the bold title and the Mark read
                  control carry the same fact in text, so colour is never the
                  only signal. */}
              <span
                aria-hidden
                className={`mt-[7px] h-[8px] w-[8px] shrink-0 rounded-full ${unread ? 'bg-m6m-blue' : 'bg-transparent'}`}
              />
              <div className="min-w-0 flex-1">
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
                    // [S112 audit F24] measured 306x42 on /m — the one row control
                    // the sweep's compact floor (`target`) missed.
                    className={`block w-full rounded-[6px] text-left hover:opacity-80 ${target}`}
                  >
                    {text}
                  </button>
                ) : (
                  <div data-testid="notification-static">{text}</div>
                )}

                <time
                  dateTime={item.created_at ?? undefined}
                  className="mt-[4px] block font-mono text-[11px] text-m6m-muted"
                >
                  {item.created_at ? new Date(item.created_at).toLocaleString() : ''}
                </time>

                <div className="mt-[8px] flex flex-wrap items-center gap-[8px]">
                  <button
                    type="button"
                    onClick={() => void onToggleStar(item)}
                    aria-pressed={item.starred}
                    aria-label={item.starred ? t('shell.notif.unstar') : t('shell.notif.star')}
                    data-testid="notification-star"
                    className={`inline-flex ${compact ? 'h-11 w-11' : 'h-[34px] w-[34px]'} items-center justify-center rounded-full border border-m6m-border bg-m6m-card text-[18px] leading-none ${item.starred ? 'text-m6m-amber' : 'text-m6m-muted'}`}
                  >
                    {item.starred ? '★' : '☆'}
                  </button>

                  {!item.read_at && (
                    <button
                      type="button"
                      onClick={() => void onOpen(item)}
                      data-testid="notification-mark-read"
                      aria-label={t('shell.notif.markAsRead')}
                      className={`${secondaryButton} text-m6m-navy`}
                    >
                      {t('shell.notif.markRead')}
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => void onDismiss(item)}
                    aria-label={t('shell.notif.dismiss')}
                    data-testid="notification-dismiss"
                    className={`${secondaryButton} text-m6m-muted`}
                  >
                    {t('shell.notif.dismiss')}
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
