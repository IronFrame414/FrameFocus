import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { crewManifest } from '@/lib/crew-manifest';
import { portalManifest } from '@/lib/portal-manifest';
import { brand } from '@/lib/brand';

/**
 * S164 — Module 9 Q5. THE PORTAL'S INSTALL PATH.
 *
 * ============================================================================
 * ⚠️ THE FIRST GROUP IS THE POINT OF THIS FILE
 * ============================================================================
 * The brief was explicit: *"If a portal scope cannot be added without changing
 * crew behaviour, STOP and say so rather than shipping a manifest change that
 * redirects field users."* It can, and these assertions are what makes that a
 * fact rather than an intention — a future edit to `app/manifest.ts` that moved
 * `start_url` off `/m` would go red here, in a file named for the portal, which
 * is the only place anybody would think to look for a portal regression.
 */

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

/**
 * ⚠️ COMMENTS STRIPPED, AND THIS IS NOT A CONVENIENCE.
 *
 * Every file under test EXPLAINS the trap it avoids — the portal worker's header
 * names `/dashboard/notifications` and `/m/` as the paths it must NOT fall back
 * to, and the portal layout explains why it does not hand-write a manifest link.
 * A raw substring search matches the WARNING and fails on the very discipline it
 * is checking. A test that cannot tell a rule from its own documentation is not
 * checking the rule. `stripsWork` below proves the stripper before anything
 * relies on it.
 */
