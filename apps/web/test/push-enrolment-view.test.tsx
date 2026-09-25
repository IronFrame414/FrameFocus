import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PushEnrolmentView } from '@/components/notifications/push-enrolment';
import type { PushState } from '@/lib/notify/push-client';

// TECH_DEBT #151 asked for this BEFORE any restyle: "No test references this
// component anywhere … the pass should add at minimum an A-N26 assertion — no
// button in the iOS branch." Written in the /m visual sweep [2026-09-24], the
// pass that first styled the component.
//
// A-N26 / §10.2 — "the UI must not offer a control that cannot succeed". On iOS
// in a browser tab a permission denial is permanent for the origin, so the
// install branch renders instructions and NO control. `denied` and
// `unsupported` are statements too. Only `available` and `enabled` act.

const noop = () => {};
const render = (state: PushState, framed = true) =>
  renderToStaticMarkup(
    <PushEnrolmentView
      state={state}
      surface="mobile"
      framed={framed}
      busy={false}
      message={null}
      onEnable={noop}
      onDisable={noop}
    />
  );
const buttons = (html: string) => (html.match(/<button\b/g) ?? []).length;

describe('PushEnrolmentView — which states offer a control (A-N26)', () => {
  it('CONTROL — the counter sees a button where there is one', () => {
    expect(buttons(render('available'))).toBe(1);
    expect(render('available')).toContain('data-testid="push-enable"');
    expect(buttons(render('enabled'))).toBe(1);
    expect(render('enabled')).toContain('data-testid="push-disable"');
  });

  it.each<PushState>(['ios-needs-install', 'denied', 'unsupported'])(
    '%s renders NO button, and nothing role=button',
    (state) => {
      const html = render(state);
      expect(html).toContain(`data-push-state="${state}"`);
      expect(buttons(html)).toBe(0);
      expect(html).not.toMatch(/role="button"|onclick|cursor-pointer/i);
    }
  );

  it('the iOS branch says to reopen from the home-screen icon (the step people skip)', () => {
    expect(render('ios-needs-install')).toContain('data-testid="push-ios-install"');
  });

  it('the panel carries no pressable affordance itself — #151 constraint 3', () => {
    const html = render('ios-needs-install');
    const panel = /<div[^>]*data-testid="push-enrolment"[^>]*>/.exec(html)?.[0] ?? '';
    expect(panel).not.toBe('');
    expect(panel).not.toMatch(/hover:|cursor-pointer|shadow|active:/);
  });

  it('framed draws its own heading; framed={false} (Settings) does not', () => {
    expect(render('available', true)).toMatch(/<h2\b/);
    expect(render('available', false)).not.toMatch(/<h2\b/);
  });
});
