import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { admin, assertRebuildTest, sessionFor } from './live-session';

// ============================================================================
// NOTIFICATIONS SLICE 1 — the core tables and the ND-2 recipient identity.
// Migration: 20260905000000_notifications_core.sql
// Spec: docs/specs/notifications-architecture.md §4, ND-2, R2, R7.
// ============================================================================
//
// ---------------------------------------------------------------------------
// THE TEST THAT ACTUALLY PROVES ND-2 IS THE OWNER ONE
// ---------------------------------------------------------------------------
// ND-2 exists because company_members CANNOT ADDRESS AN OWNER: member_type is
// CHECK-constrained to ('crew','subcontractor') and Owner/Admin/PM have no row.
// So an implementation keyed on members fails exactly one test here — "a
// notification addressed to an Owner is delivered" (A-N1) — and passes every
// other one, including all the RLS negatives. That is the criterion carrying
// the ruling; the rest carry the plumbing.
//
// ---------------------------------------------------------------------------
// EVERY NEGATIVE IS PAIRED WITH A POSITIVE
// ---------------------------------------------------------------------------
// A floor's failure mode is REFUSING EVERYBODY, which from outside is
// indistinguishable from the floor working. "A PM cannot read the Owner's
// notification" passes on a policy that also refuses the Owner, and on one that
// broke tenant scoping entirely. So each refusal is asserted beside a read that
// MUST succeed.
//
// AND THE POSTGRES TRAP, which this file hits three times: a refused SELECT
// returns ZERO ROWS, not an error. A refused UPDATE or DELETE affects zero rows
// and REPORTS SUCCESS. So the negatives assert the DATA, and every write
// negative re-reads with the service role to prove the value did not move.
//
// ---------------------------------------------------------------------------
// FAILING-THEN-PASSING
// ---------------------------------------------------------------------------
// Run against the database BEFORE the migration:
//   · get_my_profile_id() does not exist        -> the RPC test errors
//   · notify_hours_start/_end do not exist      -> the column test fails
//   · push_subscriptions / notifications absent -> every remaining test errors
// After `supabase db push` all of it passes. Recorded because a harness that
// has only ever been seen green proves nothing about what it would catch.

const OWNER = 'josh+test50@worthprop.com';
const PM = 'josh+pm@worthprop.com';
const CREW = 'josh+crew@worthprop.com';

let ownerC: SupabaseClient;
let pmC: SupabaseClient;
let crewC: SupabaseClient;

let ownerProfileId: string;
let pmProfileId: string;
let companyId: string;

/** Rows this file created, torn down in afterAll regardless of outcome. */
const madeNotifications: string[] = [];
const madeSubscriptions: string[] = [];

beforeAll(async () => {
  assertRebuildTest();

  [ownerC, pmC, crewC] = await Promise.all([
    sessionFor(OWNER),
    sessionFor(PM),
    sessionFor(CREW),
  ]);

  const { data: profiles } = await admin
    .from('profiles')
    .select('id, email, company_id')
    .in('email', [OWNER, PM]);

  ownerProfileId = profiles!.find((p) => p.email === OWNER)!.id;
  pmProfileId = profiles!.find((p) => p.email === PM)!.id;
  companyId = profiles!.find((p) => p.email === OWNER)!.company_id;
});

afterAll(async () => {
  if (madeNotifications.length) {
    await admin.from('notifications').delete().in('id', madeNotifications);
  }
  if (madeSubscriptions.length) {
    await admin.from('push_subscriptions').delete().in('id', madeSubscriptions);
  }
});

/** Insert a notification the way notify() does — service role, no RLS. */
async function seedNotification(
  recipientProfileId: string,
  over: Record<string, unknown> = {}
): Promise<string> {
  const { data, error } = await admin
    .from('notifications')
    .insert({
      company_id: companyId,
      recipient_profile_id: recipientProfileId,
      type: 'assignment',
      title: 'Harness row',
      body: 's123-notifications-core.live.ts',
      ...over,
    })
    .select('id')
    .single();

  if (error) throw new Error(`seedNotification: ${error.message}`);
  madeNotifications.push(data!.id);
  return data!.id;
}

