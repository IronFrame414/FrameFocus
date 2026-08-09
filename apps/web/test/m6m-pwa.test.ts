import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import manifest from '@/app/manifest';
import { brand } from '@/lib/brand';

// M6M §7 — the PWA criteria: A-26b, A-26b2, A-26b3, A-26b4, A-26c [unit],
// plus the file-pair pin behind A-26d's retry hook. A-26 itself is [manual]
// (nothing installs a PWA to an iPhone from CI); A-26d/A-26e run in
// e2e/m-pwa.spec.ts.

const WEB_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(WEB_ROOT, rel), 'utf8');

const m = manifest();

describe('§7.1 — the manifest', () => {
  it('A-26b · declares start_url "/m" and display "standalone" — the two fields M6M owns', () => {
    expect(m.start_url).toBe('/m');
    expect(m.display).toBe('standalone');
  });

  it('A-26b2 · name, short_name, theme_color, background_color are READ from the brand source, not literals', () => {
    // The values track the source…
    expect(m.name).toBe(brand.name);
    expect(m.short_name).toBe(brand.shortName);
    expect(m.theme_color).toBe(brand.themeColor);
    expect(m.background_color).toBe(brand.backgroundColor);

    // …and the manifest SOURCE contains none of them as a literal, so editing
    // lib/brand.ts changes the manifest with no edit here. This is the
    // assertion that fails on a stale product name WITHOUT naming the new one.
    const src = read('app/manifest.ts');
    for (const value of [brand.name, brand.shortName, brand.themeColor, brand.backgroundColor]) {
      expect(src).not.toContain(value);
    }
    for (const ref of ['brand.name', 'brand.shortName', 'brand.themeColor', 'brand.backgroundColor']) {
      expect(src).toContain(ref);
    }
  });

  it('A-26b3 · no product name appears as a string anywhere in the /m tree or the manifest', () => {
    const files: string[] = ['app/manifest.ts'];
    const walk = (dir: string) => {
      for (const name of readdirSync(join(WEB_ROOT, dir))) {
        const rel = join(dir, name);
        if (statSync(join(WEB_ROOT, rel)).isDirectory()) walk(rel);
        else if (/\.(ts|tsx)$/.test(name)) files.push(rel);
      }
    };
    walk('app/m');
    expect(files.length).toBeGreaterThan(20); // the walk actually walked

    // The current names AND the pre-rebrand one — comments included on
    // purpose: a name in a comment is one paste away from shipping.
    for (const rel of files) {
      const src = read(rel);
      for (const name of [brand.name, brand.shortName, 'FrameFocus']) {
        expect(src, `${rel} contains "${name}"`).not.toContain(name);
      }
    }
  });

  it('A-26b4 · §2\'s navy token and the manifest theme_color resolve INDEPENDENTLY', () => {
    const brandSrc = read('lib/brand.ts');
    const tailwindSrc = read('tailwind.config.ts');
    const themeSrc = read('lib/theme.ts');

    // Two decisions that happen to share a value today — each side carries
    // its OWN literal…
    expect(brandSrc).toContain("themeColor: '#14213d'");
    expect(tailwindSrc).toContain("navy: '#14213d'");

    // …and neither resolves through the other: brand.ts imports nothing at
    // all, and neither the tailwind token block nor theme.ts reaches into the
    // brand module. Changing one cannot change the other.
    expect(brandSrc).not.toMatch(/^\s*import\s/m);
    expect(tailwindSrc).not.toContain('lib/brand');
    expect(tailwindSrc).not.toContain("from './lib/brand'");
    expect(themeSrc).not.toContain('brand');
  });

  it('A-26c · icons exist at 192, 512 and 512 maskable, and the manifest references all three', () => {
    const pngSize = (rel: string) => {
      const buf = readFileSync(join(WEB_ROOT, rel));
      return `${buf.readUInt32BE(16)}x${buf.readUInt32BE(20)}`; // IHDR w×h
    };
    expect(pngSize('public/icon-192.png')).toBe('192x192');
    expect(pngSize('public/icon-512.png')).toBe('512x512');
    expect(pngSize('public/icon-maskable-512.png')).toBe('512x512');

    const icons = m.icons ?? [];
    expect(icons.find((i) => i.src === '/icon-192.png')?.sizes).toBe('192x192');
    expect(icons.find((i) => i.src === '/icon-512.png')?.sizes).toBe('512x512');
    const maskable = icons.find((i) => i.src === '/icon-maskable-512.png');
    expect(maskable?.sizes).toBe('512x512');
    expect(maskable?.purpose).toBe('maskable');
    // The maskable is a genuinely different file, not a re-export of the
    // standard 512 — serving the same artwork under both purposes is the
    // classic visibly-cropped-tile error.
    expect(readFileSync(join(WEB_ROOT, 'public/icon-512.png')).equals(
      readFileSync(join(WEB_ROOT, 'public/icon-maskable-512.png'))
    )).toBe(false);
  });
});

