/**
 * S164 — Module 9 stage 2. Lifecycle: one timer, three termination states.
 *
 * Migration: `20261017000000_m9_client_lifecycle.sql`.
 * Service: `apps/web/lib/services/client-portal.ts`.
 * Spec: `9-spec.md` §3 — R1, R2, R4, R5, R17, §S.1.
 *
 * ============================================================================
 * ⚠️ THE ONE ASSERTION THIS FILE EXISTS FOR: B3 vs B4
 * ============================================================================
 * R5 is an ACCOUNT-level rule, and the obvious per-project implementation of it
 * passes almost every test you would think to write. B3 and B4 ask the SAME
 * question about the SAME long-completed project from two clients:
 *
 *   LINKED client (has other, active projects)  -> TRUE   "sees old projects in full"
 *   CLOSED client (has nothing else)            -> FALSE  "no standing archive access"
 *
 * A per-project window returns FALSE for both and fails only B3. Without B3 the
 * wrong implementation ships, and it presents months later as a returning
 * client who cannot see the job she just paid for.
 *
 * The pairing discipline from stage 1 continues throughout: the control client
 * (`josh+qa-client@`, unlinked) is still the proof that a refusal is a refusal
 * and not an absence.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { admin, assertRebuildTest, sessionFor } from './live-session';
import {
  inviteClientToPortal,
  setClientAccessState,
  getClientAccessEvents,
  CLIENT_ACCESS_STATES,
} from '@/lib/services/client-portal';

const LINKED = 'josh+qa-client-linked@worthprop.com';
const CLOSED = 'josh+qa-client-closed@worthprop.com';
const CONTROL = 'josh+qa-client@worthprop.com';
const OWNER = 'josh+test50@worthprop.com';
const PM = 'josh+pm@worthprop.com';

let linked: SupabaseClient;
let closed: SupabaseClient;
let owner: SupabaseClient;
let pm: SupabaseClient;

let companyId: string;
let ownerUserId: string;
let linkedProfileId: string;
let linkedContactId: string;
let closedProjectId: string;
let activeProjectId: string;
let noEmailContactId: string;
let closedContactId: string;

/** Invitations this file creates, torn down in afterAll. */
const madeInvitations: string[] = [];

const idOf = async (table: string, match: Record<string, unknown>, col = 'id') => {
  let q = admin.from(table).select(col);
  for (const [k, v] of Object.entries(match)) q = q.eq(k, v as string);
  const { data } = await q.maybeSingle();
  if (!data) throw new Error(`fixture missing: ${table} ${JSON.stringify(match)} — run scripts/seed-test-identities.mjs`);
  return (data as unknown as Record<string, string>)[col];
};

beforeAll(async () => {
  assertRebuildTest();
  [linked, closed, owner, pm] = await Promise.all([
    sessionFor(LINKED),
    sessionFor(CLOSED),
    sessionFor(OWNER),
    sessionFor(PM),
  ]);

  const { data: lp } = await admin
    .from('profiles').select('id, company_id, contact_id').eq('email', LINKED).single();
  const l = lp as { id: string; company_id: string; contact_id: string | null };
  linkedProfileId = l.id;
  companyId = l.company_id;
  if (!l.contact_id) throw new Error(`${LINKED} is not linked — run the seed. Every assertion here would be vacuous.`);
  linkedContactId = l.contact_id;

  const { data: ow } = await admin.from('profiles').select('user_id').eq('email', OWNER).single();
  ownerUserId = (ow as { user_id: string }).user_id;

  closedProjectId = await idOf('projects', { company_id: companyId, name: 'QA A — M9 completed 200d' });
  activeProjectId = await idOf('projects', { company_id: companyId, name: 'QA A — isolation fixture' });
  noEmailContactId = await idOf('contacts', { company_id: companyId, last_name: 'ClientNoEmail' });
  closedContactId = await idOf('contacts', { company_id: companyId, last_name: 'ClientClosed' });
});

afterAll(async () => {
  // Every client back to 'active', unconditionally. A test that dies mid-way
  // would otherwise leave an identity deactivated and turn every later
  // assertion in the M9 suite into a vacuous pass.
  await admin
    .from('profiles')
    .update({ client_access_state: 'active' })
    .in('email', [LINKED, CLOSED, CONTROL]);
  if (madeInvitations.length) {
    await admin.from('client_access_events').delete().eq('reason', 'S164 harness');
    await admin.from('invitations').delete().in('id', madeInvitations);
  }
});

