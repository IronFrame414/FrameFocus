import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import { admin, assertRebuildTest, sessionFor } from './live-session';

// ============================================================================
// S174 #1 — RELEASING SELECTIONS SENDS AN EMAIL. It never did.
// ============================================================================
//
// Josh, click-testing S173: *"I received the estimate via email when I tested
// it. I have not received the selections."* `grep -rn 'sendEmail'` over
// `app/api/selections/` and `selection-lifecycle-service.ts` returned nothing.
//
// ⚠️ WHY THIS FILE EXECUTES THE ROUTES AND NOT THE SERVICE.
// `s171-selections-lifecycle.live.ts` covers the lifecycle thoroughly, calling
// the service functions directly — and it was fully green while no client ever
// received anything. That is the whole shape of the defect: THE MECHANISM WAS
// NEVER BROKEN, the wiring to it was missing. A harness that calls
// `sendSelectionsReleasedEmail()` itself would go green on a route that forgot
// to call it, which is precisely the failure being guarded against (S173's Job
// 1: *"nothing was ever removed, the affordance never existed"*).
//
// So the REAL SHIPPED ROUTE MODULES are imported and invoked, with only the
// client factory replaced — the pattern `s146-generate-route.live.ts` states in
// its own header. `state.client` is a real anon-key client carrying a real user
// JWT, so every read and write inside the route runs under production policies.
//
// ---------------------------------------------------------------------------
// ⚠️ THIS HARNESS DELIVERS NO REAL EMAIL, AND THAT IS A DECISION, NOT A GAP.
// ---------------------------------------------------------------------------
// The QA fixture project's contact is `qa-client-a@example.invalid` — a domain
// that by RFC 2606 can never resolve. The send is therefore ATTEMPTED for real
// (`getResend()`, the composed React element, the network call) and lands in
// `email_logs` either as `sent` with a message id or as `failed` with the
// error. Both are proof the path RAN; neither mails a person.
//
// What is deliberately NOT re-proven here: that the Resend hop and the domain
// verification work end to end. `s160-invite-send.live.ts` delivers one real
// email per run for exactly that, and says so in its own header. A second real
// send would buy a second copy of the same assertion and a second unsolicited
// message. The template's RENDER is covered without a network at all, by
// `brand-email-footer.test.tsx`.
//
// ⚠️ THE ASSERTION THAT WOULD HAVE BEEN RED BEFORE THIS FIX is C1/D1: an
// `email_logs` row of type `selection_released` exists at all. Before S174
// there was no row, no type and no sender.
// ============================================================================

const state = vi.hoisted(() => ({ client: null as unknown as SupabaseClient }));
vi.mock('@/lib/supabase-server', () => ({ createClient: async () => state.client }));

import { NextRequest } from 'next/server';
// THE REAL SHIPPED ROUTES.
import { POST as RELEASE } from '@/app/api/selections/release/route';
import { POST as OFFER } from '@/app/api/selections/[id]/offer/route';
import { buildSelectionsPortalLink, buildSelectionsReleasedSubject, sendSelectionsReleasedEmail } from '@/lib/services/selection-email';

const MARKER = 'S174MAIL';
const PROJECT = '4a4f8567-67f8-4394-baae-181229974bd9'; // QA A — isolation fixture
const OWNER = 'josh+test50@worthprop.com';
const PM = 'josh+pm@worthprop.com';
const SUB = 'josh+qa-sub@worthprop.com';
const RECIPIENT = 'qa-client-a@example.invalid'; // the fixture project's contact

type Client = SupabaseClient<Database>;
let ownerC: Client;
let pmC: Client;
let subC: Client;
let companyId: string;
let companyName: string;
let companySlug: string;
let selA: string;
let selB: string;
let selSolo: string;

const must = (l: string, e: { message: string } | null) => { if (e) throw new Error(`${l}: ${e.message}`); };

function req(path: string, body?: Record<string, unknown>): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