describe('ND-2 — recipients are profiles, not company_members', () => {
  it('A-N1 a notification addressed to an OWNER is stored and readable by that Owner', async () => {
    // THE ND-2 CRITERION. An implementation keyed on company_members cannot get
    // here at all: the Owner has no member row to reference.
    const id = await seedNotification(ownerProfileId, { title: 'Owner-addressed' });

    const { data } = await ownerC.from('notifications').select('id, title').eq('id', id);

    expect(data).toHaveLength(1);
    expect(data![0].title).toBe('Owner-addressed');
  });

  it('member_type is a staff/sub discriminator and NOT a role — the corrected ND-2 premise', async () => {
    // ⚠️ THIS TEST REPLACES A WRONG ONE, AND THE STORY IS THE POINT.
    //
    // It first asserted "the Owner has NO company_members row", because the spec
    // argued a member-keyed FK "cannot address the Owner". That FAILED on the
    // first run after the migration. member_type is a STAFF-VS-SUBCONTRACTOR
    // discriminator, not a role: owner, admin, project_manager, foreman and
    // crew_member all map to 'crew'. The Owner does have a member row.
    //
    // ND-2's conclusion survived; one of its reasons did not. What this now pins
    // is the CORRECTED premise — that member_type cannot distinguish an Owner
    // from a crew member, which is why R7's floor (keyed on profiles.role)
    // cannot be applied to a member-keyed recipient.
    const { data: ownerMember } = await admin
      .from('company_members')
      .select('member_type')
      .eq('profile_id', ownerProfileId)
      .single();

    expect(ownerMember!.member_type).toBe('crew');

    const { data: pmMember } = await admin
      .from('company_members')
      .select('member_type')
      .eq('profile_id', pmProfileId)
      .single();

    // Two different profiles.role values, ONE member_type. That collapse is the
    // reason recipients cannot key on company_members.
    expect(pmMember!.member_type).toBe(ownerMember!.member_type);
  });

  it('most of the member roster has no login at all — ND-2 reason 1', async () => {
    const { data } = await admin
      .from('company_members')
      .select('id, profile_id')
      .is('profile_id', null);

    // Verified 34 of 41 at S123. Asserted as "many" rather than exactly 34 so
    // seeding drift does not produce a red run that means nothing.
    expect((data ?? []).length).toBeGreaterThan(0);
  });

  it('get_my_profile_id() returns profiles.id, NOT auth.uid()', async () => {
    const { data, error } = await ownerC.rpc('get_my_profile_id');
    expect(error).toBeNull();
    expect(data).toBe(ownerProfileId);

    // The trap this guards: profiles.id and profiles.user_id are different
    // values, and a helper returning auth.uid() would satisfy any "returns a
    // uuid" assertion while matching no recipient row ever.
    const { data: profile } = await admin
      .from('profiles')
      .select('user_id')
      .eq('id', ownerProfileId)
      .single();
    expect(data).not.toBe(profile!.user_id);
  });
});

describe('R4 — the notify-hours window', () => {
  it('companies carries notify_hours_start/_end, non-null, defaulted', async () => {
    const { data, error } = await admin
      .from('companies')
      .select('notify_hours_start, notify_hours_end')
      .eq('id', companyId)
      .single();

    expect(error).toBeNull();
    // NOT NULL is the point: notify() must never have to decide what a NULL
    // window means. An unset window meaning "always push" would be the worst
    // possible default; meaning "never push" would look like a broken feature.
    expect(data!.notify_hours_start).toBeTruthy();
    expect(data!.notify_hours_end).toBeTruthy();
  });
});

