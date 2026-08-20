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
  it('defaultSignedInPath still branches on user agent alone', () => {
    // Ruling A governs the DASHBOARD-BLOCKED redirect; A-6 governs the sign-in
    // LANDING. Josh split them [S131]. If this file ever learns about role, the
    // sign-in page — which renders with no session and therefore no role — is
    // the caller that breaks.
    const device = read('../lib/device.ts');
    expect(device).not.toContain('CompanyRole');
    expect(device).not.toContain('DASHBOARD_ROLES');
  });
});
