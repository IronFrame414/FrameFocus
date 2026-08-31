/**
 * Card-at-signup — the flag and its guard, live against rebuild-test [§S3/§S8].
 *
 * Two properties the gate depends on:
 *   1. GRANDFATHER — every EXISTING company is payment_method_on_file=true, so
 *      the middleware gate never catches the Sabal Point fixture or a live-suite
 *      owner. (20261090000000 backfilled all existing companies.)
 *   2. THE GUARD — a user session may NOT set the flag (or an owner could
 *      PostgREST it true and skip the card). Only the service role may.
 *
 * RUN: cd apps/web && npx vitest run --config test/live.vitest.config.ts card-signup-flag
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { admin, assertRebuildTest, sessionFor } from './live-session';

const OWNER = 'josh+test50@worthprop.com';

let owner: SupabaseClient;
let companyId: string;
let origFlag: boolean;

beforeAll(async () => {
  assertRebuildTest();
  owner = await sessionFor(OWNER);
  const { data } = await admin
    .from('profiles')
    .select('company_id')
    .eq('email', OWNER)
    .eq('role', 'owner')
    .single();
  companyId = (data as { company_id: string }).company_id;
  const { data: c } = await admin
    .from('companies')
    .select('payment_method_on_file')
    .eq('id', companyId)
    .single();
  origFlag = (c as { payment_method_on_file: boolean }).payment_method_on_file;
});

afterAll(async () => {
  // Restore, whatever happened, via the service role (which the guard permits).
  await admin.from('companies').update({ payment_method_on_file: origFlag }).eq('id', companyId);
});

describe('grandfather', () => {
  it('the seeded owner company is payment_method_on_file=true (never caught by the gate)', () => {
    expect(origFlag).toBe(true);
  });
});

describe('⚠️ the flag is service-only — a user cannot self-set it', () => {
  it('an owner setting their own payment_method_on_file RAISES and nothing moves', async () => {
    const { error } = await owner
      .from('companies')
      .update({ payment_method_on_file: false })
      .eq('id', companyId)
      .select();
    expect(error, 'an owner must not be able to flip the gate flag').not.toBeNull();

    const { data } = await admin
      .from('companies')
      .select('payment_method_on_file')
      .eq('id', companyId)
      .single();
    expect((data as { payment_method_on_file: boolean }).payment_method_on_file).toBe(true);
  });

  it('an owner editing a NON-flag column (name) still succeeds — the guard does not over-block', async () => {
    const { data: before } = await admin.from('companies').select('name').eq('id', companyId).single();
    const name = (before as { name: string }).name;
    const { error } = await owner
      .from('companies')
      .update({ name })
      .eq('id', companyId)
      .select();
    expect(error, error?.message).toBeNull();
  });

  it('the SERVICE role may set the flag (the webhook / success-handler path)', async () => {
    const { error } = await admin
      .from('companies')
      .update({ payment_method_on_file: true })
      .eq('id', companyId);
    expect(error, error?.message).toBeNull();
  });
});
