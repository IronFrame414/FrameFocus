import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { admin, assertRebuildTest, sessionFor } from './live-session';
import type { SupabaseClient } from '@supabase/supabase-js';

// ============================================================================
// S136 — the sender local part loses its hex suffix.
//
// Migration: 20260917000000_company_slug_no_hex.sql
// ============================================================================
//
// Mail sent from `worth-properties-768f378f@ezcontractorbinder.com`. Ruled:
// bare name, numeric suffix only on collision.
//
// The rules are SQL, so they are asserted where they live rather than mirrored
// in TypeScript — a second copy of a slug rule is the divergence CLAUDE.md's
// PARITY section describes.
//
// ⚠️ This is COSMETIC with respect to the current Gmail delivery failure. Mail
// is being accepted and discarded; a cleaner local part is more credible to a
// filter and is not the fix.

const OWNER = 'josh+test50@worthprop.com';
const madeCompanyIds: string[] = [];

async function slugFor(name: string, excludeId?: string): Promise<string> {
  const { data, error } = await admin.rpc('generate_company_slug', {
    p_company_name: name,
    ...(excludeId ? { p_exclude_company_id: excludeId } : {}),
  });
  if (error) throw new Error(`generate_company_slug(${name}): ${error.message}`);
  return data as string;
}

beforeAll(() => assertRebuildTest());

afterAll(async () => {
  for (const id of madeCompanyIds) await admin.from('companies').delete().eq('id', id);
});

describe('the ruling: a bare local part', () => {
  it('⚠️ no hex suffix — this is the whole point', async () => {
    const slug = await slugFor('Worth Properties');
    expect(slug).toBe('worth-properties');
    // Stated as the absence it is: the old shape was name + '-' + 8 hex chars.
    expect(slug).not.toMatch(/-[0-9a-f]{8}$/);
  });

  it('normalises punctuation and case the way the old inline code did', async () => {
    expect(await slugFor('  Bishop  &  Sons, LLC.  ')).toBe('bishop-sons-llc');
  });
});

describe('collisions resolve numerically, and only on collision', () => {
  it('⚠️ a taken name yields -2, and the counterfactual proves it was taken', async () => {
    // The fixture company `bishop-contracting` exists; assert that OUTSIDE the
    // function, or a passing -2 could just mean the rule always appends.
    const { data: existing } = await admin
      .from('companies')
      .select('id')
      .eq('slug', 'bishop-contracting')
      .maybeSingle();
    expect(existing, 'fixture slug absent — this test proves nothing').not.toBeNull();

    expect(await slugFor('Bishop Contracting')).toBe('bishop-contracting-2');
  });

  it('a free name is NOT suffixed — the negative half', async () => {
    // ⚠️ THE NAME MUST NOT END IN DIGITS. The first version of this test used
    // `S136 Probe ${Date.now()}`, which normalises to `s136-probe-1786…` — it
    // ends in `-<digits>` because of the TIMESTAMP, and the assertion failed
    // against correct behaviour. The test was wrong, not the function; the same
    // shape as `Ridgeline Builders (TEST CO 2)` documented in the migration.
    const unique = `S136 Probe ${Date.now()} Fresh`;
    const slug = await slugFor(unique);
    expect(slug).toMatch(/-fresh$/);
    expect(slug).not.toMatch(/-fresh-\d+$/);
  });

  it('walks past -2 to -3 when both are taken', async () => {
    const base = `s136-walk-${Date.now()}`;
    for (const s of [base, `${base}-2`]) {
      const { data } = await admin
        .from('companies')
        .insert({ name: s, slug: s })
        .select('id')
        .single();
      madeCompanyIds.push((data as { id: string }).id);
    }
    expect(await slugFor(base)).toBe(`${base}-3`);
  });
});

describe('the two edge cases the hex used to hide [Q4]', () => {
  it('a name with no alphanumerics becomes "company", not an empty local part', async () => {
    const slug = await slugFor('!!! ### ***');
    expect(slug === 'company' || /^company-\d+$/.test(slug)).toBe(true);
    expect(slug.length).toBeGreaterThan(0);
  });

  it('a long name is truncated to 48, well inside the 64-octet local-part cap', async () => {
    const slug = await slugFor('A'.repeat(120));
    expect(slug.length).toBeLessThanOrEqual(48);
    expect(slug).not.toMatch(/-$/); // no trailing hyphen from cutting mid-word
  });
});

describe('⚠️ idempotency — the property that makes the backfill safe to replay', () => {
  it('re-slugging an EXISTING company excludes itself and returns the same slug', async () => {
    // Without the exclusion, a company whose slug already equals its normalised
    // name collides with its OWN row and is bumped to -2 on every replay. This
    // migration was applied three times during S136; nothing drifted.
    const name = `S136 Idem ${Date.now()}`;
    const bare = await slugFor(name);
    const { data } = await admin
      .from('companies')
      .insert({ name, slug: bare })
      .select('id')
      .single();
    const id = (data as { id: string }).id;
    madeCompanyIds.push(id);

    expect(await slugFor(name, id), 'a replay would rename this company').toBe(bare);
    // ...and WITHOUT the exclusion it would indeed bump, which is the bug.
    expect(await slugFor(name)).toBe(`${bare}-2`);
  });
});

describe('the function is not a slug oracle for signed-in users', () => {
  it('an authenticated caller cannot execute it', async () => {
    const ownerC = (await sessionFor(OWNER)) as SupabaseClient;
    const { error } = await ownerC.rpc('generate_company_slug', {
      p_company_name: 'Worth Properties',
    });
    expect(error, 'any signed-in user can probe which sender addresses exist').not.toBeNull();
  });
});
