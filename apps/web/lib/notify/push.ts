import 'server-only';
import webpush from 'web-push';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import { resolveClickTarget, type LinkParams, type Surface } from '@/lib/notify/links';

/**
 * Web Push delivery. Spec: docs/specs/notifications-architecture.md §5.2, §5.3, §4.4.
 *
 * ---------------------------------------------------------------------------
 * LAZY INIT, LIKE getStripe() AND getOpenAI()
 * ---------------------------------------------------------------------------
 * CLAUDE.md → Service Layer Pattern: clients are lazily initialised so a missing
 * env var cannot crash the BUILD. `webpush.setVapidDetails()` throws on a
 * malformed or absent key, and at module scope that throw happens during
 * `next build` on Vercel — turning "push is not configured yet" into "the whole
 * site fails to deploy".
 */

let configured = false;

function vapidConfigured(): boolean {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return false;

  if (!configured) {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || 'mailto:support@frameFocus.app',
      publicKey,
      privateKey
    );
    configured = true;
  }
  return true;
}

/** True when the deployment can actually send. Callers degrade, never throw. */
export function isPushConfigured(): boolean {
  return vapidConfigured();
}

export interface PushPayload {
  title: string;
  body: string | null;
  /** Already resolved for the target surface — see links.ts. */
  url: string;
  notificationId: string;
  /** Collapses repeats of the same source on the OS side. */
  tag?: string;
}

export interface PushResult {
  sent: number;
  pruned: number;
  failed: number;
}

type SubscriptionRow = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  surface: string;
};

/**
 * Send one notification to every live subscription belonging to `profileId`.
 *
 * `admin` must be a SERVICE-ROLE client: push_subscriptions is own-rows-only for
 * every role (an endpoint is a device credential), so a request-scoped client
 * cannot read the recipient's subscriptions — only the sender's own.
 *
 * NEVER THROWS. A push failure must not roll back the business event that caused
 * it, and must not roll back the notification row either — the in-app row is the
 * guaranteed channel (R3), push is the best-effort one. This mirrors
 * incident-notify.ts, whose comment says the same thing about email: "Send
 * failure NEVER rolls back."
 */
export async function sendPushToProfile(
  admin: SupabaseClient<Database>,
  profileId: string,
  payload: Omit<PushPayload, 'url'> & { linkKey: string | null; linkParams: LinkParams },
): Promise<PushResult> {
  const result: PushResult = { sent: 0, pruned: 0, failed: 0 };

  if (!vapidConfigured()) return result;

  const { data: subs } = await admin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth, surface')
    .eq('profile_id', profileId)
    .eq('is_deleted', false);

  const rows = (subs ?? []) as SubscriptionRow[];
  if (rows.length === 0) return result;

  const dead: string[] = [];

  await Promise.all(
    rows.map(async (sub) => {
      // ND-11: the SENDER resolves the URL, because it is the only party that
      // knows which surface this subscription belongs to. The worker is plain
      // JS in public/ and holds no link table — it just opens payload.url.
      const url = resolveClickTarget(
        payload.linkKey,
        payload.linkParams,
        sub.surface as Surface
      );

      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          JSON.stringify({
            title: payload.title,
            body: payload.body,
            url,
            notificationId: payload.notificationId,
            tag: payload.tag,
          } satisfies PushPayload)
        );
        result.sent += 1;
      } catch (err: unknown) {
        const status = (err as { statusCode?: number })?.statusCode;

        // 410 Gone / 404 Not Found: the endpoint is PERMANENTLY dead. Gate 4
        // flagged that this has no precedent anywhere in the codebase, and the
        // email retry banner is NOT an analogue — a bounced email may succeed on
        // retry, a dead endpoint never will. Retrying it forever is how a push
        // sender slowly turns into a spammer of the void.
        if (status === 410 || status === 404) {
          dead.push(sub.id);
          result.pruned += 1;
          return;
        }

        result.failed += 1;
      }
    })
  );

  if (dead.length) {
    // Soft delete, per the migration's reasoning: CLAUDE.md's trash-bin rule is
    // "never hard delete", and a re-subscribe REVIVES this row through the
    // endpoint unique index rather than colliding with a tombstone. The
    // behaviour the spec asked for — a dead endpoint is never sent to again —
    // is unchanged.
    await admin
      .from('push_subscriptions')
      .update({ is_deleted: true, deleted_at: new Date().toISOString() })
      .in('id', dead);
  }

  return result;
}
