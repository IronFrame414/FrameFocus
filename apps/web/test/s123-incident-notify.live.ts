import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { admin, assertRebuildTest, sessionFor } from './live-session';
import {
  computeIncidentRecipients,
  notifyIncident,
} from '@/lib/services/incident-notify';
import type { IncidentDetail } from '@/lib/services/safety';

// ============================================================================
// NOTIFICATIONS SLICE 3 — incident-notify.ts as the first notify() consumer.
// Spec: docs/specs/notifications-architecture.md §3c, ND-5, ND-2, R7.
// No migration. Slice 1's 20260905000000 already carries 'incident' in the
// notifications type CHECK.
// ============================================================================
//
// ---------------------------------------------------------------------------
// WHAT THIS FILE IS ACTUALLY FOR
// ---------------------------------------------------------------------------
// §3c's recipient rule is "strictly above the submitter, company-wide, with the
// Owner→Admin floor". Three things about it can each break silently:
//
//   1. STRICTLY. A `>=` instead of `>` mails the submitter's own peers, which
//      looks right in every screenshot and is only visibly wrong to the peer.
//   2. COMPANY-WIDE. A project scope would silence the shop/yard injury that is
//      the whole reason `safety_incidents.project_id` is nullable.
//   3. THE FLOOR. An Owner outranks everyone, so `above` is empty and the naive
//      implementation notifies NOBODY. A silent incident is the worst output
//      this module has, and it is the one the happy path never exercises.
//
// Each gets a test, and each is paired with a positive — a recipient rule that
// returns nobody passes every "X must not be notified" assertion ever written.
//
// ---------------------------------------------------------------------------
// PUSH IS NOT ASSERTED HERE, DELIBERATELY
// ---------------------------------------------------------------------------
// These profiles have no push subscriptions, so sendPushToProfile() returns
// sent:0 whether or not the ND-5 override fired — the two cases are
// indistinguishable from outside and a test asserting either would be theatre.
// The override is a pure function and is proven where it can be:
// s123-notify-hours.test.ts (A-N8/A-N6). What THIS file pins is the input that
// makes the override apply — the stored row's `type` being exactly 'incident'.

const OWNER = 'josh+test50@worthprop.com';
const ADMIN = 'josh+qa-admin@worthprop.com';
const PM = 'josh+pm@worthprop.com';
const FOREMAN = 'josh+qa-foreman@worthprop.com';
const CREW = 'josh+crew@worthprop.com';
const OTHER_CO_OWNER = 'josh+qa-b-owner@worthprop.com';

type Profile = { id: string; email: string; role: string; company_id: string };

const profileByEmail = new Map<string, Profile>();
const id = (email: string) => profileByEmail.get(email)!.id;

let companyId: string;
let foremanC: SupabaseClient;

/** Every notification this file wrote, torn down regardless of outcome. */
const made: string[] = [];

/**
 * Collect the rows notify() just wrote for one incident, and register them for
 * teardown. Read with the SERVICE ROLE: the assertion is about what was STORED,
 * and reading through a user client would conflate a write failure with an RLS
 * refusal — the two failures the slice-1 harness keeps separate on purpose.
 */
async function rowsFor(sourceId: string) {
  const { data, error } = await admin
    .from('notifications')
    .select('id, recipient_profile_id, type, title, body, link_key, link_params, project_id, source_table, source_id, company_id')
    .eq('source_id', sourceId);
  if (error) throw new Error(`rowsFor: ${error.message}`);
  for (const row of data ?? []) if (!made.includes(row.id)) made.push(row.id);
  return data ?? [];
}

/**
 * A synthetic IncidentDetail. The row is NOT inserted into safety_incidents:
 * `notifications.source_id` carries no FK (verified against the migration), and
 * creating a real incident would require the RPC and a request-scoped client
 * this harness does not have. What is under test is the recipient rule and what
 * notify() stores — neither reads the incident back.
 */
function fakeIncident(over: Partial<IncidentDetail> = {}): IncidentDetail {
  return {
    id: crypto.randomUUID(),
    company_id: companyId,
    project_id: null,
    incident_type: 'injury',
    description: 'Harness incident — s123-incident-notify.live.ts',
    incident_date: '2026-08-09',
    project: null,
    reporter: { display_name: 'Casey' },
    injuries: [],
    witnesses: [],
    ...over,
  } as unknown as IncidentDetail;
}

