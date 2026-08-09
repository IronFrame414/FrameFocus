import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import { admin, assertRebuildTest } from './live-session';
import { notifyDeliveryDiscrepancy } from '@/lib/notify/delivery-notify';

// ============================================================================
// COVERAGE PASS — §3g's notification, driven live. No migration.
// ============================================================================
//
// The check-in ROUTE still cannot be driven from a harness: it emails every
// Owner, Admin and assigned PM through Resend on the way past, and unlike the
// reminders cron its sender is not injected (see the coverage note at the
// bottom). What CAN now be driven is the notification itself, which is the part
// slice 6 had only source assertions for — that the call was present, guarded
// and ordered. Nothing checked what it actually wrote, or to whom.

const OWNER = 'josh+test50@worthprop.com';
const ADMIN_EMAIL = 'josh+qa-admin@worthprop.com';
const PM = 'josh+pm@worthprop.com';
const FOREMAN = 'josh+qa-foreman@worthprop.com';

const TAG = 's123-delivery-disc';

let companyId: string;
let projectId: string;
let ownerProfileId: string;
let adminProfileId: string;
let pmProfileId: string;
let foremanProfileId: string;

const madeNotifications: string[] = [];
const runStart = new Date().toISOString();
const madeAssignments: string[] = [];

async function rowsFor(deliveryId: string) {
  const { data } = await admin
    .from('notifications')
    .select('id, recipient_profile_id, type, title, body, link_key, link_params, project_id')
    .eq('source_id', deliveryId);
  for (const r of data ?? []) if (!madeNotifications.includes(r.id)) madeNotifications.push(r.id);
  return data ?? [];
}

const base = () => ({
  companyId,
  projectId,
  projectName: 'Alvarez',
  deliveryId: crypto.randomUUID(),
  vendorName: 'Acme Glass',
  receiverName: 'Casey',
  deliveryDate: '2026-08-09',
});

beforeAll(async () => {
  assertRebuildTest();

  const { data: profiles } = await admin
    .from('profiles')
    .select('id, email, company_id')
    .in('email', [OWNER, ADMIN_EMAIL, PM, FOREMAN]);
  ownerProfileId = profiles!.find((p) => p.email === OWNER)!.id;
  adminProfileId = profiles!.find((p) => p.email === ADMIN_EMAIL)!.id;
  pmProfileId = profiles!.find((p) => p.email === PM)!.id;
  foremanProfileId = profiles!.find((p) => p.email === FOREMAN)!.id;
  companyId = profiles!.find((p) => p.email === OWNER)!.company_id;

  const { data: project } = await admin
    .from('projects')
    .select('id')
    .eq('company_id', companyId)
    .eq('is_deleted', false)
    .limit(1)
    .single();
  projectId = project!.id;

  // The PM must be ASSIGNED, or "project PMs are notified" is asserted against
  // an empty set and would pass on a build that never notifies a PM at all.
  const { data: pmMember } = await admin
    .from('company_members')
    .select('id')
    .eq('profile_id', pmProfileId)
    .single();
  const { data: existing } = await admin
    .from('project_assignments')
    .select('id')
    .eq('project_id', projectId)
    .eq('member_id', pmMember!.id)
    .eq('is_deleted', false)
    .maybeSingle();
  if (!existing) {
    const { data: created, error } = await admin
      .from('project_assignments')
      .insert({ company_id: companyId, project_id: projectId, member_id: pmMember!.id })
      .select('id')
      .single();
    if (error) throw new Error(`fixture assignment: ${error.message}`);
    madeAssignments.push(created!.id);
  }
});


/**
 * A run-window sweep, in ADDITION to the id list.
 *
 * The id list only contains rows a test managed to READ BACK before it
 * asserted. A test that fails mid-way — which is exactly what the
 * break-and-restore proofs do on purpose — aborts before registering the rows
 * it just caused, and those rows survive teardown. Twenty-four of them did.
 *
 * So teardown also deletes, by TYPE and by this run's start time, everything
 * these harnesses can possibly have written. Scoped to the types this file
 * produces so it can never touch anything else.
 */