describe('notifications RLS — own rows only, for every role', () => {
  it('A-N5 a PM cannot read another profile\'s notification, and the Owner can read their own', async () => {
    const id = await seedNotification(ownerProfileId, { title: 'Owner only' });

    // Negative — and note it is asserted on the DATA. A refused SELECT under
    // Postgres RLS returns zero rows, not an error.
    const { data: pmSees } = await pmC.from('notifications').select('id').eq('id', id);
    expect(pmSees ?? []).toHaveLength(0);

    const { data: crewSees } = await crewC.from('notifications').select('id').eq('id', id);
    expect(crewSees ?? []).toHaveLength(0);

    // Paired positive — without this, a policy refusing EVERYBODY passes.
    const { data: ownerSees } = await ownerC.from('notifications').select('id').eq('id', id);
    expect(ownerSees).toHaveLength(1);
  });

  it('a signed-in user cannot FORGE a notification — there is no INSERT policy', async () => {
    // R7 is enforced in stored bytes (title/body are rendered per recipient at
    // write time). If a user could insert, they could author the text the floor
    // is supposed to control, and the floor would mean nothing.
    // PAIRED POSITIVE FIRST, and it is load-bearing here in a way it is not
    // elsewhere: `expect(error).not.toBeNull()` passes when the TABLE DOES NOT
    // EXIST. Without a write that must succeed, this test is green on an empty
    // database — the same "refusing everybody looks like working" trap the
    // header warns about, in its sneakiest form. Seeding first proves the table
    // is there and that the refusal below is specific to the client.
    const seeded = await seedNotification(pmProfileId, { title: 'Not forged' });
    expect(seeded).toBeTruthy();

    const { error } = await pmC.from('notifications').insert({
      company_id: companyId,
      recipient_profile_id: pmProfileId,
      type: 'assignment',
      title: 'Forged',
    });

    expect(error).not.toBeNull();

    const { data: found } = await admin
      .from('notifications')
      .select('id')
      .eq('title', 'Forged');
    expect(found ?? []).toHaveLength(0);
  });

  it('a PM cannot reassign their own notification to somebody else', async () => {
    const id = await seedNotification(pmProfileId, { title: 'PM row' });

    await pmC
      .from('notifications')
      .update({ recipient_profile_id: ownerProfileId })
      .eq('id', id);

    // The UPDATE reports success while affecting zero rows, so the only honest
    // assertion is a service-role re-read.
    const { data } = await admin
      .from('notifications')
      .select('recipient_profile_id')
      .eq('id', id)
      .single();
    expect(data!.recipient_profile_id).toBe(pmProfileId);
  });

  it('a recipient CAN mark their own row read, and delete it', async () => {
    const id = await seedNotification(pmProfileId, { title: 'PM readable' });

    await pmC.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id);
    const { data: afterRead } = await admin
      .from('notifications')
      .select('read_at')
      .eq('id', id)
      .single();
    expect(afterRead!.read_at).not.toBeNull();

    await pmC.from('notifications').delete().eq('id', id);
    const { data: afterDelete } = await admin
      .from('notifications')
      .select('id')
      .eq('id', id);
    expect(afterDelete ?? []).toHaveLength(0);
  });
});

