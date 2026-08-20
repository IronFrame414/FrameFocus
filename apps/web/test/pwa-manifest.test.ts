import { describe, expect, it } from 'vitest';
import { existsSync } from 'fs';
import { join } from 'path';
import { crewManifest as manifest } from '@/lib/crew-manifest';
import { metadata } from '../app/layout';
import { brand } from '@/lib/brand';

// M6M §7.1 / §7.2 — the manifest and the icon links.
//
// WHAT THIS CAN AND CANNOT PROVE
// app/manifest.ts is a pure function; Next serialises its return value
// verbatim to /manifest.webmanifest. So calling it here IS the served
// document, not a stand-in — the only thing Next adds is the content-type.
// What no local test can reach: whether a real iPhone or Android accepts the
// install, how the maskable crop actually looks, or whether the splash reads
// well. Those need a handset. See the report.

const PUBLIC = join(__dirname, '..', 'public');
const m = manifest();

describe('§7.1 — brand values are INHERITED, never literals', () => {
  it('name and short_name come from the shared brand source', () => {
    expect(m.name).toBe(brand.name);
    expect(m.short_name).toBe(brand.shortName);
  });

  it('the colours come from the brand source', () => {
    expect(m.theme_color).toBe(brand.themeColor);
    expect(m.background_color).toBe(brand.backgroundColor);
  });

  // The regression §7.1 calls "the most visible possible": a stale product
  // name under the home-screen icon.
  it('no retired product name survives anywhere in the manifest', () => {
    expect(JSON.stringify(m)).not.toContain('FrameFocus');
  });

  // short_name is the home-screen label. iOS and Android truncate around 12
  // characters, and a truncated product name is worse than a short one.
  it('short_name is short enough not to be truncated on a home screen', () => {
    expect(m.short_name!.length).toBeLessThanOrEqual(12);
  });
});

describe('§7.1 — the two fields M6M owns outright', () => {
  it('start_url is the mobile shell, not the desktop dashboard', () => {
    expect(m.start_url).toBe('/m');
  });

  it('display is standalone — required for install and for iOS Web Push', () => {
    expect(m.display).toBe('standalone');
  });
});

describe('§7.2 — icons', () => {
  it('declares 192, 512 and a 512 maskable', () => {
    const sizes = m.icons!.map((i) => `${i.sizes}:${i.purpose}`);
    expect(sizes).toContain('192x192:any');
    expect(sizes).toContain('512x512:any');
    expect(sizes).toContain('512x512:maskable');
  });

  // The classic PWA error: pointing `purpose: maskable` at the standard icon.
  // Android then crops the rounded tile again and clips the artwork. The
  // maskable must be its own full-bleed file.
  it('the maskable icon is a DIFFERENT file from the standard 512', () => {
    const any512 = m.icons!.find((i) => i.sizes === '512x512' && i.purpose === 'any');
    const maskable = m.icons!.find((i) => i.purpose === 'maskable');
    expect(maskable!.src).not.toBe(any512!.src);
  });

  // A typo'd path type-checks perfectly and 404s at install time — the icon
  // silently falls back to a screenshot of the page. Only the filesystem knows.
  it('every icon the manifest references actually exists on disk', () => {
    for (const icon of m.icons!) {
      expect(existsSync(join(PUBLIC, icon.src as string)), `missing: ${icon.src}`).toBe(true);
    }
  });
});

describe('§7.2 — layout icon links and iOS install meta', () => {
  const flat = (v: unknown): Array<{ url: string }> =>
    (Array.isArray(v) ? v : [v]) as Array<{ url: string }>;

  it('every favicon and apple-touch-icon exists on disk', () => {
    const icons = metadata.icons as { icon: unknown; apple: unknown };
    for (const entry of [...flat(icons.icon), ...flat(icons.apple)]) {
      expect(existsSync(join(PUBLIC, entry.url)), `missing: ${entry.url}`).toBe(true);
    }
  });

  it('an apple-touch-icon is declared — iOS ignores the manifest icons', () => {
    expect(flat((metadata.icons as { apple: unknown }).apple).length).toBeGreaterThan(0);
  });

  it('iOS home-screen install is enabled, the precondition for Web Push', () => {
    expect((metadata.appleWebApp as { capable: boolean }).capable).toBe(true);
  });

  // black-translucent renders content UNDER the status bar and needs
  // safe-area-inset padding that the unbuilt mobile shell does not have yet.
  it('does not use black-translucent while the shell lacks safe-area handling', () => {
    expect((metadata.appleWebApp as { statusBarStyle: string }).statusBarStyle).not.toBe(
      'black-translucent'
    );
  });
});
