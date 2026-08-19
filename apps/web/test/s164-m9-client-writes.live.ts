/**
 * S164 — Module 9 stage 5. THE CLIENT WRITE SURFACE.
 *
 * Migration: `20261021000000_m9_client_writes.sql`.
 * Services: `portal-writes.ts`, and `co-signing-service.ts`'s caller parameter.
 * Spec: `9-spec.md` §7 (R10, R11, R13), Josh S164 Q6.
 *
 * ============================================================================
 * ⚠️ A WRITE PROBE NEEDS A DIFFERENT COUNTERFACTUAL FROM A READ PROBE
 * ============================================================================
 * A read probe pairs LINKED against CONTROL, because a client reads 0 rows
 * under a correct policy and under no policy at all.
 *
 * A write probe has the opposite hazard: **an INSERT that RLS refuses looks
 * exactly like an INSERT the test forgot to make.** So each write is asserted
 * three ways:
 *
 *   LINKED writes it            the arm grants
 *   CONTROL is REFUSED          the arm is scoped to a real client
 *   the row is READ BACK        the write landed, and landed where it should
 *
 * And for the two arms that exist to keep somebody OUT — the foreman and crew
 * exclusion from the client thread — the pair is a role who CAN see the crew
 * thread proving they still can, beside the same role failing on the client
 * one. Without that half, a gate that broke chat entirely would pass.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { admin, assertRebuildTest, sessionFor } from './live-session';

const LINKED = 'josh+qa-client-linked@worthprop.com';
const CONTROL = 'josh+qa-client@worthprop.com';
const OWNER = 'josh+test50@worthprop.com';
const FOREMAN = 'josh+qa-foreman@worthprop.com';
const CREW = 'josh+crew@worthprop.com';
const SUB = 'josh+qa-sub@worthprop.com';

let linked: SupabaseClient;
let control: SupabaseClient;
let owner: SupabaseClient;
let foreman: SupabaseClient;
let crew: SupabaseClient;
let sub: SupabaseClient;

let companyId: string;
let linkedProfileId: string;
let projectId: string;
let clientThreadId: string;

const made = { messages: [] as string[], files: [] as string[], threads: [] as string[] };

beforeAll(async () => {
  assertRebuildTest();
  [linked, control, owner, foreman, crew, sub] = await Promise.all([
    sessionFor(LINKED),
    sessionFor(CONTROL),
    sessionFor(OWNER),
    sessionFor(FOREMAN),
    sessionFor(CREW),
    sessionFor(SUB),
  ]);

  const { data: lp } = await admin
    .from('profiles').select('id, company_id, contact_id').eq('email', LINKED).single();
  const l = lp as { id: string; company_id: string; contact_id: string | null };
  if (!l.contact_id) throw new Error(`${LINKED} is unlinked — run the seed.`);
  linkedProfileId = l.id;
  companyId = l.company_id;

  const { data: inv } = await admin
    .from('invoices').select('project_id')
    .eq('company_id', companyId).eq('title', 'QA M9 — full_detail bill').single();
  projectId = (inv as { project_id: string }).project_id;
});

afterAll(async () => {
  if (made.messages.length) {
    await admin.from('chat_message_photos').delete().in('message_id', made.messages);
    await admin.from('chat_messages').delete().in('id', made.messages);
  }
  if (made.files.length) await admin.from('files').delete().in('id', made.files);
});

// ───────────────────────────────────────────────────────────────────────────
describe('W1 — the thread: she can open one, and it is a `client` thread', () => {
  it('W1a — LINKED creates or finds the client thread', async () => {
    const { data: existing } = await linked
      .from('chat_threads').select('id')
      .eq('project_id', projectId).eq('kind', 'client').maybeSingle();

    if (existing) {
      clientThreadId = (existing as { id: string }).id;
    } else {
      const { data, error } = await linked
        .from('chat_threads')
        .insert({ project_id: projectId, kind: 'client' })
        .select('id')
        .single();
      expect(error, `thread insert refused: ${error?.message}`).toBeNull();
      clientThreadId = (data as { id: string }).id;
      made.threads.push(clientThreadId);
    }
    expect(clientThreadId).toBeTruthy();
  });

  it('W1b — CONTROL cannot open one on the same project', async () => {
    const { error } = await control
      .from('chat_threads')
      .insert({ project_id: projectId, kind: 'client' })
      .select('id');
    expect(error, 'the unlinked control was allowed to open a thread').not.toBeNull();
  });

  it('W1c — ⚠️ and she cannot open a CREW thread, which is the one that matters', async () => {
    // The restrictive gate keeps staff out of `client`. This is the other
    // direction: nothing in it lets her into `crew`, where the office talks
    // about her job among themselves.
    const { error } = await linked
      .from('chat_threads')
      .insert({ project_id: projectId, kind: 'crew' })
      .select('id');
    expect(error, 'a client opened a CREW thread').not.toBeNull();
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('W2 — R11: one message, and the photo rides on it', () => {
  let messageId: string;
  let fileId: string;

  it('W2a — LINKED posts a message to her thread', async () => {
    const { data, error } = await linked
      .from('chat_messages')
      .insert({
        thread_id: clientThreadId,
        author_profile_id: linkedProfileId,
        body: 'QA M9 — is this the right tile?',
      })
      .select('id')
      .single();
    expect(error, `message refused: ${error?.message}`).toBeNull();
    messageId = (data as { id: string }).id;
    made.messages.push(messageId);
  });

  it('W2b — ⚠️ she cannot post it as SOMEBODY ELSE', async () => {
    const { data: ownerProfile } = await admin
      .from('profiles').select('id').eq('email', OWNER).single();
    const { error } = await linked
      .from('chat_messages')
      .insert({
        thread_id: clientThreadId,
        author_profile_id: (ownerProfile as { id: string }).id,
        body: 'QA M9 — forged attribution',
      })
      .select('id');
    expect(error, 'a client posted a message attributed to the owner').not.toBeNull();
  });

  it('W2c — R11: her photo row is client-visible BY THE POLICY, not by the caller', async () => {
    // The insert deliberately omits `client_visible`, which defaults to false.
    // The WITH CHECK must refuse it — otherwise she posts a photo into her own
    // thread and cannot see it.
    const path = `${companyId}/${projectId}/qa-m9-write-${Date.now()}.jpg`;
    const { error: refused } = await linked
      .from('files')
      .insert({
        project_id: projectId,
        category: 'photos',
        file_name: 'qa-m9-write.jpg',
        file_path: path,
        file_size: 10,
        mime_type: 'image/jpeg',
      })
      .select('id');
    expect(refused, 'a client photo was accepted with client_visible = false').not.toBeNull();

    // ...and with it set, the same insert lands.
    const { data, error } = await linked
      .from('files')
      .insert({
        project_id: projectId,
        category: 'photos',
        file_name: 'qa-m9-write.jpg',
        file_path: path,
        file_size: 10,
        mime_type: 'image/jpeg',
        client_visible: true,
      })
      .select('id')
      .single();
    expect(error, `client photo row refused: ${error?.message}`).toBeNull();
    fileId = (data as { id: string }).id;
    made.files.push(fileId);
  });

  it('W2d — ⚠️ and she cannot file a CONTRACT into her own project', async () => {
    const { error } = await linked
      .from('files')
      .insert({
        project_id: projectId,
        category: 'contracts',
        file_name: 'qa-m9-fake-contract.pdf',
        file_path: `${companyId}/${projectId}/qa-m9-fake-${Date.now()}.pdf`,
        file_size: 10,
        mime_type: 'application/pdf',
        client_visible: true,
      })
      .select('id');
    expect(error, 'a client inserted a file in the contracts category').not.toBeNull();
  });

  it('W2e — the photo attaches to HER message, and to nobody else’s', async () => {
    const { error } = await linked
      .from('chat_message_photos')
      .insert({ message_id: messageId, file_id: fileId, sort_order: 0 })
      .select('id');
    expect(error, `attach refused: ${error?.message}`).toBeNull();

    // A staff message in the same thread — she must not be able to hang a
    // photo off it.
    const { data: staffMsg } = await admin
      .from('chat_messages')
      .insert({
        company_id: companyId,
        thread_id: clientThreadId,
        author_profile_id: (await admin.from('profiles').select('id').eq('email', OWNER).single())
          .data!.id as string,
        body: 'QA M9 — office reply',
      })
      .select('id')
      .single();
    const staffId = (staffMsg as { id: string }).id;
    made.messages.push(staffId);

    const { error: refused } = await linked
      .from('chat_message_photos')
      .insert({ message_id: staffId, file_id: fileId, sort_order: 0 })
      .select('id');
    expect(refused, 'a client attached a photo to the office’s message').not.toBeNull();
  });

  it('W2f — CONTROL can post nothing to the thread', async () => {
    const { error } = await control
      .from('chat_messages')
      .insert({ thread_id: clientThreadId, author_profile_id: linkedProfileId, body: 'nope' })
      .select('id');
    expect(error).not.toBeNull();
  });

  it('W2g — and she reads the whole exchange back, hers and the office’s', async () => {
    const { data } = await linked
      .from('chat_messages').select('id, body').eq('thread_id', clientThreadId);
    const bodies = ((data ?? []) as { body: string }[]).map((r) => r.body);
    expect(bodies).toContain('QA M9 — is this the right tile?');
    expect(bodies, 'a thread she cannot hear a reply in is a drop box').toContain(
      'QA M9 — office reply'
    );
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('W3 — ⚠️ THE GATE: a third `kind` must not widen the first two', () => {
  it('W3a — the OWNER reads and replies in the client thread (R11)', async () => {
    const { data } = await owner
      .from('chat_messages').select('id').eq('thread_id', clientThreadId);
    expect((data ?? []).length, 'the office must be able to see it').toBeGreaterThan(0);
  });

  for (const [label, get] of [
    ['foreman', () => foreman],
    ['crew', () => crew],
    ['subcontractor', () => sub],
  ] as const) {
    it(`W3b-${label} — cannot read the client thread`, async () => {
      const c = get();
      const { data: threads } = await c
        .from('chat_threads').select('id').eq('id', clientThreadId);
      expect(threads ?? [], `${label} read the client THREAD`).toHaveLength(0);

      const { data: msgs } = await c
        .from('chat_messages').select('id').eq('thread_id', clientThreadId);
      expect(msgs ?? [], `${label} read the client MESSAGES`).toHaveLength(0);
    });
  }

  it('W3c — ⚠️ and the CREW thread still works for a foreman, which is the pair', async () => {
    // Without this, a restrictive gate that closed chat entirely would pass
    // every assertion above. The gate is `kind <> ''client'' OR ...`, so this
    // is what proves the escape clause is doing its job.
    const { data: crewThread } = await admin
      .from('chat_threads').select('id')
      .eq('project_id', projectId).eq('kind', 'crew').maybeSingle();

    if (!crewThread) {
      // Make one as the owner so the assertion is never vacuous.
      const { data: created } = await owner
        .from('chat_threads').insert({ project_id: projectId, kind: 'crew' })
        .select('id').single();
      expect(created, 'could not create a crew thread for the counterfactual').toBeTruthy();
    }

    const { data: t } = await foreman
      .from('chat_threads').select('id, kind')
      .eq('project_id', projectId).eq('kind', 'crew');
    expect((t ?? []).length, 'the gate broke the CREW thread for a foreman').toBeGreaterThan(0);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('W4 — R10/Q6: one write path, distinguishable callers', () => {
  it('W4a — the CHECK refuses a portal signature with nobody signed in', async () => {
    const { data: co } = await admin
      .from('change_orders').select('id, company_id')
      .eq('company_id', companyId).eq('title', 'QA M9 — sent CO').single();

    const { error } = await admin
      .from('co_signing_sessions')
      .insert({
        company_id: (co as { company_id: string }).company_id,
        change_order_id: (co as { id: string }).id,
        token: crypto.randomUUID(),
        expires_at: new Date(Date.now() + 86400000).toISOString(),
        signer_channel: 'portal_session',
        signer_profile_id: null,
      })
      .select('id');
    expect(error, 'a portal signature was recorded with no profile').not.toBeNull();
    expect(error!.message).toMatch(/channel_shape|violates check/i);
  });

  it('W4b — and refuses a token signature that claims a profile', async () => {
    const { data: co } = await admin
      .from('change_orders').select('id, company_id')
      .eq('company_id', companyId).eq('title', 'QA M9 — sent CO').single();

    const { error } = await admin
      .from('co_signing_sessions')
      .insert({
        company_id: (co as { company_id: string }).company_id,
        change_order_id: (co as { id: string }).id,
        token: crypto.randomUUID(),
        expires_at: new Date(Date.now() + 86400000).toISOString(),
        signer_channel: 'token_link',
        signer_profile_id: linkedProfileId,
      })
      .select('id');
    expect(error, 'a token signature was allowed to name a profile').not.toBeNull();
  });

  it('W4c — ⚠️ and the two entries call ONE function, asserted in the source', async () => {
    // §7.1's whole warning. A portal-specific reimplementation would pass every
    // behavioural probe in this file and silently skip the v2 PDF, the budget
    // lines and the notifications.
    const strip = (s: string) =>
      s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const portalWrites = strip(
      readFileSync(new URL('../lib/services/portal-writes.ts', import.meta.url), 'utf8')
    );
    expect(portalWrites).toContain('completeCoSignature');
    // The things a reimplementation would have had to do for itself.
    expect(portalWrites).not.toContain('apply_change_order_budget');
    expect(portalWrites).not.toContain('generateChangeOrderPDF');
    expect(portalWrites).not.toContain("status: 'signed'");
  });

  it('W4d — the token route names its caller too, so neither is the default', async () => {
    const src = readFileSync(
      new URL('../app/api/sign-co/[token]/complete/route.ts', import.meta.url),
      'utf8'
    );
    expect(src).toContain("caller: { kind: 'token_link' }");
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('W5 — storage: her upload, and only into her own project', () => {
  const bytes = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);

  it('W5a — LINKED can upload into a project she is a client of', async () => {
    const path = `${companyId}/${projectId}/qa-m9-upload-${Date.now()}.jpg`;
    const { error } = await linked.storage
      .from('project-files')
      .upload(path, bytes, { contentType: 'image/jpeg' });
    expect(error, `upload refused: ${error?.message}`).toBeNull();
    await admin.storage.from('project-files').remove([path]);
  });

  it('W5b — ⚠️ and NOT into a project she is not on', async () => {
    const { data: mine } = await linked.from('projects').select('id');
    const myIds = ((mine ?? []) as { id: string }[]).map((r) => r.id);
    const { data: other } = await admin
      .from('projects').select('id')
      .eq('company_id', companyId).eq('is_deleted', false)
      .not('id', 'in', `(${myIds.join(',')})`)
      .limit(1)
      .single();
    const strangerId = (other as { id: string }).id;

    const path = `${companyId}/${strangerId}/qa-m9-intrusion-${Date.now()}.jpg`;
    const { error } = await linked.storage
      .from('project-files')
      .upload(path, bytes, { contentType: 'image/jpeg' });
    expect(error, 'a client uploaded into a project she is not on').not.toBeNull();
  });

  it('W5c — CONTROL can upload nowhere', async () => {
    const path = `${companyId}/${projectId}/qa-m9-control-${Date.now()}.jpg`;
    const { error } = await control.storage
      .from('project-files')
      .upload(path, bytes, { contentType: 'image/jpeg' });
    expect(error).not.toBeNull();
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('W6 — R17 closes the writes as well as the reads', () => {
  it('W6a — a deactivated client cannot post', async () => {
    try {
      await admin.from('profiles')
        .update({ client_access_state: 'deactivated' }).eq('id', linkedProfileId);
      const fresh = await sessionFor(LINKED);
      const { error } = await fresh
        .from('chat_messages')
        .insert({
          thread_id: clientThreadId,
          author_profile_id: linkedProfileId,
          body: 'QA M9 — should be refused',
        })
        .select('id');
      expect(error, 'a deactivated client posted a message').not.toBeNull();
    } finally {
      await admin.from('profiles')
        .update({ client_access_state: 'active' }).eq('id', linkedProfileId);
    }
  });

  it('W6b — nor can a documents-only client', async () => {
    try {
      await admin.from('profiles')
        .update({ client_access_state: 'signed_documents_only' }).eq('id', linkedProfileId);
      const fresh = await sessionFor(LINKED);
      const { error } = await fresh
        .from('chat_messages')
        .insert({
          thread_id: clientThreadId,
          author_profile_id: linkedProfileId,
          body: 'QA M9 — should be refused',
        })
        .select('id');
      expect(error).not.toBeNull();
    } finally {
      await admin.from('profiles')
        .update({ client_access_state: 'active' }).eq('id', linkedProfileId);
    }
  });

  it('W6c — and posting works again once she is active', async () => {
    const fresh = await sessionFor(LINKED);
    const { data, error } = await fresh
      .from('chat_messages')
      .insert({
        thread_id: clientThreadId,
        author_profile_id: linkedProfileId,
        body: 'QA M9 — restored',
      })
      .select('id')
      .single();
    expect(error).toBeNull();
    made.messages.push((data as { id: string }).id);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('W7 — R10 END TO END: a real portal signature through the shared write', () => {
  /**
   * ⚠️ THE ONLY PROBE THAT PROVES THE FEATURE RATHER THAN THE POLICY.
   *
   * Everything above asserts arms and shapes. This signs an actual change order
   * as an actual signed-in client, through `signChangeOrderFromPortal()` →
   * `completeCoSignature()`, and then checks the consequences that a
   * portal-specific reimplementation would have silently skipped:
   *
   *   the CO flips to `signed`                — the binding act
   *   `signer_channel = 'portal_session'`     — Q6, the evidence
   *   `signer_profile_id` is HER profile      — Q6, the account
   *   the consent text names the channel      — Q6, "the consent record must
   *                                             be able to say which"
   *
   * It works on a CO of its own, created and destroyed here, so the seeded
   * `QA M9 — sent CO` stays `sent` — the read arms' draft/sent counterfactual
   * depends on it and would quietly weaken if this signed that one instead.
   */
  let coId: string | null = null;

  afterAll(async () => {
    if (!coId) return;
    await admin.from('co_signing_sessions').delete().eq('change_order_id', coId);
    await admin.from('project_budget_items').delete().eq('source_change_order_id', coId);
    await admin.from('change_order_line_items').delete().eq('change_order_id', coId);
    await admin.from('change_orders').delete().eq('id', coId);
  });

  it('W7a — she signs it, and the CO becomes signed', async () => {
    const { data: template } = await admin
      .from('change_orders').select('author_member_id, pricing_mode')
      .eq('company_id', companyId).eq('title', 'QA M9 — sent CO').single();
    const t = template as { author_member_id: string; pricing_mode: string };

    const { data: co, error: coErr } = await admin
      .from('change_orders')
      .insert({
        company_id: companyId,
        project_id: projectId,
        co_number: `CO-QA-M9-SIGN-${Date.now()}`,
        title: 'QA M9 — portal signature subject',
        co_type: 'fixed_price',
        author_member_id: t.author_member_id,
        pricing_mode: t.pricing_mode,
        status: 'draft',
        net_delta: 500,
      })
      .select('id')
      .single();
    expect(coErr, `could not create the CO: ${coErr?.message}`).toBeNull();
    coId = (co as { id: string }).id;

    await admin.from('change_orders').update({ status: 'sent' }).eq('id', coId);

    const { signChangeOrderFromPortal } = await import('@/lib/services/portal-writes');
    const result = await signChangeOrderFromPortal(linked as never, {
      changeOrderId: coId,
      profileId: linkedProfileId,
      contactEmail: 'qa-client-a@example.invalid',
      signature: {
        signatureType: 'type',
        signatureData:
          'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        signerName: 'QA ClientA',
        signerIp: '203.0.113.7',
        signerUserAgent: 'vitest/portal',
      },
    });
    expect(result.error ?? null, `signature refused: ${result.error}`).toBeNull();
    expect(result.success).toBe(true);

    const { data: after } = await admin
      .from('change_orders').select('status, signed_at').eq('id', coId).single();
    expect((after as { status: string }).status).toBe('signed');
    expect((after as { signed_at: string | null }).signed_at).toBeTruthy();
  }, 90_000);

  it('W7b — ⚠️ and the record says WHICH caller signed it [Q6]', async () => {
    expect(coId, 'W7a did not run').toBeTruthy();
    const { data } = await admin
      .from('co_signing_sessions')
      .select('status, signer_channel, signer_profile_id, consent_text, signer_ip')
      .eq('change_order_id', coId!)
      .eq('status', 'completed')
      .single();

    const s = data as {
      signer_channel: string;
      signer_profile_id: string;
      consent_text: string;
      signer_ip: string;
    };
    expect(s.signer_channel).toBe('portal_session');
    expect(s.signer_profile_id).toBe(linkedProfileId);
    expect(s.signer_ip).toBe('203.0.113.7');
    // "The consent record must be able to say which" — on its own, without a
    // reader having to join it to signer_channel.
    expect(s.consent_text).toMatch(/signed in to my client portal account/i);
  });

  it('W7c — ⚠️ and a CONTROL client cannot sign it at all', async () => {
    // Re-armed on a second CO, because W7a's is now signed. Without this the
    // whole of W7 would prove only that SOMEBODY can sign.
    const { data: template } = await admin
      .from('change_orders').select('author_member_id, pricing_mode')
      .eq('company_id', companyId).eq('title', 'QA M9 — sent CO').single();
    const t = template as { author_member_id: string; pricing_mode: string };

    const { data: co } = await admin
      .from('change_orders')
      .insert({
        company_id: companyId,
        project_id: projectId,
        co_number: `CO-QA-M9-DENY-${Date.now()}`,
        title: 'QA M9 — control must not sign this',
        co_type: 'fixed_price',
        author_member_id: t.author_member_id,
        pricing_mode: t.pricing_mode,
        status: 'draft',
        net_delta: 100,
      })
      .select('id')
      .single();
    const denyId = (co as { id: string }).id;
    await admin.from('change_orders').update({ status: 'sent' }).eq('id', denyId);

    try {
      const { signChangeOrderFromPortal } = await import('@/lib/services/portal-writes');
      const result = await signChangeOrderFromPortal(control as never, {
        changeOrderId: denyId,
        profileId: 'e5e0a1f8-0000-0000-0000-000000000000',
        contactEmail: null,
        signature: {
          signatureType: 'type',
          signatureData: 'data:image/png;base64,AA==',
          signerName: 'Not Her',
          signerIp: null,
          signerUserAgent: null,
        },
      });
      expect(result.success, 'the unlinked control signed a change order').toBe(false);
      expect(result.error).toMatch(/could not be found/i);

      const { data: still } = await admin
        .from('change_orders').select('status').eq('id', denyId).single();
      expect((still as { status: string }).status).toBe('sent');
    } finally {
      await admin.from('co_signing_sessions').delete().eq('change_order_id', denyId);
      await admin.from('change_orders').delete().eq('id', denyId);
    }
  }, 60_000);
});

