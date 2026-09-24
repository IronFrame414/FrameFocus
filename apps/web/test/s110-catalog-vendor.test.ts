import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// S110 E2 [RULED Josh, Q9 → A] — one row, one destination: the item name is
// plain text; the vendor page is its own "Vendor ↗" link.
const src = readFileSync(fileURLToPath(new URL('../app/dashboard/catalog/catalog-list.tsx', import.meta.url)), 'utf8');

describe('S110 E2 — the catalog vendor link is its own control', () => {
  it('the name is NOT wrapped in the vendor link any more', () => {
    // _Superseded shape, quoted:_ `<a href={item.product_url} …>{item.name}</a>`.
    expect(src).not.toMatch(/<a\s[^>]*href=\{item\.product_url\}[^>]*>\s*\{item\.name\}\s*<\/a>/);
    expect(src).toMatch(/<span data-testid=\{`catalog-name-\$\{item\.id\}`\}>\{item\.name\}<\/span>/);
  });
  it('"Vendor ↗" is a separate link, opened in a new tab, labelled for a screen reader', () => {
    const at = src.indexOf('data-testid={`catalog-vendor-${item.id}`}');
    expect(at).toBeGreaterThan(0);
    const tag = src.slice(src.lastIndexOf('<a', at), src.indexOf('</a>', at));
    expect(tag).toContain('href={item.product_url}');
    expect(tag).toContain('target="_blank"');
    expect(tag).toContain('rel="noopener noreferrer"');
    expect(tag).toContain('aria-label=');
    expect(tag).toContain('Vendor ↗');
  });
  it('the row still opens Edit for a manager (S109 163.B unchanged)', () => {
    expect(src).toMatch(/rowActivation\(\(\) => router\.push\(`\/dashboard\/catalog\/\$\{item\.id\}\/edit`\)/);
  });
});
