/**
 * S114 C-9 [RULED Josh 2026-09-28, Q12 A] — create_site_visit()'s NEW contact:
 * a first AND last name, OR a company name (20261990000000). Was: both names,
 * always, and no company stored.
 *
 * NEGATIVE FIRST: run before the migration → the company-only case is RED
 * (refused by the old check) and the message case is RED (old wording).
 *
 *   npx vitest run --config test/live.vitest.config.ts s114-create-site-visit-contact
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { admin, assertRebuildTest, sessionFor } from './live-session';

const OWNER = 'josh+test50@worthprop.com';
const MARKER = `S114CSV-${Date.now()}`;
let owner: SupabaseClient;

async function sweep() {
  const { data: ests } = await admin
    .from('estimates')
    .select('id, contact_id')
    .like('name', `${MARKER}%`);
  const rows = (ests ?? []) as { id: string; contact_id: string | null }[];
  if (rows.length) {
    await admin
      .from('site_visits')
      .delete()
      .in(
        'estimate_id',
        rows.map((r) => r.id)
      );
    await admin
      .from('estimates')
      .delete()
      .in(
        'id',
        rows.map((r) => r.id)
      );
  }
  await admin.from('contacts').delete().like('company_name', `${MARKER}%`);
  await admin.from('contacts').delete().like('first_name', `${MARKER}%`);
}

beforeAll(async () => {
  assertRebuildTest();
  await sweep();
  owner = await sessionFor(OWNER);
}, 60_000);

afterAll(async () => {
  await sweep();
}, 60_000);

const visit = (title: string, newContact: Record<string, string>) =>
  owner.rpc('create_site_visit', { p_title: `${MARKER} ${title}`, p_new_contact: newContact });

describe('S114 C-9 — create_site_visit(): name OR company', () => {
  it('CONTROL — first and last name, no company: accepted', async () => {
    const { data, error } = await visit('both names', {
      first_name: `${MARKER} Pat`,
      last_name: 'Homeowner',
    });
    expect(error, error?.message).toBeNull();
    expect(data).toBeTruthy();
  });

  it('a COMPANY alone: accepted, stored with blank names ("") and the company', async () => {
    const company = `${MARKER} Acme Plumbing`;
    const { data, error } = await visit('company only', {
      first_name: '',
      last_name: '',
      company_name: company,
    });
    expect(error, error?.message).toBeNull();
    const { data: est } = await admin
      .from('estimates')
      .select('contact_id')
      .eq('id', data as string)
      .single();
    const { data: c } = await admin
      .from('contacts')
      .select('first_name, last_name, company_name')
      .eq('id', (est as { contact_id: string }).contact_id)
      .single();
    expect(c).toEqual({ first_name: '', last_name: '', company_name: company });
  });

  it('neither names nor company: refused with the shared wording', async () => {
    const { error } = await visit('neither', {
      first_name: '  ',
      last_name: '',
      company_name: ' ',
    });
    expect(error?.code).toBe('22023');
    expect(error?.message).toBe('Enter a first and last name, or a company name.');
  });

  it('a FIRST name alone (no last, no company): refused', async () => {
    const { error } = await visit('first only', { first_name: `${MARKER} Solo`, last_name: '' });
    expect(error?.code).toBe('22023');
  });
});
