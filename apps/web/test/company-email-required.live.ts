/**
 * COMPANY EMAIL IS REQUIRED — RULED [Josh, 2026-09-24], migration 20261760000000.
 *
 * THE INCIDENT. A live client replied to an emailed proposal and the reply
 * reached the PLATFORM's inbox, because the sending company's `companies.email`
 * was NULL: `resolveCompanyReplyTo` found no company address, and the
 * From-line catch-all took the reply. Nothing required the column — the signup
 * trigger never wrote it and Company Settings invited the user to leave it
 * blank.
 *
 * WHAT THIS FILE PINS (the refusals themselves live in s97ct-reply-to.live.ts
 * cases 2 and 4, per ruling Q6):
 *   1. The constraint is in the catalogue, VALIDATED, and checks "non-blank"
 *      only — no format check (ruling Q2).
 *   2. A real signup through `handle_new_user` gives the new company the
 *      signup address (ruling Q1 a). Without this the constraint would make
 *      every signup FAIL, so this is the case that proves ruling 1 did not
 *      break ruling "anyone can sign up".
 *
 * ⚠️ WHY THE CATALOGUE AND NOT A ROW COUNT. "No company has a blank email" read
 * from rows describes the data on the day it ran, not the rule — CLAUDE.md's
 * S157 trap. `convalidated = true` is the schema's own statement that every row
 * was checked and every future write will be.
 *
 * Catalogue reads go through the Management API query endpoint, the same one
 * `scripts/live-sql.mjs` and `s108-schema-drift.live.ts` use. READ ONLY here:
 * `catalogue()` refuses anything that is not a SELECT, and re-checks the ref.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  admin,
  assertRebuildTest,
  deleteCompanies,
  REQUIRED_PROJECT_REF,
  TEST_PASSWORD,
} from './live-session';

const MARKER = 'COEMAILREQ';
/** qa-noreply. has no MX — nothing can reach a person even if mail were sent. */
const SIGNUP_EMAIL = `${MARKER.toLowerCase()}-owner@qa-noreply.ezcontractorbinder.com`;

async function catalogue<T>(sql: string): Promise<T[]> {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  const ref = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').match(
    /https:\/\/([a-z0-9]+)\.supabase\.co/
  )?.[1];
  if (!token) throw new Error('SUPABASE_ACCESS_TOKEN is not set; cannot read the catalogue.');
  if (ref !== REQUIRED_PROJECT_REF) {
    throw new Error(`REFUSING: project is ${ref}, not ${REQUIRED_PROJECT_REF}.`);
  }
  if (!/^\s*select\s/i.test(sql)) throw new Error(`REFUSING: catalogue() is read-only. Got: ${sql}`);
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  if (!res.ok) throw new Error(`catalogue read failed ${res.status}: ${await res.text()}`);
  return (await res.json()) as T[];
}

/**
 * Remove the signup fixture: company (and its children) by name, then the auth
 * user LAST — `profiles.user_id` cascades from auth.users, and removing the
 * user first would pull the profile out from under deleteCompanies.
 * Called from both ends so a crashed run cannot poison the next.
 */
async function purge(): Promise<void> {
  const { data: stale } = await admin.from('companies').select('id').like('name', `${MARKER}%`);
  const ids = (stale ?? []).map((c) => (c as { id: string }).id);
  if (ids.length) await deleteCompanies(admin, ids);

  const { data: users } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  for (const u of users?.users ?? []) {
    if (u.email?.toLowerCase() === SIGNUP_EMAIL) await admin.auth.admin.deleteUser(u.id);
  }
  // trial_emails survives company deletion by design; this fixture's row is
  // noise, and three of them would push the next signup onto `incomplete`.
  await admin.from('trial_emails').delete().eq('email', SIGNUP_EMAIL);
}

beforeAll(async () => {
  assertRebuildTest();
  await purge();
}, 180_000);

afterAll(async () => {
  await purge();
  const { count } = await admin
    .from('companies')
    .select('id', { count: 'exact', head: true })
    .like('name', `${MARKER}%`);
  expect(count, `${MARKER} companies left behind — cleanup did not work`).toBe(0);
}, 180_000);

describe('companies.email is REQUIRED — the schema says so', () => {
  it('1 — companies_email_required_check exists, is VALIDATED, and checks non-blank only', async () => {
    const rows = await catalogue<{ convalidated: boolean; def: string }>(
      `select c.convalidated, pg_get_constraintdef(c.oid) as def
         from pg_constraint c
        where c.conrelid = 'public.companies'::regclass
          and c.conname = 'companies_email_required_check'`
    );
    expect(rows, 'the constraint is missing — a company can exist with no email again').toHaveLength(1);

    // NOT VALID was refused by ruling: Postgres re-checks such a CHECK on every
    // UPDATE of an old row, whatever column changed.
    expect(rows[0].convalidated, 'the constraint is NOT VALID — old rows were never checked').toBe(true);

    const def = rows[0].def.toLowerCase();
    expect(def).toContain('nullif(btrim(email)');
    expect(def).toContain('is not null');
    // Ruling Q2: the database checks "not blank", never the shape of an address.
    expect(def, 'a format check was added to the database').not.toMatch(/@|~|similar to|like/);
  });
});

describe('companies.email is REQUIRED — and signup still works', () => {
  it('2 — a real owner signup gives the new company the SIGNUP address', async () => {
    const { data: created, error } = await admin.auth.admin.createUser({
      email: SIGNUP_EMAIL,
      password: TEST_PASSWORD,
      email_confirm: true,
      user_metadata: { company_name: `${MARKER} Signup Co`, first_name: MARKER, last_name: 'Owner' },
    });
    // If handle_new_user still inserted (name, slug) only, the constraint would
    // refuse the company and GoTrue would report the trigger failure here.
    expect(error, `signup failed — handle_new_user no longer satisfies the constraint`).toBeNull();

    const { data: prof } = await admin
      .from('profiles')
      .select('company_id, role')
      .eq('user_id', created!.user!.id)
      .single();
    expect((prof as { role: string }).role).toBe('owner');

    const { data: co } = await admin
      .from('companies')
      .select('email')
      .eq('id', (prof as { company_id: string }).company_id)
      .single();
    expect((co as { email: string | null }).email).toBe(SIGNUP_EMAIL);
  });
});
