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
export function PushEnrolment({
  surface,
  framed = true,
}: {
  surface: Surface;
  /**
   * Draw the card and its heading. Settings passes false because it already
   * frames this control in its own titled card; a second card inside it would
   * double both. Presentation only — every branch below renders identically.
   */
  framed?: boolean;
}) {
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
    <PushEnrolmentView
      state={state}
      surface={surface}
      framed={framed}
      busy={busy}
      message={message}
      onEnable={onEnable}
      onDisable={onDisable}
    />
  );
}

/**
 * The markup for one known state — split out so each branch can be rendered
 * directly in a test (test/push-enrolment-view.test.tsx pins A-N26: no button
 * in the iOS install branch). PushEnrolment above owns state and effects; this
 * owns nothing and decides nothing about which branch applies.
 *
 * ⚠️ TECH_DEBT #151 constraint 3: the card is a titled PANEL, not a pressable
 * surface — no hover, no cursor, no shadow, no fill distinct from the page's
 * other cards. The only things here that look pressable are real buttons, and
 * they exist only in `available` and `enabled`.
 */
export function PushEnrolmentView({
  state,
  surface,
  framed,
  busy,
  message,
  onEnable,
  onDisable,
}: {
  state: PushState;
  surface: Surface;
  framed: boolean;
  busy: boolean;
  message: string | null;
  onEnable: () => void;
  onDisable: () => void;
}) {
  const t = useT();

  // [2026-09-24, /m visual sweep Q1] Styled for the first time — it shipped with
  // no classes on either surface. One card, both surfaces; the button meets
  // /m's 44px floor on mobile. Nothing here changes which branch renders.
  const button =
    'inline-flex min-h-[44px] items-center justify-center rounded-[12px] px-[16px] text-[15px] font-bold disabled:opacity-60';
  const text = 'text-[14px] leading-relaxed text-m6m-navy/80';

  return (
    <div
      data-testid="push-enrolment"
      data-push-state={state}
      data-surface={surface}
      className={
        framed
          ? 'flex flex-col gap-[10px] rounded-[15px] border border-m6m-border bg-m6m-card px-[16px] py-[14px]'
          : 'flex flex-col gap-[10px]'
      }
    >
      {framed && (
        <h2 className="font-mono text-[11px] font-medium uppercase tracking-wide text-m6m-muted">
          {t('shell.push.heading')}
        </h2>
      )}

      {state === 'ios-needs-install' && (
        // ⚠️ NO BUTTON IN THIS BRANCH. A-N26 asserts its absence.
        <div data-testid="push-ios-install" className={`flex flex-col gap-[8px] ${text}`}>
          <p>{t('shell.push.iosIntro', { app: brand.name })}</p>
          <ol className="list-decimal space-y-[4px] pl-[20px]">
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
        <p data-testid="push-denied" className={text}>
          {t('shell.push.blocked', { app: brand.name })}
        </p>
      )}

      {state === 'unsupported' && (
        <p data-testid="push-unsupported" className={text}>
          {t('shell.push.unsupported')}
        </p>
      )}

      {state === 'available' && (
        <button
          type="button"
          onClick={onEnable}
          disabled={busy}
          data-testid="push-enable"
          className={`${button} self-start bg-m6m-blue text-white`}
        >
          {busy ? t('shell.push.turningOn') : t('shell.push.turnOn')}
        </button>
      )}

      {state === 'enabled' && (
        <div data-testid="push-enabled" className="flex flex-col gap-[10px]">
          <p className={text}>{t('shell.push.onForDevice')}</p>
          <button
            type="button"
            onClick={onDisable}
            disabled={busy}
            data-testid="push-disable"
            className={`${button} self-start border border-m6m-border bg-m6m-card text-m6m-navy`}
          >
            {busy ? t('shell.push.turningOff') : t('shell.push.turnOff')}
          </button>
        </div>
      )}

      {message && (
        <p data-testid="push-message" className={text}>
          {message}
        </p>
      )}
    </div>
  );
}
