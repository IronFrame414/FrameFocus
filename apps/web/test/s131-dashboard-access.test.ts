import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DASHBOARD_ROLES, ROLE_HIERARCHY, type CompanyRole } from '@framefocus/shared';
import {
  isDashboardRole,
  dashboardDeniedRedirect,
  rolesWithoutDestination,
  SUBCONTRACTOR_HOME_PATH,
  CLIENT_PLACEHOLDER_PATH,
} from '@/lib/dashboard-access';
import { defaultSignedInPath, landingPathFor } from '@/lib/device';

// ============================================================================
// RULING A [Josh, S131] — DASHBOARD_ROLES, enforced.
// ============================================================================

const __dirname = dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

describe('the predicate agrees with the constant', () => {
  it('admits exactly the five dashboard roles', () => {
    for (const role of DASHBOARD_ROLES) {
      expect(isDashboardRole(role), `${role} should reach the dashboard`).toBe(true);
      expect(dashboardDeniedRedirect(role), `${role} should not be redirected`).toBeNull();
    }
  });

  it('refuses the two the ruling names, and sends each somewhere different', () => {
    expect(isDashboardRole('subcontractor')).toBe(false);
    expect(isDashboardRole('client')).toBe(false);
    expect(dashboardDeniedRedirect('subcontractor')).toBe(SUBCONTRACTOR_HOME_PATH);
    expect(dashboardDeniedRedirect('client')).toBe(CLIENT_PLACEHOLDER_PATH);
    // Distinct destinations, asserted rather than assumed: a sub sent to the
    // client placeholder would look like a working guard and be a dead end.
    expect(SUBCONTRACTOR_HOME_PATH).not.toBe(CLIENT_PLACEHOLDER_PATH);
  });

  it('⚠️ every role in the hierarchy is either admitted or given somewhere to go', () => {
    // THE DRIFT GUARD. Removing a role from DASHBOARD_ROLES without adding a
    // destination leaves it denied by the constant and ADMITTED by the
    // function, because an unrecognised role returns null. That is silently the
    // pre-S131 bug back again for that role, and nothing else would catch it.
    const all = Object.keys(ROLE_HIERARCHY) as CompanyRole[];
    expect(rolesWithoutDestination(all)).toEqual([]);
  });

  it('an absent or unknown role is NOT redirected — the layout owns that case', () => {
    // Fail-open here is deliberate and safe: "we do not know who this is" is
    // already handled by `if (!profile) redirect('/sign-in')`, and bouncing an
    // unknown role to a placeholder written for clients would be worse than
    // letting the existing handler run.
    expect(dashboardDeniedRedirect(null)).toBeNull();
    expect(dashboardDeniedRedirect(undefined)).toBeNull();
    expect(dashboardDeniedRedirect('platform_admin')).toBeNull();
    expect(isDashboardRole(null)).toBe(false);
  });
});

describe('D-54 — hidden AND route-guarded, in both seats', () => {
  it('middleware guards /dashboard through the shared helper', () => {
    const mw = read('../middleware.ts');
    expect(mw).toContain("from '@/lib/dashboard-access'");
    expect(mw).toContain('dashboardDeniedRedirect');
    // The matcher must still cover /dashboard, or the guard never runs.
    expect(mw).toContain("'/dashboard/:path*'");
  });

  it('the dashboard layout guards it too, and via the SAME helper', () => {
    const layout = read('../app/dashboard/layout.tsx');
    expect(layout).toContain("from '@/lib/dashboard-access'");
    expect(layout).toContain('dashboardDeniedRedirect');
  });

  it('⚠️ the guard runs BEFORE the billing redirect', () => {
    // A subcontractor on an expired trial must not be sent to
    // /dashboard/billing/plans — a dashboard page they may not reach and, being
    // Owner-only, one they could do nothing with. Order is the whole of it.
    const mw = read('../middleware.ts');
    expect(mw.indexOf('dashboardDeniedRedirect')).toBeLessThan(
      mw.indexOf("url.pathname = '/dashboard/billing/plans'")
    );
  });

  // ⚠️ INVERTED AT S164, NOT DELETED. `CLAUDE.md` — a fix session must sweep for
  // existing tests that encode the behaviour it is overturning.
  //
  // _Superseded, quoted rather than rewritten:_
  //
  //   it('the placeholder reads no data and names no company', () => {
  //     const page = read('../app/client-placeholder/page.tsx');
  //     expect(page).not.toContain('supabase');
  //     expect(page).not.toContain("from('companies')");
  //     expect(page).not.toContain('createClient');
  //   });
  //
  // Both halves were TRUE OF A HOLDING PAGE and are FALSE OF A PORTAL, on
  // purpose. The portal reads data (that is what it is for) and R20 requires it
  // to name the company — *"branding swaps only after authentication."*
  //
  // The property that survives is the one §11 actually protects: **no tenant
  // identity before a session.** That is now guaranteed by SHAPE rather than by
  // absence, and these three assertions are what pin the shape.
  describe('the portal replaced the placeholder, and R20 holds by construction', () => {
    it('the guard points at /portal, and the holding page is gone', () => {
      expect(CLIENT_PLACEHOLDER_PATH).toBe('/portal');
      expect(existsSync(resolve(__dirname, '../app/client-placeholder'))).toBe(false);
      expect(existsSync(resolve(__dirname, '../app/portal/layout.tsx'))).toBe(true);
    });

    it('⚠️ the layout redirects an unauthenticated caller BEFORE any company read', () => {
      // If a company query could run first, a signed-out visitor could be
      // served a tenant's name from a cached render. The order is the property.
      const layout = read('../app/portal/layout.tsx');
      const redirectAt = layout.indexOf("redirect('/sign-in?next=%2Fportal')");
      expect(redirectAt).toBeGreaterThan(-1);
      expect(layout).not.toContain("from('companies')");
    });

    it('⚠️ the shell TAKES branding as a prop and names no product', () => {
      // It cannot invent a company name, so it cannot leak one; and R20 says
      // the company's identity REPLACES the product's rather than joining it.
      const shell = read('../app/portal/portal-shell.tsx');
      expect(shell).not.toContain("from('companies')");
      expect(shell).not.toContain('createClient');
      expect(shell).not.toContain('@/lib/brand');
      expect(shell).toContain('branding');
    });
  });
});