async function logs() {
  const { data } = await admin
    .from('email_logs')
    .select('id, email_type, status, recipient_email, sender_email, subject, resend_message_id, metadata, company_id, created_at')
    .eq('email_type', 'selection_released')
    .eq('recipient_email', RECIPIENT)
    .order('created_at', { ascending: false });
  return data ?? [];
}

async function sweepLogs() {
  must('sweep logs', (await admin.from('email_logs').delete().eq('email_type', 'selection_released').eq('recipient_email', RECIPIENT)).error);
}

async function sweep(): Promise<void> {
  const { data: sels } = await admin.from('selections').select('id').like('name', `${MARKER}%`);
  const ids = (sels ?? []).map((s) => s.id);
  if (ids.length) {
    await admin.from('notifications').delete().in('source_id', ids).eq('source_table', 'selections');
    await admin.from('selections').update({ signed_session_id: null }).in('id', ids);
    await admin.from('selection_signing_sessions').delete().in('selection_id', ids);
    const { data: opts } = await admin.from('selection_options').select('id').in('selection_id', ids);
    const oids = (opts ?? []).map((o) => o.id);
    if (oids.length) {
      await admin.from('selection_option_amounts').delete().in('option_id', oids);
      await admin.from('selection_options').delete().in('id', oids);
    }
    await admin.from('selection_notes').delete().in('selection_id', ids);
    await admin.from('selection_threads').delete().in('selection_id', ids);
    await admin.from('selections').delete().in('id', ids);
  }
  await admin.from('selection_areas').delete().like('name', `${MARKER}%`);
  await sweepLogs();
}

/** A draft selection with one PRICED option — the release gate's requirement. */
async function makeSelection(name: string): Promise<string> {
  const { data: s, error } = await admin
    .from('selections')
    .insert({ company_id: companyId, project_id: PROJECT, name: `${MARKER} ${name}` })
    .select('id').single();
  must(`selection ${name}`, error);
  const { data: o } = await admin
    .from('selection_options')
    .insert({ company_id: companyId, selection_id: s!.id, name: `${MARKER} ${name} option`, is_chosen: false })
    .select('id').single();
  must(`price ${name}`, (await admin.from('selection_option_amounts')
    .insert({ company_id: companyId, option_id: o!.id, quantity: 1, unit_cost: 100, markup_percent: 10 })).error);
  return s!.id;
}

beforeAll(async () => {
  assertRebuildTest();
  await sweep();
  const { data: co } = await admin.from('companies').select('id, name, slug').eq('name', 'Bishop Contracting').single();
  companyId = co!.id;
  companyName = co!.name;
  companySlug = co!.slug;
  [ownerC, pmC, subC] = (await Promise.all([sessionFor(OWNER), sessionFor(PM), sessionFor(SUB)])) as Client[];
  selA = await makeSelection('countertop');
  selB = await makeSelection('backsplash');
  selSolo = await makeSelection('faucet');
}, 240_000);

afterAll(async () => {
  await sweep();
  const { count } = await admin.from('selections').select('id', { count: 'exact', head: true }).like('name', `${MARKER}%`);
  expect(count, 'selections left behind').toBe(0);
  expect(await logs(), 'email_logs rows left behind').toHaveLength(0);
}, 240_000);