beforeAll(async () => {
  assertRebuildTest();

  const { data } = await admin
    .from('profiles')
    .select('id, email, role, company_id')
    .in('email', [OWNER, ADMIN, PM, FOREMAN, CREW, OTHER_CO_OWNER])
    .eq('is_deleted', false);

  for (const p of (data ?? []) as Profile[]) profileByEmail.set(p.email, p);

  const missing = [OWNER, ADMIN, PM, FOREMAN, CREW, OTHER_CO_OWNER].filter(
    (e) => !profileByEmail.has(e)
  );
  if (missing.length) {
    throw new Error(
      `missing test identities: ${missing.join(', ')} — run node scripts/seed-test-identities.mjs`
    );
  }

  companyId = profileByEmail.get(OWNER)!.company_id;
  // The second company's owner must genuinely be elsewhere, or the tenant test
  // below proves nothing.
  expect(profileByEmail.get(OTHER_CO_OWNER)!.company_id).not.toBe(companyId);

  foremanC = await sessionFor(FOREMAN);
});

afterAll(async () => {
  if (made.length) await admin.from('notifications').delete().in('id', made);
});

describe('§3c — strictly above the submitter, company-wide', () => {
  it('a CREW-filed incident reaches Foreman, PM, Admin and Owner', async () => {
    const recipients = await computeIncidentRecipients(
      admin,
      companyId,
      'crew_member',
      profileByEmail.get(CREW)!.email,
      id(CREW)
    );

    expect(new Set(recipients.map((r) => r.role))).toEqual(
      new Set(['owner', 'admin', 'project_manager', 'foreman'])
    );
    // ND-2: the recipient identity is a profile id, and every one is populated.
    // A member-keyed implementation cannot produce the Owner's.
    expect(recipients.every((r) => Boolean(r.profileId))).toBe(true);
    expect(recipients.map((r) => r.profileId)).toContain(id(OWNER));
  });

  it('a PM-filed incident reaches Admin and Owner — and NOT the other PM-or-below', async () => {
    const recipients = await computeIncidentRecipients(
      admin,
      companyId,
      'project_manager',
      profileByEmail.get(PM)!.email,
      id(PM)
    );

    const roles = new Set(recipients.map((r) => r.role));
    expect(roles).toEqual(new Set(['owner', 'admin']));
    // STRICTLY above: a `>=` would put foreman-and-PM back in and still look
    // plausible. The negative is what distinguishes the two implementations.
    expect(roles.has('project_manager')).toBe(false);
    expect(roles.has('foreman')).toBe(false);
  });

  it('the submitter is never their own recipient', async () => {
    // Excluded by PROFILE ID since slice 3. The email compare it replaced failed
    // open whenever the caller had no email to pass.
    const recipients = await computeIncidentRecipients(
      admin,
      companyId,
      'admin',
      null, // no email available — the case that used to exclude nobody
      id(ADMIN)
    );
    expect(recipients.map((r) => r.profileId)).not.toContain(id(ADMIN));
    // Paired positive: the Owner is still there, so the exclusion removed one
    // person and not the set.
    expect(recipients.map((r) => r.profileId)).toContain(id(OWNER));
  });

  it('THE FLOOR — an OWNER-filed incident still reaches an Admin', async () => {
    // Nobody outranks an Owner, so `above` is empty and the naive rule notifies
    // NOBODY. This is the assertion that separates "the floor works" from "the
    // happy path works", and no other test in this file would fail without it.
    const recipients = await computeIncidentRecipients(
      admin,
      companyId,
      'owner',
      profileByEmail.get(OWNER)!.email,
      id(OWNER)
    );

    expect(recipients.length).toBeGreaterThan(0);
    expect(new Set(recipients.map((r) => r.role))).toEqual(new Set(['admin']));
    expect(recipients.map((r) => r.profileId)).toContain(id(ADMIN));
  });

  it('recipients never cross the company boundary', async () => {
    const recipients = await computeIncidentRecipients(
      admin,
      companyId,
      'crew_member',
      null,
      id(CREW)
    );
    expect(recipients.map((r) => r.profileId)).not.toContain(id(OTHER_CO_OWNER));
    expect(recipients.every((r) => r.profileId !== id(OTHER_CO_OWNER))).toBe(true);
  });

  it('a SHOP/YARD incident notifies the same people — the rule is assignment-independent', async () => {
    // The case a project scope would silence. computeIncidentRecipients takes no
    // project argument at all, which is the structural form of the guarantee;
    // this asserts the behaviour that structure is supposed to produce.
    const incident = fakeIncident({ project_id: null, project: null });
    const recipients = await computeIncidentRecipients(
      admin,
      companyId,
      'crew_member',
      null,
      id(CREW)
    );

    await notifyIncident({ admin, recipients, incident });
    const rows = await rowsFor(incident.id);

    expect(rows).toHaveLength(recipients.length);
    expect(new Set(rows.map((r) => r.recipient_profile_id))).toEqual(
      new Set(recipients.map((r) => r.profileId))
    );
  });
});

