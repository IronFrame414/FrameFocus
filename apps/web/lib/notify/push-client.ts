'use client';

/**
 * Push enrolment — platform detection and subscribe/unsubscribe.
 *
 * Spec: docs/specs/notifications-architecture.md §5.2, §10.2. A-N26, A-N27.
 *
 * ===========================================================================
 * THE ONE RULE THIS FILE EXISTS TO ENFORCE
 * ===========================================================================
 * ON iOS, IN A BROWSER TAB, `Notification.requestPermission()` IS NEVER CALLED.
 *
 * iOS Safari 16.4+ delivers Web Push ONLY to a PWA installed to the home screen
 * and launched from that icon. There is no browser-tab push on iPhone and, since
 * mobile is a PWA and not React Native (CLAUDE.md, M6M D-1), no app-store
 * alternative.
 *
 * This is not politeness. A permission decision is STICKY PER ORIGIN and cannot
 * be re-prompted from the app:
 *
 *   · A user who taps "Allow" in an iOS tab gets a subscription that never
 *     delivers, and concludes the feature is broken.
 *   · A user who taps "Don't allow" has PERMANENTLY DISABLED the channel from
 *     every surface — including the installed app they have not installed yet.
 *
 * The single prompt available per origin has to be spent inside the installed
 * PWA. So on iOS-uninstalled the UI shows install instructions and NO enable
 * control at all (§10.2), and this module refuses to prompt even if called.
 *
 * A-N26 asserts the UI shows no enable control there. A-N27 asserts this
 * function is never reached — because A-N26 alone passes on a build that hides
 * the button and prompts on load anyway.
 *
 * ===========================================================================
 * WHY BOTH SURFACES IMPORT THIS ONE MODULE
 * ===========================================================================
 * CLAUDE.md → PARITY. The mobile enrolment screen and the desktop settings row
 * are two presentations of one behaviour; a second implementation that "does the
 * same thing" is the divergence (TECH_DEBT #129). Only `surface` differs, and it
 * is a parameter.
 */

export type PushState =
  /** No Push API at all — an old browser, or a hardened one. */
  | 'unsupported'
  /** iOS, in a browser tab. Install first. NEVER prompt here. */
  | 'ios-needs-install'
  /** Permission was refused. Not re-promptable — the API will not show one. */
  | 'denied'
  /** Subscribed and live on this device. */
  | 'enabled'
  /** Supported, permitted or not yet asked, and safe to offer a button. */
  | 'available';

export type Surface = 'mobile' | 'desktop';

/**
 * iOS detection, including iPadOS 13+.
 *
 * An iPad on iPadOS 13+ reports a MacIntel platform and a desktop Safari UA by
 * default, so the UA test alone misses it — and missing it is not cosmetic here,
 * it is the difference between showing install instructions and burning the
 * origin's one permission prompt. The touch-points check is what catches it.
 */
export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  return /Macintosh/.test(ua) && typeof document !== 'undefined' && navigator.maxTouchPoints > 1;
}

/** Running as an installed PWA rather than in a browser tab. */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.matchMedia?.('(display-mode: standalone)').matches) return true;
  // iOS Safari's own non-standard flag, which predates display-mode and is still
  // the only reliable signal on older iOS versions.
  return (window.navigator as { standalone?: boolean }).standalone === true;
}

export function pushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

/**
 * What the UI should offer right now.
 *
 * Order matters. The iOS-uninstalled check comes BEFORE the permission check,
 * because on that platform the permission state is irrelevant — there is nothing
 * a granted permission could deliver to.
 */
export async function getPushState(scope: string): Promise<PushState> {
  if (!pushSupported()) {
    // iOS in a tab may not expose PushManager at all, which would otherwise
    // report 'unsupported' and send the user away instead of telling them to
    // install. The install path is the correct answer for that device.
    if (isIOS() && !isStandalone()) return 'ios-needs-install';
    return 'unsupported';
  }

  if (isIOS() && !isStandalone()) return 'ios-needs-install';

  if (Notification.permission === 'denied') return 'denied';

  if (Notification.permission === 'granted') {
    const registration = await navigator.serviceWorker.getRegistration(scope);
    const existing = await registration?.pushManager.getSubscription();
    if (existing) return 'enabled';
  }

  return 'available';
}

/**
 * VAPID keys travel as base64url; PushManager wants raw bytes.
 *
 * The return type is `Uint8Array<ArrayBuffer>`, not a bare `Uint8Array`, and the
 * buffer is allocated explicitly to produce it. Since TS 5.7 `Uint8Array` is
 * generic over `ArrayBufferLike`, which includes `SharedArrayBuffer` — and
 * `BufferSource` does not — so `new Uint8Array(length)` widens to something
 * `applicationServerKey` will not accept. Allocating the ArrayBuffer ourselves
 * pins the parameter without an assertion; `as unknown as BufferSource` would
 * have silenced the same error while discarding the check.
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  const buffer = new ArrayBuffer(raw.length);
  const output = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

export interface EnableResult {
  ok: boolean;
  state: PushState;
  reason?: string;
}

/**
 * Prompt, subscribe, and persist. Call ONLY from a user gesture.
 *
 * Returns rather than throws: a refused permission is a normal outcome the UI
 * has to render, not an exception.
 */
export async function enablePush(
  surface: Surface,
  scope: string,
  swUrl: string
): Promise<EnableResult> {
  // ⚠️ THE GUARD THIS WHOLE FILE IS ABOUT. Even if a caller reaches here on
  // iOS-in-a-tab — a refactor, a new screen, a helpful "enable everywhere"
  // button — we do not spend the origin's one prompt on a platform that cannot
  // deliver. A-N27 asserts exactly this.
  if (isIOS() && !isStandalone()) {
    return {
      ok: false,
      state: 'ios-needs-install',
      reason: 'Add FrameFocus to your Home Screen first, then open it from there.',
    };
  }

  if (!pushSupported()) {
    return { ok: false, state: 'unsupported', reason: 'This browser cannot receive push.' };
  }

  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!vapidPublicKey) {
    return {
      ok: false,
      state: 'available',
      reason: 'Push is not configured on this deployment.',
    };
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    return {
      ok: false,
      state: permission === 'denied' ? 'denied' : 'available',
      reason:
        permission === 'denied'
          ? 'Notifications are blocked for this site. Re-enable them in your browser settings.'
          : 'Permission was not granted.',
    };
  }

  const registration = await navigator.serviceWorker.register(swUrl, { scope });
  await navigator.serviceWorker.ready;

  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      // Required by Chrome, and honest: every push this app sends shows a
      // notification (the workers guarantee it), so silent push is never wanted.
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    }));

  const response = await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      subscription: subscription.toJSON(),
      surface,
      deviceLabel: typeof navigator !== 'undefined' ? navigator.platform || null : null,
    }),
  });

  if (!response.ok) {
    return { ok: false, state: 'available', reason: 'Could not save this device.' };
  }

  return { ok: true, state: 'enabled' };
}

/** Turn push off on this device: drop the browser subscription, retire the row. */
export async function disablePush(scope: string): Promise<void> {
  if (!pushSupported()) return;

  const registration = await navigator.serviceWorker.getRegistration(scope);
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;

  const { endpoint } = subscription;
  await subscription.unsubscribe();

  await fetch('/api/push/subscribe', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint }),
  });
}

/** Per-surface worker + scope. The two registrations ND-4 creates. */
export const PUSH_TARGETS: Record<Surface, { swUrl: string; scope: string }> = {
  mobile: { swUrl: '/sw.js', scope: '/m' },
  desktop: { swUrl: '/sw-dashboard.js', scope: '/dashboard' },
};