// ───────────────────────────────────────────────────────────────────────────
describe('S174-A — the registry, both halves', () => {
  it('A1 — `selection_released` is a real row in email_types, not just a TypeScript union member', async () => {
    // The half that fails at RUNTIME. `EmailType` is the half that fails at
    // COMPILE time and is asserted by the build, not here. S126 shipped
    // `mention` with only one of the two; both land in one commit now.
    const { data } = await admin.from('email_types').select('email_type').eq('email_type', 'selection_released').maybeSingle();
    expect(data?.email_type).toBe('selection_released');
  });

  it('A2 — the subject and the portal link are pure functions of their inputs, and carry no money', () => {
    expect(buildSelectionsReleasedSubject(companyName, 1)).toBe(`${companyName}: a selection is ready for you to choose`);
    expect(buildSelectionsReleasedSubject(companyName, 4)).toBe(`${companyName}: 4 selections are ready for you to choose`);
    expect(buildSelectionsPortalLink(PROJECT, 'https://example.com/')).toBe(`https://example.com/portal/${PROJECT}/selections`);
    // The destination is the PORTAL, never a token link: a selection is
    // portal-only by ruling and `completeSelectionSignature` has no token arm.
    expect(buildSelectionsPortalLink(PROJECT, 'https://example.com')).not.toContain('/sign');
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('S174-B — a refusal mails nobody', () => {
  it('B1 — a SUB releasing is refused and NO email_logs row appears', async () => {
    state.client = subC;
    const res = await RELEASE(req('/api/selections/release', { ids: [selA] }));
    const body = (await res.json()) as { results: { success: boolean }[] };
    expect(body.results.every((r) => !r.success)).toBe(true);
    // The point of the assertion: an email must not be the one thing that
    // escapes a refused write.
    expect(await logs()).toHaveLength(0);
    expect((await admin.from('selections').select('status').eq('id', selA).single()).data!.status).toBe('draft');
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('S174-C — the BATCH route mails ONCE for N selections', () => {
  it('C1 — ⚠️ THE REGRESSION GUARD: the PM releases two and exactly ONE selection_released row is logged, to the project client', async () => {
    state.client = pmC;
    const res = await RELEASE(req('/api/selections/release', { ids: [selA, selB] }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { results: { id: string; success: boolean; error?: string }[]; emailed: boolean; emailError: string | null };
    expect(body.results.every((r) => r.success), JSON.stringify(body.results)).toBe(true);

    const rows = await logs();
    // ONE row, not two — Josh's S173 ruling that the batch is the DELIVERY
    // unit while the signature stays per-selection. Two rows here would mean
    // the delivery ruling had been quietly undone to satisfy a schema.
    expect(rows, 'one email per RELEASE, not one per selection').toHaveLength(1);
    expect(rows[0].recipient_email).toBe(RECIPIENT);
    expect(rows[0].company_id).toBe(companyId);
    expect(rows[0].sender_email).toBe(`${companyName} <${companySlug}@ezcontractorbinder.com>`);
    expect(rows[0].subject).toBe(buildSelectionsReleasedSubject(companyName, 2));
    // The send was ATTEMPTED: either Resend returned an id, or it returned an
    // error that was recorded. A row with neither would mean logEmail ran
    // without a send in front of it.
    const meta = rows[0].metadata as { selection_ids?: string[]; selection_count?: number; error?: string };
    expect(rows[0].resend_message_id !== null || typeof meta.error === 'string').toBe(true);
    expect(rows[0].status).toBe(rows[0].resend_message_id ? 'sent' : 'failed');
    expect(meta.selection_count).toBe(2);
    expect((meta.selection_ids ?? []).sort()).toEqual([selA, selB].sort());
  });

  it('C2 — and the selections really did release: both awaiting_approval with a pending session each', async () => {
    for (const id of [selA, selB]) {
      const { data: s } = await admin.from('selections').select('status').eq('id', id).single();
      expect(s!.status).toBe('awaiting_approval');
      const { data: ss } = await admin.from('selection_signing_sessions').select('status').eq('selection_id', id);
      expect((ss ?? []).filter((x) => x.status === 'pending')).toHaveLength(1);
    }
  });

  it('C3 — the money never reaches the message: no sell, deduction or variance in the logged subject or metadata', async () => {
    // Under the S173 client-choice model the release stamps NOTHING, so there
    // is no offered figure to quote. A subject or metadata carrying one would
    // mean a figure had been invented at the wrong moment.
    const rows = await logs();
    const blob = `${rows[0].subject} ${JSON.stringify(rows[0].metadata)}`;
    expect(blob).not.toMatch(/\$|sell|variance|markup|deduction/i);
    const { data: s } = await admin.from('selections').select('offered_sell_amount, offered_at').eq('id', selA).single();
    expect(s!.offered_sell_amount).toBeNull();
    expect(s!.offered_at).toBeNull();
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('S174-D — the SINGLE offer route mails through the SAME mechanism', () => {
  it('D1 — one selection offered logs one row, singular subject, same sender', async () => {
    await sweepLogs();
    state.client = ownerC;
    const res = await OFFER(req(`/api/selections/${selSolo}/offer`), { params: { id: selSolo } });
    expect(res.status).toBe(200);
    const rows = await logs();
    expect(rows, 'the single-offer route must mail too — one mechanism, two callers').toHaveLength(1);
    expect(rows[0].subject).toBe(buildSelectionsReleasedSubject(companyName, 1));
    expect(rows[0].sender_email).toBe(`${companyName} <${companySlug}@ezcontractorbinder.com>`);
    const meta = rows[0].metadata as { selection_ids?: string[]; selection_count?: number };
    expect(meta.selection_count).toBe(1);
    expect(meta.selection_ids).toEqual([selSolo]);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('S174-E — a send that cannot happen says so, and does not fabricate a log row', () => {
  it('E1 — a client contact with NO email address: a sentence naming the remedy, no log row, no throw', async () => {
    // The failure mode this replaces is a UI that IMPLIED delivery. It must not
    // be replaced by one that HIDES a non-delivery (invite-email.ts, D2).
    //
    // ⚠️ WHY THE COUNTERFACTUAL IS A MISSING **EMAIL** AND NOT A MISSING
    // CONTACT. `projects.contact_id` is NOT NULL in the schema, so a project
    // with no contact at all is unreachable and a probe for one would be
    // testing a branch that can never fire. The reachable case — and the one
    // Josh will actually meet — is a contact row that carries no address.
    //
    // ⚠️ AND THE FIXTURE IS RESTORED BEFORE ANYTHING IS ASSERTED (S173 ARM
    // 15b). A failed expectation here must not leave the shared QA project's
    // contact stripped of its email for every later harness.
    const { data: proj } = await admin.from('projects').select('contact_id').eq('id', PROJECT).single();
    const contactId = proj!.contact_id;
    const { data: before } = await admin.from('contacts').select('email').eq('id', contactId).single();
    const priorEmail = before!.email;
    const logsBefore = (await logs()).length;

    let r: Awaited<ReturnType<typeof sendSelectionsReleasedEmail>>;
    try {
      must('strip email', (await admin.from('contacts').update({ email: null }).eq('id', contactId)).error);
      r = await sendSelectionsReleasedEmail(ownerC, { projectId: PROJECT, selectionIds: [selSolo], origin: 'https://example.com' });
    } finally {
      must('restore email', (await admin.from('contacts').update({ email: priorEmail }).eq('id', contactId)).error);
    }

    expect(r.emailed).toBe(false);
    expect(r.recipient).toBeNull();
    expect(r.error).toMatch(/no client contact with an email address/i);
    expect(r.error).toMatch(/Set a primary contact on the project/i);
    // No recipient means no row: a log entry with a null recipient would be a
    // record of a send that was never attempted.
    expect(await logs()).toHaveLength(logsBefore);
    // The restore really happened — asserted, not assumed.
    expect((await admin.from('contacts').select('email').eq('id', contactId).single()).data!.email).toBe(priorEmail);
  });

  it('E2 — an empty id list is refused rather than mailing an empty list', async () => {
    const r = await sendSelectionsReleasedEmail(ownerC, { projectId: PROJECT, selectionIds: [], origin: 'https://example.com' });
    expect(r.emailed).toBe(false);
    expect(r.error).toMatch(/No selections/i);
  });
});