// ───────────────────────────────────────────────────────────────────────────
describe('W8 — 🔴 the signature stamp: the regression guard for a LIVE defect', () => {
  /**
   * Migration `20261022000000_co_signature_stamp_fix.sql`.
   *
   * ⚠️ NOT AN M9 BUG, AND M9 IS WHY IT WAS FOUND. `enforce_change_order_
   * immutability()` froze `signed_at` outright, so the FIRST stamp — which IS
   * the client's signature — was refused on every sent change order from
   * 2026-08-09 onward. `/sign-co/[token]` returned 409 to every client who
   * clicked Sign, and nothing in the suite ran that write: one test inserts a
   * `signed` row directly, another asserts the refusal of a REWRITE and passes
   * correctly. The act between them was uncovered.
   *
   * These three cases are what was missing. W7 proves the flow; this proves the
   * rule the flow depends on, in both directions, so it cannot be re-broken by
   * someone tightening the trigger again.
   */
  let coId: string;

  beforeAll(async () => {
    const { data: template } = await admin
      .from('change_orders').select('author_member_id, pricing_mode')
      .eq('company_id', companyId).eq('title', 'QA M9 — sent CO').single();
    const t = template as { author_member_id: string; pricing_mode: string };

    const { data: co } = await admin
      .from('change_orders')
      .insert({
        company_id: companyId,
        project_id: projectId,
        co_number: `CO-QA-M9-STAMP-${Date.now()}`,
        title: 'QA M9 — stamp regression subject',
        co_type: 'fixed_price',
        author_member_id: t.author_member_id,
        pricing_mode: t.pricing_mode,
        status: 'draft',
        net_delta: 1,
      })
      .select('id')
      .single();
    coId = (co as { id: string }).id;
    await admin.from('change_orders').update({ status: 'sent' }).eq('id', coId);
  });

  afterAll(async () => {
    if (coId) await admin.from('change_orders').delete().eq('id', coId);
  });

  it('W8a — ⚠️ the FIRST stamp is allowed, on the transition into `signed`', async () => {
    const { error } = await admin
      .from('change_orders')
      .update({ status: 'signed', signed_at: new Date().toISOString() })
      .eq('id', coId)
      .eq('status', 'sent');
    expect(error, `the signing write is refused again: ${error?.message}`).toBeNull();

    const { data } = await admin
      .from('change_orders').select('status, signed_at').eq('id', coId).single();
    expect((data as { status: string }).status).toBe('signed');
    expect((data as { signed_at: string | null }).signed_at).toBeTruthy();
  });

  it('W8b — and a REWRITE is still refused, which is what the rule says', async () => {
    const { error } = await admin
      .from('change_orders')
      .update({ signed_at: new Date(Date.now() - 86400000).toISOString() })
      .eq('id', coId);
    expect(error, 'a signature stamp was rewritten').not.toBeNull();
    expect(error!.message).toMatch(/cannot be rewritten/i);
  });

  it('W8c — ⚠️ and a stamp WITHOUT the status is refused: a date attached to nothing', async () => {
    const { data: template } = await admin
      .from('change_orders').select('author_member_id, pricing_mode')
      .eq('company_id', companyId).eq('title', 'QA M9 — sent CO').single();
    const t = template as { author_member_id: string; pricing_mode: string };

    const { data: co } = await admin
      .from('change_orders')
      .insert({
        company_id: companyId,
        project_id: projectId,
        co_number: `CO-QA-M9-STAMP2-${Date.now()}`,
        title: 'QA M9 — stamp without status',
        co_type: 'fixed_price',
        author_member_id: t.author_member_id,
        pricing_mode: t.pricing_mode,
        status: 'draft',
        net_delta: 1,
      })
      .select('id')
      .single();
    const id = (co as { id: string }).id;
    await admin.from('change_orders').update({ status: 'sent' }).eq('id', id);

    try {
      const { error } = await admin
        .from('change_orders')
        .update({ signed_at: new Date().toISOString() })
        .eq('id', id);
      expect(error, 'a sent CO took a signature date without being signed').not.toBeNull();
      expect(error!.message).toMatch(/without being signed/i);
    } finally {
      await admin.from('change_orders').delete().eq('id', id);
    }
  });
});