const strip = (src: string): string =>
  src
    // Block comments, and JSX's {/* ... */} form.
    .replace(/\/\*[\s\S]*?\*\//g, '')
    // Whole-line `//` comments.
    .replace(/^\s*\/\/.*$/gm, '')
    // TRAILING `//` comments, guarding `://` so a URL in a string survives.
    // Without this a trailing comment naming a forbidden path slips straight
    // past — which the self-test below caught on its first run.
    .replace(/([^:])\/\/.*$/gm, '$1');

const code = (rel: string): string => strip(read(rel));

const crew = crewManifest();
const portal = portalManifest();

describe('Q5 — the CREW manifest is untouched', () => {
  it('⚠️ start_url is still /m — a field user’s installed icon has not moved', () => {
    expect(crew.start_url).toBe('/m');
  });

  it('and it still carries the product’s own name, which the portal’s must not', () => {
    expect(crew.name).toBe(brand.name);
    expect(crew.short_name).toBe(brand.shortName);
  });

  it('⚠️ and the crew manifest declares NO scope — recorded as an asymmetry, not a gap', () => {
    // Its default scope is therefore `/`, which technically contains /portal.
    // Adding `scope: '/m'` would be the correct symmetry and would change what
    // an ALREADY-INSTALLED field app captures, which this work does not do.
    // Asserted so the asymmetry is a decision somebody made rather than a thing
    // nobody noticed. If a future session adds it, this test is the prompt to
    // record why.
    expect(crew.scope).toBeUndefined();
  });
});

describe('Q5 — the portal manifest is a different app', () => {
  it('start_url and scope are both /portal', () => {
    expect(portal.start_url).toBe('/portal');
    expect(portal.scope).toBe('/portal');
  });

  it('⚠️ an installed portal cannot capture /m or /dashboard', () => {
    // The failure §2.5 of the Phase 1 findings describes: a client installs the
    // app and the icon opens the field-crew shell.
    expect(portal.scope!.startsWith('/portal')).toBe(true);
    expect(portal.start_url!.startsWith('/m')).toBe(false);
    expect(portal.start_url!.startsWith('/dashboard')).toBe(false);
  });

  it('display is standalone — the iOS Web Push precondition, not a style choice', () => {
    expect(portal.display).toBe('standalone');
  });

  it('⚠️ R20 — the PRODUCT does not name itself to a client', () => {
    expect(JSON.stringify(portal)).not.toContain(brand.name);
    expect(JSON.stringify(portal)).not.toContain(brand.shortName);
    // ...and no retired product name either, same rule as the crew manifest.
    expect(JSON.stringify(portal)).not.toContain('FrameFocus');
  });

  it('short_name is short enough not to be truncated on a home screen', () => {
    expect(portal.short_name!.length).toBeLessThanOrEqual(12);
  });

  it('the OS-chrome colours are shared with the crew manifest, deliberately', () => {
    // These tint the status bar and the splash — platform chrome, not tenant
    // identity. See lib/brand.ts on why they are brand values.
    expect(portal.theme_color).toBe(crew.theme_color);
    expect(portal.background_color).toBe(crew.background_color);
  });
});

describe('Q5 — the wiring, which is where this silently fails', () => {
  it('⚠️ the portal manifest is a ROUTE, not a nested manifest.ts', () => {
    // Next collects the manifest FILE convention only at the app root. A
    // `app/portal/manifest.ts` is never detected — silently — and the portal
    // would go on serving the crew manifest.
    expect(existsSync(fileURLToPath(new URL('../app/portal.webmanifest/route.ts', import.meta.url))))
      .toBe(true);
    expect(existsSync(fileURLToPath(new URL('../app/portal/manifest.ts', import.meta.url))))
      .toBe(false);
  });

  it('the portal layout points its metadata at that URL', () => {
    const layout = read('../app/portal/layout.tsx');
    expect(layout).toContain("manifest: '/portal.webmanifest'");
  });

  it('⚠️ and the layout does NOT hand-write a <link rel="manifest">', () => {
    // Two manifest links is a spec violation and browsers pick unpredictably.
    // M6M §7.1 records the rule; the metadata field is how it is honoured.
    expect(code('../app/portal/layout.tsx')).not.toContain('rel="manifest"');
  });

  it('the route serves the right content type', () => {
    const route = read('../app/portal.webmanifest/route.ts');
    expect(route).toContain('application/manifest+json');
  });

  it('⚠️ the app/manifest.ts FILE CONVENTION is gone, which is what makes the override work', () => {
    // Measured before it was changed: a nested layout exporting BOTH `title`
    // and `manifest` had its title honoured and its manifest IGNORED — the page
    // still linked `/manifest.webmanifest`. The convention is collected only at
    // the app root and applied AFTER the metadata chain, so nothing nested can
    // override it. If somebody restores `app/manifest.ts`, the portal silently
    // starts serving the CREW manifest again and an installed portal opens the
    // field shell. This is the assertion that catches that.
    expect(existsSync(fileURLToPath(new URL('../app/manifest.ts', import.meta.url)))).toBe(false);
    expect(existsSync(fileURLToPath(new URL('../app/manifest.webmanifest/route.ts', import.meta.url))))
      .toBe(true);
    expect(read('../app/layout.tsx')).toContain("manifest: '/manifest.webmanifest'");
  });

  it('⚠️ and the crew manifest is served at the SAME URL by the same object', () => {
    // The move must be invisible to a field user. The bytes were diffed against
    // a running server before and after and were identical; this pins the two
    // halves that make that true.
    const route = read('../app/manifest.webmanifest/route.ts');
    expect(route).toContain('crewManifest');
    expect(route).toContain('public, max-age=0, must-revalidate');
  });
});

describe('Q5 — the third service worker', () => {
  const worker = read('../public/sw-portal.js');
  const registrar = read('../app/portal/register-portal-sw.tsx');

  it('registers with scope /portal, from the portal layout only', () => {
    expect(registrar).toContain("register('/sw-portal.js', { scope: '/portal' })");
    const layout = read('../app/portal/layout.tsx');
    expect(layout).toContain('RegisterPortalSw');
  });

  it('⚠️ has NO fetch handler — it caches nothing and can serve nothing stale', () => {
    // The S121 failure the /m worker's cache produced: a previous build's JS
    // hydrating the current build's HTML. The portal takes none of that risk.
    expect(worker).not.toContain("addEventListener('fetch'");
  });

  for (const handler of ['push', 'notificationclick', 'pushsubscriptionchange']) {
    it(`carries the '${handler}' handler, like the other two workers`, () => {
      expect(worker).toContain(`addEventListener('${handler}'`);
    });
  }

  it('every push shows a notification — Chrome revokes silent subscriptions', () => {
    expect(worker).toContain('showNotification');
  });

  it('⚠️ its fallback URL is /portal, and NOT a route a client is bounced out of', () => {
    // THE copy-paste failure. sw-dashboard.js falls back to
    // '/dashboard/notifications', which the S131 guard redirects a client away
    // from — so a client tapping a notification would land on a bounce.
    expect(worker).toContain("|| '/portal'");
    expect(code('../public/sw-portal.js')).not.toContain('/dashboard/notifications');
    expect(code('../public/sw-portal.js')).not.toContain("'/m/");
  });

  it('⚠️ R20 — the push fallback title is not the product name', () => {
    expect(code('../public/sw-portal.js')).not.toContain(brand.name);
    expect(code('../public/sw-portal.js')).not.toContain('FrameFocus');
  });

  it('the comment stripper works, or the three assertions above prove nothing', () => {
    expect(strip('const a = 1; // /dashboard/notifications\n')).not.toContain('/dashboard');
    expect(strip('/* /m/projects */ const a = 1;')).not.toContain('/m/');
    expect(strip("const url = '/portal';")).toContain('/portal');
  });
});

describe('Q5 — ⚠️ the portal does NOT enrol push, and stage 6 is still gated', () => {
  it('nothing under app/portal calls subscribeToPush', () => {
    // §13 gates stage 6 on push enrolment being verified on a handset. The
    // worker exists because iOS delivers push only to an INSTALLED PWA — the
    // install is the precondition, not the feature. Enrolling here would jump
    // that gate.
    for (const f of [
      '../app/portal/layout.tsx',
      '../app/portal/page.tsx',
      '../app/portal/[projectId]/page.tsx',
      '../app/portal/register-portal-sw.tsx',
    ]) {
      expect(read(f), f).not.toContain('subscribeToPush');
    }
  });

  it('⚠️ and the surface it WOULD use is still refused, which is the safe order', () => {
    // The worker's re-subscribe posts `surface: 'client'`. That value is not in
    // `push_subscriptions_surface_check` and not in `links.ts`'s Surface type.
    // Borrowing 'mobile' instead would be ACCEPTED and would resolve a client's
    // notification to `/m/...` — a route she is bounced out of. A refused value
    // fails loudly; a borrowed one fails silently.
    expect(read('../public/sw-portal.js')).toContain("surface: 'client'");

    const subscribeRoute = read('../app/api/push/subscribe/route.ts');
    expect(subscribeRoute).toContain("surface !== 'mobile' && surface !== 'desktop'");

    const links = read('../lib/notify/links.ts');
    expect(links).toContain("export type Surface = 'mobile' | 'desktop'");
  });
});