describe('§7.2 item 3 — the retry hook pair (A-26d, the wiring half)', () => {
  // public/sw.js is plain JS and cannot import the TS module, so the
  // 'm6m-queue-sync' literal exists in both files by construction. This pins
  // the pair: rename it in one place and this fails before a device does.
  it('the worker fires the hook and the provider answers it — same tag, one retry path', () => {
    const sw = read('public/sw.js');
    const provider = read('app/m/offline-sync.tsx');

    expect(sw).toContain("addEventListener('sync'");
    expect(sw).toContain('m6m-queue-sync');
    expect(sw).toContain('postMessage');

    expect(provider).toContain('m6m-queue-sync');
    expect(provider).toContain("addEventListener('message'");
    // The hook triggers the existing sync(), not a parallel replay path: the
    // worker never touches the queue itself.
    expect(sw).not.toContain('indexedDB');
    expect(sw).not.toContain('supabase');
  });

  it('the worker registers from the MOBILE layout with scope /m — never the desktop tree', () => {
    const layout = read('app/m/layout.tsx');
    const register = read('app/m/register-sw.tsx');
    expect(layout).toContain('RegisterSw');
    expect(register).toContain("register('/sw.js', { scope: '/m' })");
    // ------------------------------------------------------------------
    // A-28 — NARROWED [S123, notifications ND-4]. Rewritten, not deleted.
    // ------------------------------------------------------------------
    // Superseded assertion, quoted rather than dropped:
    //
    //     for (const rel of walk('app/dashboard'))
    //       expect(read(rel)).not.toContain('sw.js');
    //
    // It asserted that NOTHING under app/dashboard/** mentions a service
    // worker. ND-4 ruled a SECOND, push-only worker registered at
    // scope '/dashboard', so the blanket form now fails on a correct build —
    // and the only way to "pass" it would be to abandon desktop push, which
    // would leave traces 3d–3h (all addressed to Owner/Admin, the desktop
    // roles) delivering to nobody.
    //
    // WHAT THE CRITERION WAS ACTUALLY PROTECTING, and what is preserved: the
    // MOBILE worker — the one with the fetch handler and the static cache —
    // must never control /dashboard. That worker's caching policy exists
    // because of a real S121 hydration failure on a real handset, and putting
    // the desktop app behind it would inherit that whole class of failure to
    // gain nothing.
    //
    // So the narrowed rule is: the desktop tree may not REGISTER '/sw.js',
    // and the worker it does register must have no fetch handler at all.
    const walk = (dir: string): string[] =>
      readdirSync(join(WEB_ROOT, dir)).flatMap((name) => {
        const rel = join(dir, name);
        return statSync(join(WEB_ROOT, rel)).isDirectory()
          ? walk(rel)
          : /\.(ts|tsx)$/.test(name)
            ? [rel]
            : [];
      });
    for (const rel of walk('app/dashboard')) {
      expect(read(rel), `${rel} registers the MOBILE worker`).not.toContain("register('/sw.js'");
      expect(read(rel), `${rel} registers the mobile worker at root scope`).not.toContain(
        "scope: '/'"
      );
    }

    // The exception is only safe because of this: no fetch handler, no cache,
    // so nothing the desktop worker does can ever serve a stale response.
    const desktopWorker = read('public/sw-dashboard.js');
    expect(desktopWorker).not.toContain("addEventListener('fetch'");
    expect(desktopWorker).not.toContain('caches.open');
  });
});