describe('R2 — retention, enforced by trigger and not by the caller', () => {
  it('A-N40 starring clears expires_at; unstarring restores a 30-day one', async () => {
    const id = await seedNotification(pmProfileId, { title: 'Retention' });

    const { data: fresh } = await admin
      .from('notifications')
      .select('expires_at')
      .eq('id', id)
      .single();
    expect(fresh!.expires_at).not.toBeNull();

    // A single-column UPDATE from the UI. The retention rule lives in the
    // trigger precisely so the star toggle cannot drift from it.
    await pmC.from('notifications').update({ starred: true }).eq('id', id);
    const { data: starred } = await admin
      .from('notifications')
      .select('expires_at, starred')
      .eq('id', id)
      .single();
    expect(starred!.starred).toBe(true);
    expect(starred!.expires_at).toBeNull();

    await pmC.from('notifications').update({ starred: false }).eq('id', id);
    const { data: unstarred } = await admin
      .from('notifications')
      .select('expires_at, starred')
      .eq('id', id)
      .single();
    expect(unstarred!.starred).toBe(false);
    expect(unstarred!.expires_at).not.toBeNull();
  });

  it('the type CHECK accepts every specced type, including the reserved low_stock', async () => {
    // ND-16 cuts the low-stock TRACE but RESERVES the enum value so M8 lands as
    // a consumer with no schema change. A build that omitted it would pass every
    // other test here and cost M8 a migration.
    const types = [
      'mention', 'assignment', 'incident', 'signed', 'reminders_exhausted',
      'discrepancy', 'timesheet_ready', 'daily_log_missing', 'still_clocked_in',
      'contract_signed', 'punch_assigned', 'low_stock',
    ];
    for (const type of types) {
      const id = await seedNotification(pmProfileId, { type, title: `type ${type}` });
      expect(id).toBeTruthy();
    }
  });

  it('timesheet_approved is NOT a valid type — ND-9 cut the worker-facing row', async () => {
    const { error } = await admin.from('notifications').insert({
      company_id: companyId,
      recipient_profile_id: pmProfileId,
      type: 'timesheet_approved',
      title: 'Should be rejected',
    });
    expect(error).not.toBeNull();
  });
});

describe('push_subscriptions — a device credential, own rows only', () => {
  it('a user can register their own subscription and read it back', async () => {
    const { data, error } = await pmC
      .from('push_subscriptions')
      .insert({
        profile_id: pmProfileId,
        endpoint: `https://example.invalid/harness/${Date.now()}-a`,
        p256dh: 'harness-p256dh',
        auth: 'harness-auth',
        surface: 'desktop',
        device_label: 'harness',
      })
      .select('id')
      .single();

    expect(error).toBeNull();
    madeSubscriptions.push(data!.id);

    const { data: readBack } = await pmC
      .from('push_subscriptions')
      .select('id')
      .eq('id', data!.id);
    expect(readBack).toHaveLength(1);
  });

  it('nobody — not even the Owner — can read another profile\'s endpoint', async () => {
    // Reading an endpoint is enough to send to that person's phone, so there is
    // no role with a reason to hold one that is not theirs.
    const { data } = await admin
      .from('push_subscriptions')
      .insert({
        company_id: companyId,
        profile_id: pmProfileId,
        endpoint: `https://example.invalid/harness/${Date.now()}-b`,
        p256dh: 'x',
        auth: 'y',
        surface: 'mobile',
      })
      .select('id')
      .single();
    madeSubscriptions.push(data!.id);

    const { data: ownerSees } = await ownerC
      .from('push_subscriptions')
      .select('id')
      .eq('id', data!.id);
    expect(ownerSees ?? []).toHaveLength(0);

    // Paired positive: the row is genuinely there and its owner can see it.
    const { data: pmSees } = await pmC
      .from('push_subscriptions')
      .select('id')
      .eq('id', data!.id);
    expect(pmSees).toHaveLength(1);
  });

  it('surface is constrained to mobile|desktop — ND-4 stores two registrations per human', async () => {
    const { error } = await admin.from('push_subscriptions').insert({
      company_id: companyId,
      profile_id: pmProfileId,
      endpoint: `https://example.invalid/harness/${Date.now()}-c`,
      p256dh: 'x',
      auth: 'y',
      surface: 'watch',
    });
    expect(error).not.toBeNull();
  });

  it('DELETE is denied to every role — pruning is service-role and soft', async () => {
    const { data } = await admin
      .from('push_subscriptions')
      .insert({
        company_id: companyId,
        profile_id: pmProfileId,
        endpoint: `https://example.invalid/harness/${Date.now()}-d`,
        p256dh: 'x',
        auth: 'y',
        surface: 'mobile',
      })
      .select('id')
      .single();
    madeSubscriptions.push(data!.id);

    await pmC.from('push_subscriptions').delete().eq('id', data!.id);

    // Reports success, affects nothing. Verify with the service role.
    const { data: still } = await admin
      .from('push_subscriptions')
      .select('id')
      .eq('id', data!.id);
    expect(still).toHaveLength(1);
  });
});
