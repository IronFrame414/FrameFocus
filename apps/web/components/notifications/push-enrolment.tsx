'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  PUSH_TARGETS,
  disablePush,
  enablePush,
  getPushState,
  type PushState,
  type Surface,
} from '@/lib/notify/push-client';
import { brand } from '@/lib/brand';

/**
 * Push enrolment control. ONE component, both surfaces.
 *
 * Spec: docs/specs/notifications-architecture.md §10.2. A-N26, A-N27.
 *
 * ---------------------------------------------------------------------------
 * THE iOS BRANCH RENDERS NO ENABLE CONTROL. THAT IS THE FEATURE.
 * ---------------------------------------------------------------------------
 * §10.2: "the UI must not offer a control that cannot succeed." On iOS in a
 * browser tab there is no button, no disabled button, and no "try anyway" —
 * because a permission denial there is permanent for the origin and would
 * silently disable push inside the installed app the user has not yet
 * installed.
 *
 * It also states the step people skip: **reopen the app from the home-screen
 * icon**. Installing and then continuing in the tab looks identical to the user
 * and delivers nothing.
 *
 * ---------------------------------------------------------------------------
 * CLAUDE.md → PARITY: one feature, both surfaces, same behaviour.
 * ---------------------------------------------------------------------------
 * Layout and spacing may differ between phone and desktop; what must not differ
 * is what a tap does and what it writes. Both surfaces render THIS component and
 * pass a different `surface` — they do not each own a copy.
 */
export function PushEnrolment({ surface }: { surface: Surface }) {
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const target = PUSH_TARGETS[surface];

  const refresh = useCallback(async () => {
    setState(await getPushState(target.scope));
  }, [target.scope]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onEnable = useCallback(async () => {
    setBusy(true);
    setMessage(null);
    // Called from a click, never from an effect — the permission prompt requires
    // a user gesture, and a prompt fired on mount is the A-N27 failure.
    const result = await enablePush(surface, target.scope, target.swUrl);
    setState(result.state);
    setMessage(result.reason ?? null);
    setBusy(false);
  }, [surface, target.scope, target.swUrl]);

  const onDisable = useCallback(async () => {
    setBusy(true);
    await disablePush(target.scope);
    await refresh();
    setBusy(false);
  }, [refresh, target.scope]);

  // Nothing rendered until the state is known. A flash of "Enable" that becomes
  // install instructions a tick later is the same wrong offer, just briefly.
  if (state === null) return null;

  return (
    <div data-testid="push-enrolment" data-push-state={state}>
      {state === 'ios-needs-install' && (
        // ⚠️ NO BUTTON IN THIS BRANCH. A-N26 asserts its absence.
        <div data-testid="push-ios-install">
          <p>
            To get notifications on iPhone or iPad, add {brand.name} to your Home Screen
            first.
          </p>
          <ol>
            <li>
              Tap <strong>Share</strong> in Safari.
            </li>
            <li>
              Tap <strong>Add to Home Screen</strong>.
            </li>
            <li>
              {/* shortName, not name: this sentence points at the label UNDER the
                  home-screen icon, and that label IS the manifest's short_name. */}
              <strong>Open {brand.shortName} from the new icon</strong>, then turn
              notifications on there.
            </li>
          </ol>
          <p>
            {/* The step that is skipped most often, and the reason nothing works
                when it is. Stated rather than implied. */}
            Notifications can only be turned on from the installed app — not from this
            browser tab.
          </p>
        </div>
      )}

      {state === 'denied' && (
        // No re-prompt: the API will not show one. Saying so beats a button that
        // silently does nothing, which reads as a broken app.
        <p data-testid="push-denied">
          Notifications are blocked for this site. To turn them back on, allow
          notifications for {brand.name} in your browser settings.
        </p>
      )}

      {state === 'unsupported' && (
        <p data-testid="push-unsupported">
          This browser can&apos;t receive push notifications. You&apos;ll still see
          everything in your notifications list.
        </p>
      )}

      {state === 'available' && (
        <button type="button" onClick={onEnable} disabled={busy} data-testid="push-enable">
          {busy ? 'Turning on…' : 'Turn on notifications'}
        </button>
      )}

      {state === 'enabled' && (
        <div data-testid="push-enabled">
          <p>Notifications are on for this device.</p>
          <button type="button" onClick={onDisable} disabled={busy} data-testid="push-disable">
            {busy ? 'Turning off…' : 'Turn off on this device'}
          </button>
        </div>
      )}

      {message && <p data-testid="push-message">{message}</p>}
    </div>
  );
}