const windowOpen = async (
  status: string,
  end: string | null,
  cancelledAt: string | null = null
) => {
  const { data, error } = await admin.rpc('client_window_open', {
    p_status: status,
    p_actual_end: end,
    p_cancelled_at: cancelledAt,
  });
  if (error) throw new Error(`client_window_open: ${error.message}`);
  return data as boolean;
};

const canSee = async (c: SupabaseClient, projectId: string) => {
  const { data, error } = await c.rpc('is_client_of_project', { p_project_id: projectId });
  if (error) throw new Error(`is_client_of_project: ${error.message}`);
  return data as boolean;
};

const levelOf = async (c: SupabaseClient) => {
  const { data, error } = await c.rpc('my_client_access_level');
  if (error) throw new Error(`my_client_access_level: ${error.message}`);
  return data as string;
};

const day = (offset: number) =>
  new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);

// ───────────────────────────────────────────────────────────────────────────
describe('A — the one timer, as arithmetic (R2/R5)', () => {
  it('A1 — an active project is always inside the window', async () => {
    expect(await windowOpen('active', null)).toBe(true);
    expect(await windowOpen('active', day(-9999))).toBe(true);
  });

  it('A2 — complete + 44 days ago is still OPEN; 46 days ago is CLOSED', async () => {
    // The boundary itself, from both sides. A test only at 200 days would pass
    // against `+ 450` just as happily.
    expect(await windowOpen('complete', day(-44))).toBe(true);
    expect(await windowOpen('complete', day(-46))).toBe(false);
  });

  it('A3 — exactly 45 days is still open (the day itself is inclusive)', async () => {
    expect(await windowOpen('complete', day(-45))).toBe(true);
  });

  it('A4 — complete with NO end date stays open — fail-open, deliberately', async () => {
    // Recorded in the migration header and flagged to Josh: automatic closure
    // runs only on an unambiguous date. R17 is the switch for everything else.
    expect(await windowOpen('complete', null)).toBe(true);
  });

  it('A5 — ARCHIVED is open-ended, and that is ruled rather than overlooked', async () => {
    // _Superseded at S164, quoted rather than deleted:_
    //   it('A5 — archived and cancelled are NOT completion', ...)
    //     expect(await windowOpen('archived', day(-500))).toBe(true);
    //     expect(await windowOpen('cancelled', day(-500))).toBe(true);
    //
    // ⚠️ THE CANCELLED HALF OF THAT IS NOW FALSE. Josh ruled at S164 that a
    // cancelled project ends portal access 30 days after cancellation, on its
    // own clock. The archived half stands, and its consequence is stated in A7.
    expect(await windowOpen('archived', day(-500), null)).toBe(true);
    expect(await windowOpen('archived', null, null)).toBe(true);
  });

  it('A6 — ⚠️ CANCELLED runs its own 30-day clock, from cancelled_at', async () => {
    // 30, not 45 — two windows exist deliberately.
    expect(await windowOpen('cancelled', null, new Date(Date.now() - 29 * 86400000).toISOString())).toBe(true);
    expect(await windowOpen('cancelled', null, new Date(Date.now() - 31 * 86400000).toISOString())).toBe(false);
  });

  it('A7 — and the 30 days is NOT read off actual_end_date', async () => {
    // The reason the ruling names cancelled_at: "a cancelled project may never
    // have an actual_end_date". An implementation that reused actual_end_date
    // would leave every cancelled project open forever, because the column is
    // NULL on all of them.
    expect(await windowOpen('cancelled', day(-500), null)).toBe(true);
    expect(await windowOpen('cancelled', day(-500), new Date(Date.now() - 31 * 86400000).toISOString())).toBe(false);
  });

  it('A8 — the two clocks are genuinely different numbers', async () => {
    // 40 days out: past cancellation's 30, inside completion's 45. If either
    // number were copied from the other, one of these two flips.
    const fortyDaysAgo = new Date(Date.now() - 40 * 86400000);
    expect(await windowOpen('complete', fortyDaysAgo.toISOString().slice(0, 10), null)).toBe(true);
    expect(await windowOpen('cancelled', null, fortyDaysAgo.toISOString())).toBe(false);
  });

  it('A9 — cancelled with NO date stays open (fail-open, as ruled)', async () => {
    expect(await windowOpen('cancelled', null, null)).toBe(true);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('B — R5 is an ACCOUNT-level gate, not a per-project one', () => {
  it('B1 — the closed project really is outside the window', async () => {
    const { data } = await admin
      .from('projects').select('status, actual_end_date').eq('id', closedProjectId).single();
    const p = data as { status: string; actual_end_date: string | null };
    expect(p.status).toBe('complete');
    expect(await windowOpen(p.status, p.actual_end_date)).toBe(false);
  });

  it('B2 — and BOTH clients are genuinely attached to it', async () => {
    // Otherwise B3/B4 would differ for a linkage reason rather than a
    // lifecycle one, and the pair would prove nothing.
    const { data: byOwnContact } = await admin
      .from('projects').select('contact_id').eq('id', closedProjectId).single();
    expect((byOwnContact as { contact_id: string }).contact_id).toBe(closedContactId);
    const { data: junction } = await admin
      .from('project_contacts')
      .select('id').eq('project_id', closedProjectId).eq('contact_id', linkedContactId)
      .eq('is_deleted', false);
    expect(junction ?? []).toHaveLength(1);
  });

  it('B3 — ⚠️ the LINKED client SEES the long-completed project ("in full")', async () => {
    // Her account is live because of OTHER, active projects. A per-project
    // window implementation fails exactly here and nowhere else.
    expect(await canSee(linked, closedProjectId)).toBe(true);
    expect(await levelOf(linked)).toBe('full');
  });

  it('B4 — ⚠️ the CLOSED client sees NOTHING ("no standing archive access")', async () => {
    expect(await canSee(closed, closedProjectId)).toBe(false);
    expect(await levelOf(closed)).toBe('none');
  });

  it('B5 — the closed client cannot read her own contact row either', async () => {
    const { data } = await closed.from('contacts').select('id');
    expect(data ?? []).toHaveLength(0);
  });

  it('B6 — and the linked client still reaches her active project', async () => {
    expect(await canSee(linked, activeProjectId)).toBe(true);
  });

  it('B7 — ⚠️ REACTIVATION: linking a new job restores the OLD projects too', async () => {
    // R4: "The account outlives the project. The company reactivates and links
    // the new job." R5: "On reactivation she sees old projects IN FULL."
    //
    // This is the state TRANSITION rather than two static fixtures, and it is
    // the assertion a per-project window cannot pass at all: under that reading
    // the old project stays invisible forever, no matter what else she is
    // given. Nothing about the old project changes here — only what else the
    // account holds.
    expect(await canSee(closed, closedProjectId)).toBe(false);

    const { data: link, error } = await admin
      .from('project_contacts')
      .insert({
        company_id: companyId,
        project_id: activeProjectId,
        contact_id: closedContactId,
        role: 'client',
      })
      .select('id')
      .single();
    if (error) throw new Error(`reactivation fixture: ${error.message}`);

    try {
      expect(await canSee(closed, activeProjectId), 'the new job').toBe(true);
      expect(await canSee(closed, closedProjectId), 'and the OLD one, in full').toBe(true);
      expect(await levelOf(closed)).toBe('full');
    } finally {
      await admin.from('project_contacts').delete().eq('id', (link as { id: string }).id);
    }

    // ...and dark again the moment the new job goes away, which is the other
    // half of "no standing archive access without an active project".
    expect(await canSee(closed, closedProjectId)).toBe(false);
    expect(await levelOf(closed)).toBe('none');
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('C — R17: three termination states, Owner/Admin only, all recorded', () => {
  const restore = async () => {
    await admin.from('profiles').update({ client_access_state: 'active' }).eq('id', linkedProfileId);
  };

  it('C1 — deactivate is total: project, contact and address all go dark', async () => {
    try {
      const r = await setClientAccessState(owner, {
        profileId: linkedProfileId,
        state: 'deactivated',
        reason: 'S164 harness',
      });
      expect(r.error).toBeUndefined();
      expect(r.success).toBe(true);

      expect(await canSee(linked, activeProjectId)).toBe(false);
      expect(await levelOf(linked)).toBe('none');
      expect((await linked.from('contacts').select('id')).data ?? []).toHaveLength(0);
      expect((await linked.from('contact_addresses').select('id')).data ?? []).toHaveLength(0);
    } finally {
      await restore();
    }
  });

  it('C2 — and it is reversible: "a switch, not a shredder"', async () => {
    // R5's words. Proving the restore is not cosmetic — the data was never
    // touched, only the gate.
    expect(await canSee(linked, activeProjectId)).toBe(true);
    expect((await linked.from('contacts').select('id')).data ?? []).toHaveLength(1);
  });

  it('C3 — the two document-limited states still REACH the project', async () => {
    // They narrow WHICH DOCUMENTS, and the document surfaces do not exist for
    // a client yet. Asserting they behave as "still has access" pins the
    // contract stage 2's policy arms must honour.
    for (const state of ['signed_documents_only', 'documents_for_signature'] as const) {
      try {
        const r = await setClientAccessState(owner, {
          profileId: linkedProfileId,
          state,
          reason: 'S164 harness',
        });
        expect(r.success, `${state}: ${r.error ?? ''}`).toBe(true);
        expect(await canSee(linked, activeProjectId)).toBe(true);
        expect(await levelOf(linked)).toBe(state);
      } finally {
        await restore();
      }
    }
  });

  it('C4 — every transition is logged, with from/to and the actor', async () => {
    try {
      await setClientAccessState(owner, {
        profileId: linkedProfileId,
        state: 'deactivated',
        reason: 'S164 harness',
      });
      const events = await getClientAccessEvents(owner, linkedProfileId);
      expect(events.length).toBeGreaterThan(0);
      const latest = events[0];
      expect(latest.from_state).toBe('active');
      expect(latest.to_state).toBe('deactivated');
      expect(latest.reason).toBe('S164 harness');
      expect(latest.actor_id).toBe(ownerUserId);
    } finally {
      await restore();
    }
  });

  it('C5 — a PM cannot change it, and is TOLD so rather than lied to', async () => {
    // profiles has no PM update policy, so the UPDATE matches zero rows and
    // Postgres calls that a success. `applied()` is what turns it into a
    // refusal — without it this returns success over an unchanged row.
    const r = await setClientAccessState(pm, {
      profileId: linkedProfileId,
      state: 'deactivated',
      reason: 'S164 harness',
    });
    expect(r.success).toBe(false);

    const { data: after } = await admin
      .from('profiles').select('client_access_state').eq('id', linkedProfileId).single();
    expect((after as { client_access_state: string }).client_access_state).toBe('active');
  });

  it('C6 — the client cannot change her own state', async () => {
    // ⚠️ ATTEMPT A REAL CHANGE. The self-update RLS arm (profiles_update_self)
    // lets her touch her OWN row, so column scope is NOT enforced by RLS — it is
    // the `profiles_self_column_scope` trigger, which allows only first/last name
    // and RAISES on anything else. Writing the value she ALREADY has (this test's
    // former bug: `'active'`) changes no guarded column, so the row-touch on
    // updated_at succeeds and returns the id — which is not what "cannot change"
    // means. Set a DIFFERENT state and prove it is rejected AND did not persist.
    const { data, error } = await linked
      .from('profiles')
      .update({ client_access_state: 'deactivated' })
      .eq('id', linkedProfileId)
      .select('id');
    expect(error).not.toBeNull();
    expect(data ?? []).toHaveLength(0);

    const { data: after } = await admin
      .from('profiles').select('client_access_state').eq('id', linkedProfileId).single();
    expect((after as { client_access_state: string }).client_access_state).toBe('active');
  });

  it('C7 — the audit log is Owner/Admin only; the client cannot read it', async () => {
    const { data } = await linked.from('client_access_events').select('id');
    expect(data ?? []).toHaveLength(0);
  });

  it('C8 — a termination state cannot be parked on a non-client profile', async () => {
    const { data: crew } = await admin
      .from('profiles').select('id').eq('email', 'josh+crew@worthprop.com').single();
    const { error } = await admin
      .from('profiles')
      .update({ client_access_state: 'deactivated' })
      .eq('id', (crew as { id: string }).id);
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/client_access_state_client_only|violates check/i);
  });

  it('C9 — the states in code and the states in the CHECK are the same set', async () => {
    expect(await windowOpen('active', null, null)).toBe(true); // migration applied
    expect([...CLIENT_ACCESS_STATES].sort()).toEqual(
      ['active', 'deactivated', 'documents_for_signature', 'signed_documents_only'].sort()
    );
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('D — the invite path (R1, §S.1)', () => {
  it('D1 — ⚠️ a contact with NO email is refused, and told what is missing', async () => {
    const r = await inviteClientToPortal(owner, {
      contactId: noEmailContactId,
      projectId: activeProjectId,
      invitedBy: ownerUserId,
    });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/email address/i);
    expect(r.error).toMatch(/ClientNoEmail/);
  });

  it('D2 — the no-email contact really has none (so D1 is not vacuous)', async () => {
    const { data } = await admin
      .from('contacts').select('email').eq('id', noEmailContactId).single();
    expect((data as { email: string | null }).email).toBeNull();
  });

  it('D3 — a contact not on the project is refused', async () => {
    // The invitation's project governs its lifetime, so an unrelated project
    // would hand the invite a clock belonging to somebody else's job.
    const r = await inviteClientToPortal(owner, {
      contactId: closedContactId,
      projectId: activeProjectId,
      invitedBy: ownerUserId,
    });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/Add this contact to the project/i);
  });

  it('D4 — a contact who already has an account is refused, pointing at R17', async () => {
    const r = await inviteClientToPortal(owner, {
      contactId: linkedContactId,
      projectId: activeProjectId,
      invitedBy: ownerUserId,
    });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/already has a portal account/i);
  });

  it('D5 — a good invite is created, carrying the contact AND the project', async () => {
    const { data: fresh } = await admin
      .from('contacts')
      .insert({
        company_id: companyId,
        contact_type: 'client',
        first_name: 'QA',
        last_name: 'InviteTarget',
        email: 'qa-invite-target@example.invalid',
      })
      .select('id')
      .single();
    const freshId = (fresh as { id: string }).id;
    await admin.from('project_contacts').insert({
      company_id: companyId,
      project_id: activeProjectId,
      contact_id: freshId,
      role: 'client',
    });

    try {
      const r = await inviteClientToPortal(owner, {
        contactId: freshId,
        projectId: activeProjectId,
        invitedBy: ownerUserId,
      });
      expect(r.error).toBeUndefined();
      expect(r.success).toBe(true);
      madeInvitations.push(r.invitationId!);

      const { data: inv } = await admin
        .from('invitations')
        .select('role, contact_id, project_id, email, status')
        .eq('id', r.invitationId!)
        .single();
      const i = inv as Record<string, string>;
      expect(i.role).toBe('client');
      expect(i.contact_id).toBe(freshId);
      expect(i.project_id).toBe(activeProjectId);
      expect(i.status).toBe('pending');
    } finally {
      await admin.from('project_contacts').delete().eq('contact_id', freshId);
      await admin.from('invitations').delete().eq('contact_id', freshId);
      await admin.from('contacts').delete().eq('id', freshId);
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('E — R2: ONE timer. expires_at is not a second clock.', () => {
  const makeInvite = async (projectId: string, expiresAt: string) => {
    const { data, error } = await admin
      .from('invitations')
      .insert({
        company_id: companyId,
        email: `qa-r2-${Math.abs(projectId.charCodeAt(0) + expiresAt.length)}@example.invalid`,
        role: 'client',
        invited_by: ownerUserId,
        contact_id: linkedContactId,
        project_id: projectId,
        expires_at: expiresAt,
      })
      .select('id, token')
      .single();
    if (error) throw new Error(`makeInvite: ${error.message}`);
    const row = data as { id: string; token: string };
    madeInvitations.push(row.id);
    return row;
  };

  it('E1 — ⚠️ expires_at LONG PAST, project active: the invite is STILL VALID', async () => {
    // This is R2 in one assertion. `invitations.expires_at` defaults to
    // now() + 7 days, so without the change a client invite would die a week
    // in while the ruling says it lives until 45 days after completion.
    const inv = await makeInvite(activeProjectId, new Date(Date.now() - 90 * 86400000).toISOString());

    const { data: sig } = await admin.rpc('get_invitation_for_signup', { invite_token: inv.token });
    expect((sig ?? []) as unknown[]).toHaveLength(1);

    const { data: status } = await admin.rpc('get_invitation_status', { invite_token: inv.token });
    expect(status).toBe('valid');
  });

  it('E2 — expires_at FAR FUTURE, project long complete: the invite is EXPIRED', async () => {
    // The converse. Together with E1 this pins that the project — and only the
    // project — is what the client clock reads.
    const inv = await makeInvite(closedProjectId, new Date(Date.now() + 90 * 86400000).toISOString());

    const { data: sig } = await admin.rpc('get_invitation_for_signup', { invite_token: inv.token });
    expect((sig ?? []) as unknown[]).toHaveLength(0);

    const { data: status } = await admin.rpc('get_invitation_status', { invite_token: inv.token });
    expect(status).toBe('expired');
  });

  it('E3 — a client invite hands back its contact_id for the signup trigger', async () => {
    const inv = await makeInvite(activeProjectId, new Date(Date.now() + 3600_000).toISOString());
    const { data } = await admin.rpc('get_invitation_for_signup', { invite_token: inv.token });
    const rows = (data ?? []) as { contact_id: string | null; member_id: string | null }[];
    expect(rows).toHaveLength(1);
    expect(rows[0].contact_id).toBe(linkedContactId);
    // And no member row is implied — Q1's ruling, enforced from the invite in.
    expect(rows[0].member_id).toBeNull();
  });

  it('E4 — a STAFF invitation still uses expires_at, unchanged', async () => {
    // The client branch must not have widened anybody else's clock.
    const { data, error } = await admin
      .from('invitations')
      .insert({
        company_id: companyId,
        email: 'qa-r2-staff@example.invalid',
        role: 'crew_member',
        invited_by: ownerUserId,
        expires_at: new Date(Date.now() - 86400000).toISOString(),
      })
      .select('id, token')
      .single();
    if (error) throw new Error(error.message);
    const row = data as { id: string; token: string };
    madeInvitations.push(row.id);

    const { data: sig } = await admin.rpc('get_invitation_for_signup', { invite_token: row.token });
    expect((sig ?? []) as unknown[]).toHaveLength(0);
    const { data: status } = await admin.rpc('get_invitation_status', { invite_token: row.token });
    expect(status).toBe('expired');
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('F — cancellation: the date is captured, and it ends access', () => {
  /**
   * A throwaway project owned by the CLOSED client's contact. She has nothing
   * else, so her account tracks this one project exactly — which makes the
   * account-level gate readable as a single on/off in these assertions.
   */
  let tempId: string | null = null;

  const makeProject = async () => {
    const { data: counters } = await admin
      .from('companies')
      .select('estimate_number_sequence, project_internal_sequence')
      .eq('id', companyId)
      .single();
    const c = counters as { estimate_number_sequence: number; project_internal_sequence: number };
    const { data, error } = await admin
      .from('projects')
      .insert({
        company_id: companyId,
        name: `QA A — S164 cancellation probe ${c.project_internal_sequence + 1}`,
        contact_id: closedContactId,
        project_type: 'fixed_price',
        retainage_percent: 5,
        project_number: `PRJ-${String(c.estimate_number_sequence + 1).padStart(3, '0')}`,
        project_internal_seq: c.project_internal_sequence + 1,
        status: 'active',
      })
      .select('id')
      .single();
    if (error) throw new Error(`temp project: ${error.message}`);
    await admin
      .from('companies')
      .update({
        estimate_number_sequence: c.estimate_number_sequence + 1,
        project_internal_sequence: c.project_internal_sequence + 1,
      })
      .eq('id', companyId);
    tempId = (data as { id: string }).id;
    return tempId;
  };

  const stateOf = async (id: string) => {
    const { data } = await admin
      .from('projects').select('status, cancelled_at').eq('id', id).single();
    return data as { status: string; cancelled_at: string | null };
  };

  afterAll(async () => {
    if (tempId) await admin.from('projects').delete().eq('id', tempId);
  });

  it('F1 — cancelled_at is NULL until the project is cancelled', async () => {
    const id = await makeProject();
    expect((await stateOf(id)).cancelled_at).toBeNull();
    // ...and while it is active, the closed client's account is LIVE again.
    expect(await levelOf(closed)).toBe('full');
  });

  it('F2 — the trigger stamps it on the transition, not the writer', async () => {
    // Set ONLY the status. Nothing supplies a date, which is the point: a
    // writer that forgets it would otherwise grant indefinite access.
    await admin.from('projects').update({ status: 'cancelled' }).eq('id', tempId!);
    const after = await stateOf(tempId!);
    expect(after.status).toBe('cancelled');
    expect(after.cancelled_at).not.toBeNull();
    expect(Math.abs(Date.now() - Date.parse(after.cancelled_at!))).toBeLessThan(120_000);
  });

  it('F3 — freshly cancelled is still INSIDE the 30 days', async () => {
    expect(await levelOf(closed)).toBe('full');
    expect(await canSee(closed, tempId!)).toBe(true);
  });

  it('F4 — ⚠️ backdated past 30 days, the account goes dark', async () => {
    // Status is unchanged here, so the trigger does not re-stamp — which is
    // itself the assertion that it fires on TRANSITIONS and not on every write.
    await admin
      .from('projects')
      .update({ cancelled_at: new Date(Date.now() - 31 * 86400000).toISOString() })
      .eq('id', tempId!);
    expect((await stateOf(tempId!)).status).toBe('cancelled');

    expect(await canSee(closed, tempId!)).toBe(false);
    expect(await levelOf(closed)).toBe('none');
  });

  it('F5 — un-cancelling CLEARS the date, and access returns', async () => {
    await admin.from('projects').update({ status: 'active' }).eq('id', tempId!);
    const after = await stateOf(tempId!);
    expect(after.cancelled_at, 'a stale date would expire access on re-cancellation').toBeNull();
    expect(await levelOf(closed)).toBe('full');
  });

  it('F6 — re-cancelling RESTARTS the clock rather than inheriting', async () => {
    await admin.from('projects').update({ status: 'cancelled' }).eq('id', tempId!);
    const after = await stateOf(tempId!);
    expect(after.cancelled_at).not.toBeNull();
    expect(Math.abs(Date.now() - Date.parse(after.cancelled_at!))).toBeLessThan(120_000);
    // Fresh 30 days, so she is back inside the window.
    expect(await levelOf(closed)).toBe('full');
  });

  it('F7 — ARCHIVED does not end access, and that is the ruling', async () => {
    // Stated as an assertion so nobody later "fixes" it as a leak. The only
    // thing that ends an archived project's portal access is R17.
    await admin.from('projects').update({ status: 'archived' }).eq('id', tempId!);
    expect((await stateOf(tempId!)).cancelled_at).toBeNull();
    expect(await canSee(closed, tempId!)).toBe(true);
    expect(await levelOf(closed)).toBe('full');
  });

  it('F8 — a project INSERTED as cancelled is stamped too', async () => {
    const { data: counters } = await admin
      .from('companies')
      .select('estimate_number_sequence, project_internal_sequence')
      .eq('id', companyId)
      .single();
    const c = counters as { estimate_number_sequence: number; project_internal_sequence: number };
    const { data, error } = await admin
      .from('projects')
      .insert({
        company_id: companyId,
        name: `QA A — S164 cancelled-at-insert ${c.project_internal_sequence + 1}`,
        contact_id: closedContactId,
        project_type: 'fixed_price',
        retainage_percent: 5,
        project_number: `PRJ-${String(c.estimate_number_sequence + 1).padStart(3, '0')}`,
        project_internal_seq: c.project_internal_sequence + 1,
        status: 'cancelled',
      })
      .select('id, cancelled_at')
      .single();
    if (error) throw new Error(error.message);
    const row = data as { id: string; cancelled_at: string | null };
    try {
      expect(row.cancelled_at, 'BEFORE UPDATE alone would miss this row').not.toBeNull();
    } finally {
      await admin.from('projects').delete().eq('id', row.id);
      await admin
        .from('companies')
        .update({
          estimate_number_sequence: c.estimate_number_sequence + 1,
          project_internal_sequence: c.project_internal_sequence + 1,
        })
        .eq('id', companyId);
    }
  });
});