describe('M6M A-6 is untouched', () => {
  // ==========================================================================
  // ⚠️ THIS CASE WAS RED, AND THE RULE IT PROTECTS WAS NEVER BROKEN [S188].
  // ==========================================================================
  //
  // Superseded assertion, quoted rather than deleted:
  //
  //     const device = read('../lib/device.ts');
  //     expect(device).not.toContain('CompanyRole');
  //     expect(device).not.toContain('DASHBOARD_ROLES');
  //
  // The RULE is right and stands: Ruling A governs the DASHBOARD-BLOCKED
  // redirect, A-6 governs the sign-in LANDING, Josh split them [S131], and if
  // the landing decision ever learns about role then the sign-in page — which
  // renders with no session and therefore no role — is the caller that breaks.
  //
  // ⚠️ THE PROXY IS WHAT WENT WRONG. "The file must not contain the string
  // `CompanyRole`" is not the rule; it was a cheap stand-in for the rule, and
  // it held only while `device.ts` contained nothing but the UA branch. `1ed3d10`
  // ("[Nav] #101: desktop/mobile surface toggle") added `SURFACE_TOGGLE_ROLES`
  // — a role-typed constant naming who SEES the toggle — and the case went red
  // on the import that constant needs.
  //
  // ⚠️ VERIFIED BEFORE REWRITING, because "the test is stale" is exactly the
  // conclusion that must not be assumed: `defaultSignedInPath` still reads
  // `isPhoneUserAgent(userAgent) ? '/m' : '/dashboard'` and consults nothing
  // else; `landingPathFor` branches on the saved surface preference and falls
  // through to it; and NO path function in the file reads
  // `SURFACE_TOGGLE_ROLES`. The constant is consumed by the UI that renders
  // the toggle. **The rule is intact; the instrument was wrong.**
  //
  // So the assertions below test the rule directly. Arity is a runtime fact
  // that a comment cannot fake, and it is what a role parameter would change.

  it('defaultSignedInPath still branches on user agent alone', () => {
    // One parameter, and it is the user agent. Adding a role would change this.
    expect(
      defaultSignedInPath.length,
      'defaultSignedInPath took a second argument — if that is a role, A-6 is broken'
    ).toBe(1);

    // And it really does branch on the UA rather than ignoring it.
    expect(defaultSignedInPath('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')).toBe('/m');
    expect(defaultSignedInPath('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')).toBe('/dashboard');
    expect(defaultSignedInPath(null)).toBe('/dashboard');
  });

  it('landingPathFor takes a saved preference and a user agent — not a role', () => {
    expect(landingPathFor.length, 'landingPathFor grew an argument').toBe(2);
    expect(landingPathFor('desktop', 'iPhone')).toBe('/dashboard');
    expect(landingPathFor('mobile', 'Macintosh')).toBe('/m');
    // With no preference it IS defaultSignedInPath, which is A-6 preserved for
    // everyone who never touches the toggle.
    expect(landingPathFor(null, 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')).toBe('/m');
  });

  it('⚠️ the landing decision still knows nothing about DASHBOARD_ROLES', () => {
    // The half of the original assertion that was never stale, kept verbatim in
    // effect: Ruling A's constant must not leak into the landing path. This one
    // is a string check on purpose — the point is that the dashboard guard's
    // vocabulary is absent from this file entirely.
    const device = read('../lib/device.ts');
    expect(device).not.toContain('DASHBOARD_ROLES');
    expect(device).not.toContain('isDashboardRole');
  });

  it('the role-typed constant that replaced the ban is UI-only, not a path input', () => {
    // ⚠️ THE GUARD THAT REPLACES THE STRING BAN. `SURFACE_TOGGLE_ROLES` is
    // allowed to exist here; what it must never do is decide a path. If a
    // future edit makes either landing function consult it, this goes red and
    // names why.
    const device = read('../lib/device.ts');
    const pathFunctions = device.slice(device.indexOf('export function defaultSignedInPath'));
    const bodies = pathFunctions
      .split('export ')
      .filter((chunk) => /^function (defaultSignedInPath|landingPathFor|isPhoneUserAgent)\b/.test(chunk));
    expect(bodies.length, 'the path functions moved — re-point this guard').toBeGreaterThanOrEqual(1);
    for (const body of bodies) {
      expect(
        body,
        'a landing function reads SURFACE_TOGGLE_ROLES — A-6 says the landing knows no role'
      ).not.toContain('SURFACE_TOGGLE_ROLES');
    }
  });
});