afterAll(async () => {
  if (madeNotifications.length) {
    await admin.from('notifications').delete().in('id', madeNotifications);
  }
  await admin
    .from('notifications')
    .delete()
    .eq('type', 'discrepancy')
    .gte('created_at', runStart);
  if (madeAssignments.length) {
    await admin.from('project_assignments').delete().in('id', madeAssignments);
  }
});

describe('§3g — who is told, and what it says', () => {
  it('reaches Owner, Admin and the ASSIGNED PM — and not the foreman', async () => {
    const params = {
      ...base(),
      items: [
        { description: 'windows', qty_received: 20, qty_damaged: 3 },
        { description: 'trim', qty_received: 10, qty_damaged: 0 },
      ],
    };

    const outcome = await notifyDeliveryDiscrepancy(admin as SupabaseClient<Database>, params);

    // THE POSITIVE. `written` alone could be satisfied by one row to the wrong
    // person, so the recipients are named individually.
    expect(outcome.written).toBeGreaterThan(0);
    const rows = await rowsFor(params.deliveryId);
    const recipients = new Set(rows.map((r) => r.recipient_profile_id));
    expect(recipients.has(ownerProfileId)).toBe(true);
    expect(recipients.has(adminProfileId)).toBe(true);
    expect(recipients.has(pmProfileId)).toBe(true);
    // §3g's audience is managers + project PMs. A foreman is neither.
    expect(recipients.has(foremanProfileId)).toBe(false);

    // "3 of 20 windows damaged" — the §3g example, verbatim in shape.
    expect(rows[0].title).toBe('Delivery discrepancy (Alvarez): 3 of 20 windows damaged — Casey');
    expect(rows[0].body).toBe('Acme Glass, 2026-08-09.');
    expect(rows[0].type).toBe('discrepancy');
    expect(rows[0].link_key).toBe('delivery');
    expect(rows[0].link_params).toMatchObject({ id: params.deliveryId, projectId });
  });

  it('several damaged lines are counted, not named', async () => {
    // Naming one of three would be actively misleading about which line is at
    // fault, so the count carries it.
    const params = {
      ...base(),
      items: [
        { description: 'windows', qty_received: 20, qty_damaged: 3 },
        { description: 'doors', qty_received: 5, qty_damaged: 1 },
      ],
    };
    await notifyDeliveryDiscrepancy(admin as SupabaseClient<Database>, params);

    const rows = await rowsFor(params.deliveryId);
    expect(rows[0].title).toContain('4 of 25 items across 2 lines damaged');
    expect(rows[0].title).not.toContain('windows');
  });

  it('exceptions with NOTHING damaged do not claim "0 of N damaged"', async () => {
    // A delivery can be flagged by an issue_note alone. Saying "0 of 20 damaged"
    // would misdescribe it, and it is the branch a fixture with damage never
    // reaches.
    const params = {
      ...base(),
      items: [{ description: 'windows', qty_received: 20, qty_damaged: 0 }],
    };
    await notifyDeliveryDiscrepancy(admin as SupabaseClient<Database>, params);

    const rows = await rowsFor(params.deliveryId);
    expect(rows[0].title).toContain('issues noted on check-in');
    expect(rows[0].title).not.toContain('0 of');
  });
});

// ---------------------------------------------------------------------------
// STILL NOT COVERED HERE, ON PURPOSE
// ---------------------------------------------------------------------------
// The check-in ROUTE's own loop — auth, the RLS-scoped inserts, photo binding,
// the submit gate, the PDF, and the per-recipient email fan-out. Its sender is
// NOT injected the way the reminders cron's now is, so driving it would send.
// Injecting it is the same refactor, on a much larger route; the guard, the
// ordering and the recipient-helper choice remain source-asserted in
// s123-delivery-discrepancy.test.ts.
