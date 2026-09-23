import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dashboardDeniedRedirect } from '@/lib/dashboard-access';

// S109 #162 — the wiring half. Behaviour (wrong current password refused, the
// change lands, the caller stays signed in) is `s109-change-password.live.ts`.
// These assert the parts that are about WHERE things live — which, under
// CLAUDE.md → PARITY, is the rule: one check, one form, both surfaces.

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

describe('S109 #162 — one password check, one form, both surfaces', () => {
  it('ownership transfer and the self-service change share ONE re-verify', () => {
    const transfer = read('../app/dashboard/team/[id]/actions.ts');
    const change = read('../lib/auth/change-my-password.ts');
    expect(transfer).toMatch(/verifyCurrentPassword\(callerEmail, password\)/);
    expect(transfer, 'a second, private password sign-in came back').not.toMatch(/signInWithPassword/);
    expect(change).toMatch(/verifyCurrentPassword\(user\.email, input\.currentPassword\)/);
  });

  it('the throwaway session is revoked with scope LOCAL — never the global default', () => {
    const verify = read('../lib/auth/verify-current-password.ts');
    expect(verify).toMatch(/signOut\(\{ scope: 'local' \}\)/);
    expect(verify, 'a bare signOut() defaults to GLOBAL').not.toMatch(/auth\.signOut\(\)/);
  });

  it('both account pages mount the same PasswordForm', () => {
    for (const page of ['../app/dashboard/account/page.tsx', '../app/m/account/page.tsx']) {
      const src = read(page);
      expect(src, page).toMatch(/import \{ PasswordForm \} from '@\/components\/account\/password-form'/);
      expect(src, page).toMatch(/<PasswordForm \/>/);
    }
  });

  it('it is NOT on company settings, which foreman and crew cannot reach', () => {
    expect(read('../app/dashboard/settings/page.tsx')).not.toMatch(/PasswordForm/);
  });

  it('/reset-password lands each role where it lives, via the middleware helper', () => {
    const page = read('../app/reset-password/page.tsx');
    expect(page).toMatch(/router\.push\(dashboardDeniedRedirect\(profile\?\.role\) \?\? '\/dashboard'\)/);
    expect(page, "the hard-coded push to /dashboard is back").not.toMatch(/router\.push\('\/dashboard'\)/);
    // And the helper's answers — the destinations the page now uses.
    expect(dashboardDeniedRedirect('subcontractor')).toBe('/m/projects');
    expect(dashboardDeniedRedirect('client')).toBe('/portal');
    expect(dashboardDeniedRedirect('foreman')).toBeNull();
  });
});
