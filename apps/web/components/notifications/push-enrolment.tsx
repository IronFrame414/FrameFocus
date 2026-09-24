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
import { useT } from '@/components/i18n/language-provider';

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
  const t = useT();

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
          <p>{t('shell.push.iosIntro', { app: brand.name })}</p>
          <ol>
            <li>
              {t('shell.push.tap')} <strong>{t('shell.push.share')}</strong>{' '}
              {t('shell.push.inSafari')}
            </li>
            <li>
              {t('shell.push.tap')} <strong>{t('shell.push.addToHomeScreen')}</strong>.
            </li>
            <li>
              {/* shortName, not name: this sentence points at the label UNDER the
                  home-screen icon, and that label IS the manifest's short_name. */}
              <strong>{t('shell.push.openFromIcon', { app: brand.shortName })}</strong>
              {t('shell.push.thenTurnOn')}
            </li>
          </ol>
          <p>
            {/* The step that is skipped most often, and the reason nothing works
                when it is. Stated rather than implied. */}
            {t('shell.push.onlyFromInstalled')}
          </p>
        </div>
      )}

      {state === 'denied' && (
        // No re-prompt: the API will not show one. Saying so beats a button that
        // silently does nothing, which reads as a broken app.
        <p data-testid="push-denied">{t('shell.push.blocked', { app: brand.name })}</p>
      )}

      {state === 'unsupported' && (
        <p data-testid="push-unsupported">{t('shell.push.unsupported')}</p>
      )}

      {state === 'available' && (
        <button type="button" onClick={onEnable} disabled={busy} data-testid="push-enable">
          {busy ? t('shell.push.turningOn') : t('shell.push.turnOn')}
        </button>
      )}

      {state === 'enabled' && (
        <div data-testid="push-enabled">
          <p>{t('shell.push.onForDevice')}</p>
          <button type="button" onClick={onDisable} disabled={busy} data-testid="push-disable">
            {busy ? t('shell.push.turningOff') : t('shell.push.turnOff')}
          </button>
        </div>
      )}

      {message && <p data-testid="push-message">{message}</p>}
    </div>
  );
}
