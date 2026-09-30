/**
 * S120 PART 4 — "Also send to": contacts (4-A) and a typed address (4-B).
 *
 * Migration 20262116000000 + lib/services/proposal-copies.ts. Measured before
 * building: `estimates.also_send_to` (contacts) existed and was shown on the
 * details page, but NO send route read it — every recipient saved there was
 * silently never emailed.
 *
 * Proves, judged by the SERVICE ROLE, writes made WITHOUT returning rows:
 *   * the Owner sets both; the typed address is normalised;
 *   * ANOTHER company's contact (and a ghost id) cannot be added — same refusal;
 *   * a PM who CAN edit this draft (positive control) cannot change recipients;
 *   * a malformed / multi-address typed value is REFUSED, never dropped;
 *   * the REAL send route (in-process) mails the signer WITH the signing link
 *     and each recipient a COPY WITHOUT it, logs every attempt, and writes ONE
 *     send event listing every address;
 *   * the typed address gets NO read path (no signing session, no contact, no
 *     profile, no invitation; its copy carries no /sign/ link);
 *   * after the send, the list is frozen.
 *
 * sendEmail and the language check are mocked (no real mail, no OpenAI); the
 * PDF, the signing session, the logs and the event are real.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { NextRequest } from 'next/server';
import { admin, assertRebuildTest, sessionFor } from './live-session';

const h = vi.hoisted(() => ({
  client: null as unknown,
  sent: [] as Array<{ to: string; signLink: boolean }>,
}));
vi.mock('@/lib/supabase-server', () => ({
  createClient: async () => h.client,
  getRequestUser: async () => (await (h.client as SupabaseClient).auth.getUser()).data.user ?? null,
}));
vi.mock('@/lib/language-check/english-check', () => ({
  checkClientFacingEnglish: async () => ({ checked: false, flagged: [] }),
  nonEnglishResponseBody: () => ({}),
}));
vi.mock('@/lib/services/email-service', async (importActual) => {
  const actual = (await importActual()) as Record<string, unknown>;
  const { render } = await import('@react-email/components');
  return {
    ...actual,
    // The email as it would go out: RENDERED, so "has a signing link" is read
    // off the real HTML, not off a component prop.
    sendEmail: async (p: { to: string; react: Parameters<typeof render>[0] }) => {
      const html = await render(p.react);
      h.sent.push({ to: p.to, signLink: /\/sign\/[A-Za-z0-9_-]{8,}/.test(html) });
      return { messageId: `s120r-${h.sent.length}`, error: null };
    },
  };
});

const MARKER = 'S120R';
const OWNER = 'josh+test50@worthprop.com';
const PM = 'josh+pm@worthprop.com';
const SIGNER = 'josh+s120r-signer@example.com';
const COPY = 'josh+s120r-copy@example.com';
const TYPED = 'josh+s120r-typed@example.com';

let owner: SupabaseClient;
let pm: SupabaseClient;
let companyA = '';
let estimateId = '';
let signerContact = '';
let copyContact = '';
let foreignContact = '';

async function row() {
  const { data } = await admin
    .from('estimates')
    .select('also_send_to, also_send_to_email, internal_notes, status')
    .eq('id', estimateId)
    .single();
  return data as {
    also_send_to: Array<{ contact_id: string; email: string }>;
    also_send_to_email: string | null;
    internal_notes: string | null;
    status: string;
  };
}

async function sweep() {
  const { data: ests } = await admin.from('estimates').select('id').like('name', `${MARKER}%`);
  const ids = ((ests ?? []) as Array<{ id: string }>).map((e) => e.id);
  if (ids.length) {
    await admin.from('estimate_events').delete().in('estimate_id', ids);
    await admin.from('email_logs').delete().in('estimate_id', ids);
    await admin.from('signing_sessions').delete().in('estimate_id', ids);
    const { data: fs } = await admin.from('files').select('id, file_path').in('estimate_id', ids);
    for (const f of (fs ?? []) as Array<{ id: string; file_path: string }>) {
      await admin.storage.from('project-files').remove([f.file_path]);
      await admin.from('files').delete().eq('id', f.id);
    }
    await admin.from('estimates').delete().in('id', ids);
  }
  await admin.from('contacts').delete().like('first_name', `${MARKER}%`);
}

beforeAll(async () => {
  assertRebuildTest();
  await sweep();
  const { data: o } = await admin.from('profiles').select('company_id').eq('email', OWNER).single();
  companyA = (o as { company_id: string }).company_id;
  const { data: pmp } = await admin.from('profiles').select('user_id').eq('email', PM).single();
  const pmUser = (pmp as { user_id: string }).user_id;
  const mk = async (first: string, email: string) => {
    const { data, error } = await admin
      .from('contacts')
      .insert({ company_id: companyA, first_name: `${MARKER} ${first}`, last_name: 'Probe', email })
      .select('id')
      .single();
    if (error) throw new Error(`contact: ${error.message}`);
    return (data as { id: string }).id;
  };
  signerContact = await mk('Signer', SIGNER);
  copyContact = await mk('Copy', COPY);
  const { data: fc } = await admin
    .from('contacts')
    .select('id, company_id')
    .neq('company_id', companyA)
    .eq('is_deleted', false)
    .order('id')
    .limit(1)
    .single();
  foreignContact = (fc as { id: string }).id;
  const { data: est, error } = await admin
    .from('estimates')
    .insert({
      company_id: companyA,
      contact_id: signerContact,
      name: `${MARKER} estimate`,
      status: 'draft',
      estimate_number: `EST-${MARKER}-${Date.now()}`,
      created_by_role: 'project_manager',
      created_by: pmUser,
    })
    .select('id')
    .single();
  if (error) throw new Error(`estimate: ${error.message}`);
  estimateId = (est as { id: string }).id;
  owner = await sessionFor(OWNER);
  pm = await sessionFor(PM);
}, 240_000);

afterAll(async () => {
  await sweep();
  const { count } = await admin
    .from('estimates')
    .select('id', { count: 'exact', head: true })
    .like('name', `${MARKER}%`);
  expect(count ?? 0, 'S120R estimates survived teardown').toBe(0);
}, 120_000);

describe('who may set the recipients, and to what', () => {
  it('the Owner sets one contact and one typed address; the typed address is normalised', async () => {
    const { error } = await owner
      .from('estimates')
      .update({
        also_send_to: [{ contact_id: copyContact, name: `${MARKER} Copy Probe`, email: COPY }],
        also_send_to_email: '  Josh+S120R-Typed@Example.com ',
      } as never)
      .eq('id', estimateId);
    const r = await row();
    console.log(
      `[S120R] owner set: error=${error?.code ?? 'none'} list=${r.also_send_to.length} typed=${r.also_send_to_email}`
    );
    expect(error).toBeNull();
    expect(r.also_send_to.map((x) => x.contact_id)).toEqual([copyContact]);
    expect(r.also_send_to_email).toBe(TYPED);
  });

  it("⚠️ ANOTHER company's contact cannot be added — and a ghost id gets the SAME refusal", async () => {
    const before = await row();
    const foreign = await owner
      .from('estimates')
      .update({
        also_send_to: [
          ...before.also_send_to,
          { contact_id: foreignContact, name: 'x', email: 'x@example.com' },
        ],
      } as never)
      .eq('id', estimateId);
    const ghost = await owner
      .from('estimates')
      .update({
        also_send_to: [
          { contact_id: '00000000-0000-4000-8000-0000000000aa', name: 'g', email: 'g@example.com' },
        ],
      } as never)
      .eq('id', estimateId);
    const after = await row();
    console.log(
      `[S120R] foreign: ${foreign.error?.code} "${foreign.error?.message}" / ghost: ${ghost.error?.code} "${ghost.error?.message}"`
    );
    expect(after.also_send_to).toEqual(before.also_send_to);
    expect(foreign.error?.code).toBe('42501');
    expect(foreign.error?.message).toBe(ghost.error?.message);
  });

  it('a PM who CAN edit this draft (control) cannot change who it is sent to', async () => {
    const note = `${MARKER} pm note ${Date.now()}`;
    const ctl = await pm
      .from('estimates')
      .update({ internal_notes: note } as never)
      .eq('id', estimateId);
    const r1 = await row();
    expect(
      ctl.error,
      'control: the PM could not edit its own draft at all — the negative would be vacuous'
    ).toBeNull();
    expect(r1.internal_notes).toBe(note);
    const typed = await pm
      .from('estimates')
      .update({ also_send_to_email: 'josh+pm-sneak@example.com' } as never)
      .eq('id', estimateId);
    const list = await pm
      .from('estimates')
      .update({ also_send_to: [] } as never)
      .eq('id', estimateId);
    const r2 = await row();
    console.log(
      `[S120R] PM typed=${typed.error?.code} list=${list.error?.code}; row typed=${r2.also_send_to_email} list=${r2.also_send_to.length}`
    );
    expect(r2.also_send_to_email).toBe(TYPED);
    expect(r2.also_send_to.length).toBe(1);
    expect(typed.error?.code).toBe('42501');
    expect(list.error?.code).toBe('42501');
  });

  it('a malformed or multi-address typed value is REFUSED, never silently dropped', async () => {
    for (const bad of ['not-an-email', 'a@example.com, b@example.com', 'a@b', 'a b@example.com']) {
      const { error } = await owner
        .from('estimates')
        .update({ also_send_to_email: bad } as never)
        .eq('id', estimateId);
      expect(error?.code, `accepted: ${bad}`).toBe('22023');
    }
    expect((await row()).also_send_to_email).toBe(TYPED);
  });
});

describe('the send (real route, in-process, as the Owner)', () => {
  it('mails the signer WITH the signing link, each recipient a COPY WITHOUT it, and records ONE event listing all three', async () => {
    h.client = owner;
    h.sent.length = 0;
    const { POST } = (await import('@/app/api/proposals/send/route')) as unknown as {
      POST: (req: NextRequest) => Promise<Response>;
    };
    const res = await POST(
      new NextRequest('http://localhost/api/proposals/send', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          estimate_id: estimateId,
          subject: 'Proposal {estimate_number}',
          body: 'Hello {{contact_name}}, please review: {{signing_link}}',
        }),
      })
    );
    const body = (await res.json()) as {
      success?: boolean;
      error?: string;
      failedCopies?: string[];
    };
    console.log(
      `[S120R] send → ${res.status} ${JSON.stringify(body).slice(0, 200)}; sent=${JSON.stringify(h.sent)}`
    );
    expect(res.status).toBe(200);
    expect(body.failedCopies).toEqual([]);
    const byTo = Object.fromEntries(h.sent.map((s) => [s.to, s.signLink]));
    expect(Object.keys(byTo).sort()).toEqual([COPY, SIGNER, TYPED].sort());
    expect(byTo[SIGNER], 'the signer must get the signing link').toBe(true);
    expect(byTo[COPY], 'a copy must NOT carry a signing link').toBe(false);
    expect(byTo[TYPED], 'the typed address must NOT get a signing link').toBe(false);

    const { data: logs } = await admin
      .from('email_logs')
      .select('recipient_email, status, metadata')
      .eq('estimate_id', estimateId)
      .eq('email_type', 'proposal');
    expect(
      ((logs ?? []) as Array<{ recipient_email: string }>).map((l) => l.recipient_email).sort()
    ).toEqual([COPY, SIGNER, TYPED].sort());
    const { data: ev } = await admin
      .from('estimate_events')
      .select('payload')
      .eq('estimate_id', estimateId)
      .eq('kind', 'send');
    const events = (ev ?? []) as Array<{
      payload: { recipients: Array<{ email: string; kind: string; status: string }> };
    }>;
    expect(events.length).toBe(1);
    expect(
      events[0].payload.recipients.map((r) => `${r.kind}:${r.email}:${r.status}`).sort()
    ).toEqual([`contact:${COPY}:sent`, `signer:${SIGNER}:sent`, `typed:${TYPED}:sent`].sort());
  });

  it('⚠️ the TYPED address gets no read path: no signing session, contact, profile or invitation; its copy has no /sign/ link', async () => {
    const cnt = async (table: string, col: string) => {
      const { count } = await admin
        .from(table)
        .select('id', { count: 'exact', head: true })
        .eq(col, TYPED);
      return count ?? 0;
    };
    const sessions = await cnt('signing_sessions', 'recipient_email');
    const contacts = await cnt('contacts', 'email');
    const profiles = await cnt('profiles', 'email');
    const invites = await cnt('invitations', 'email');
    const { data: log } = await admin
      .from('email_logs')
      .select('metadata')
      .eq('estimate_id', estimateId)
      .eq('recipient_email', TYPED)
      .single();
    const copyBody = String((log as { metadata: { body?: string } }).metadata.body ?? '');
    console.log(
      `[S120R] typed: sessions=${sessions} contacts=${contacts} profiles=${profiles} invites=${invites} body="${copyBody}"`
    );
    expect([sessions, contacts, profiles, invites]).toEqual([0, 0, 0, 0]);
    // Substitution really happened (a literal {{signing_link}} would pass the
    // next line vacuously — the first run of this file did exactly that).
    expect(copyBody).not.toMatch(/\{\{/);
    expect(copyBody).toContain('the signing link, which was sent to');
    expect(copyBody).not.toMatch(/\/sign\//);
  });

  it('after the send, who it goes to is FROZEN', async () => {
    expect((await row()).status).toBe('sent');
    const { error } = await owner
      .from('estimates')
      .update({ also_send_to_email: 'josh+late@example.com' } as never)
      .eq('id', estimateId);
    expect(error).not.toBeNull();
    expect((await row()).also_send_to_email).toBe(TYPED);
  });
});
