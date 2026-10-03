import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// ============================================================================
// S127 P-5 — audit finding 16a. Dashboard and portal PAGES ask the Auth server
// through the layout's shared, per-request `getRequestUser()` (React `cache`,
// `lib/supabase-server.ts`), never with their own `supabase.auth.getUser()`.
//
// ⚠️ NO SECURITY CHANGE: the question is still the Auth server's
// `auth.getUser()` — asked once per request instead of twice, and the page's
// own queries no longer wait behind a second round trip. 16b (a local token
// check instead) is DEFERRED by ruling and is not this.
//
// Measured at S125: 79 pages made the duplicate call. This pins it at 0, so a
// new page copied from an old one goes red here instead of quietly adding the
// round trip back.
// ============================================================================

const APP = fileURLToPath(new URL('../app/', import.meta.url));

function pages(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...pages(p));
    else if (name === 'page.tsx') out.push(p);
  }
  return out;
}

describe('S127 P-5 — no dashboard or portal page makes its own Auth-server call', () => {
  const all = [...pages(join(APP, 'dashboard')), ...pages(join(APP, 'portal'))];

  it('there are pages to check (a scan of nothing proves nothing)', () => {
    expect(all.length).toBeGreaterThanOrEqual(98); // 98 at S127
  });

  it('0 pages call supabase.auth.getUser() directly', () => {
    const offenders = all.filter((p) =>
      readFileSync(p, 'utf8').includes('supabase.auth.getUser()')
    );
    expect(offenders.map((p) => p.slice(APP.length))).toEqual([]);
  });

  it('the pages that read the user use getRequestUser()', () => {
    const users = all.filter((p) => readFileSync(p, 'utf8').includes('await getRequestUser()'));
    expect(users.length).toBeGreaterThanOrEqual(79);
  });
});