describe('what notify() stores for an incident', () => {
  it('writes one row per recipient, typed for the ND-5 override', async () => {
    const incident = fakeIncident({
      project_id: '6c395b31-cd45-4683-bb6a-cc4895488692',
      project: { name: 'kitchen test' },
      incident_type: 'injury',
      reporter: { display_name: 'Casey' },
    });
    const recipients = await computeIncidentRecipients(admin, companyId, 'crew_member', null, id(CREW));

    const outcome = await notifyIncident({ admin, recipients, incident });
    expect(outcome.written).toBe(recipients.length);
    expect(outcome.unreachable).toBe(0);

    const rows = await rowsFor(incident.id);
    for (const row of rows) {
      // 'incident' is what isOverrideType() tests. Store any other string and
      // the row is fine, the badge is fine, and the 2am injury never pushes.
      expect(row.type).toBe('incident');
      expect(row.source_table).toBe('safety_incidents');
      expect(row.source_id).toBe(incident.id);
      expect(row.company_id).toBe(companyId);
      expect(row.link_key).toBe('incident');
      expect(row.link_params).toMatchObject({
        id: incident.id,
        projectId: '6c395b31-cd45-4683-bb6a-cc4895488692',
      });
      expect(row.project_id).toBe('6c395b31-cd45-4683-bb6a-cc4895488692');
    }
  });

  it('the title names the project, the reporter and the type', async () => {
    const incident = fakeIncident({
      project: { name: 'kitchen test' },
      project_id: '6c395b31-cd45-4683-bb6a-cc4895488692',
      incident_type: 'injury',
      reporter: { display_name: 'Casey' },
    });
    const recipients = await computeIncidentRecipients(admin, companyId, 'crew_member', null, id(CREW));
    await notifyIncident({ admin, recipients, incident });

    const rows = await rowsFor(incident.id);
    expect(rows[0].title).toBe('Incident (kitchen test): Casey — INJURY');
    expect(rows[0].body).toBe(incident.description);
  });

  it('a shop/yard incident says so in the title instead of naming no project', async () => {
    const incident = fakeIncident({ project: null, project_id: null });
    const recipients = await computeIncidentRecipients(admin, companyId, 'crew_member', null, id(CREW));
    await notifyIncident({ admin, recipients, incident });

    const rows = await rowsFor(incident.id);
    expect(rows[0].title).toBe('Incident (shop/yard): Casey — INJURY');
    // No projectId to resolve a mobile destination with — links.ts returns null
    // and the tap falls back to /m/notifications rather than 404ing.
    expect(rows[0].link_params).toMatchObject({ id: incident.id });
    expect((rows[0].link_params as Record<string, unknown>).projectId).toBeUndefined();
    expect(rows[0].project_id).toBeNull();
  });

  it('R7 renders per recipient even when every recipient gets the same bytes', async () => {
    // An incident carries no money, so identical titles are CORRECT here. What
    // is asserted is that one call produced N independently-rendered rows —
    // the shape §3e's Owner-vs-PM split needs. A render() called once and reused
    // would also produce identical titles and pass nothing.
    const incident = fakeIncident();
    const recipients = await computeIncidentRecipients(admin, companyId, 'crew_member', null, id(CREW));
    await notifyIncident({ admin, recipients, incident });

    const rows = await rowsFor(incident.id);
    expect(rows.length).toBeGreaterThan(1);
    expect(new Set(rows.map((r) => r.title)).size).toBe(1);
    expect(new Set(rows.map((r) => r.recipient_profile_id)).size).toBe(rows.length);
  });

  it('an empty recipient set writes nothing and does not throw', async () => {
    const incident = fakeIncident();
    const outcome = await notifyIncident({ admin, recipients: [], incident });
    expect(outcome.written).toBe(0);
    expect(await rowsFor(incident.id)).toHaveLength(0);
  });
});

describe('the stored row is readable by the person it is addressed to', () => {
  it('a Foreman reads their own incident row, and only their own', async () => {
    const incident = fakeIncident();
    const recipients = await computeIncidentRecipients(admin, companyId, 'crew_member', null, id(CREW));
    await notifyIncident({ admin, recipients, incident });
    const rows = await rowsFor(incident.id);

    const foremanRow = rows.find((r) => r.recipient_profile_id === id(FOREMAN));
    expect(foremanRow, 'the foreman ranks above crew and must have a row').toBeDefined();

    const { data: visible } = await foremanC
      .from('notifications')
      .select('id, recipient_profile_id')
      .eq('source_id', incident.id);

    // notifications_select_own — the foreman sees exactly one of the four rows
    // this incident wrote. A refused SELECT returns ZERO ROWS rather than an
    // error, so the count is the assertion and the positive is what proves the
    // policy is not simply refusing everybody.
    expect(visible).toHaveLength(1);
    expect(visible![0].id).toBe(foremanRow!.id);
  });
});
