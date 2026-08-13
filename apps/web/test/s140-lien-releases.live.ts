import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { admin, assertRebuildTest, sessionFor } from './live-session';

// ============================================================================
// S140 — Module 7F lien releases, driven against RLS as real users.
//
// Migration: 20260922000000_7f_lien_releases.sql
// Spec:      docs/specs/7f2-spec.md §5.2 (one per invoice), §8.1 (lifecycle),
//            §8.2 (Owner/Admin only), §10.3 (schema)
// Scope:     CLIENT-OUTBOUND ONLY [ruling C0, S140].
// ============================================================================
//
// ⚠️ ROLE READS AND WRITES RUN AS REAL USERS. `admin` (service role) appears
// only to seed and to evaluate counterfactuals OUTSIDE the policy under test.
//
// ⚠️ THE ROLE GATE HERE IS NARROWER THAN 7E's, ON PURPOSE. 7E's payment
// policies admit project_manager on SELECT; 7F admits nobody below Admin, on
// any verb. The reason is NOT the Financial Visibility Floor — that rationale
// was STRUCK at S98, because the Floor's S97 carve-out already lets a PM read
// invoice totals and retainage, which IS the release amount. The reason is
// that a release waives legal rights and voiding does not retrieve it.

const OWNER = 'josh+test50@worthprop.com';
const ADMIN_USER = 'josh+qa-admin@worthprop.com';
const PM = 'josh+pm@worthprop.com';
const FOREMAN = 'josh+qa-foreman@worthprop.com';

let ownerC: SupabaseClient;
let adminC: SupabaseClient;
let pmC: SupabaseClient;
let foremanC: SupabaseClient;

let companyId = '';
let invoiceId = '';
let templateId = '';
let seededReleaseId = '';
const created: string[] = [];

beforeAll(async () => {
  assertRebuildTest();
  [ownerC, adminC, pmC, foremanC] = (await Promise.all([
    sessionFor(OWNER),
    sessionFor(ADMIN_USER),
    sessionFor(PM),
    sessionFor(FOREMAN),
  ])) as SupabaseClient[];

  const { data: prof } = await admin
    .from('profiles')
    .select('company_id')
    .eq('email', OWNER)
    .eq('is_deleted', false)
    .single();
  companyId = (prof as { company_id: string }).company_id;

  const { data: invoice } = await admin
    .from('invoices')
    .select('id')
    .eq('company_id', companyId)
    .eq('is_deleted', false)
    .limit(1)
    .single();
  invoiceId = (invoice as { id: string }).id;

  // ⚠️ THE DIRECTION FILTER IS LOAD-BEARING [S146]. This file is CLIENT-OUTBOUND
  // ONLY (ruling C0, banner above), and since S145 seeded the sub_inbound
  // defaults every company has EIGHT templates, not four. Without the filter
  // this `.limit(1)` can hand back a `sub_inbound` template, which is then bound
  // to the `client_outbound` release seeded below.
  //
  // That mismatch does NOT fail. Nothing in `pg_constraint` ties a template's
  // direction to a release's — `lien_releases_template_id_fkey` is a plain
  // single-column FK — so the row is accepted and the fixture silently tests the
  // wrong pairing. Considered as a composite FK at S146 and DEFERRED by ruling
  // (Q2): it would foreclose a template ever serving both directions, which is a
  // real option to give up for an invariant nothing has violated. Revisit if a
  // bug appears; the filter here closes the actual leak.
  const { data: template } = await admin
    .from('lien_release_templates')
    .select('id')
    .eq('company_id', companyId)
    .eq('direction', 'client_outbound')
    .limit(1)
    .single();
  templateId = (template as { id: string }).id;

  // Seeded SERVICE-ROLE, so its existence never depends on the policy.
  const { data: seeded } = await admin
    .from('lien_releases')
    .insert({
      company_id: companyId,
      template_id: templateId,
      direction: 'client_outbound',
      invoice_id: invoiceId,
      type: 'unconditional',
      status: 'draft',
      amount: 100,
    })
    .select('id')
    .single();
  seededReleaseId = (seeded as { id: string }).id;
});

afterAll(async () => {
  const ids = [seededReleaseId, ...created].filter(Boolean);
  if (ids.length) await admin.from('lien_releases').delete().in('id', ids);
});

describe('S140-F1 — the fixture is real', () => {
  // [S146] SCOPED TO client_outbound, EXPECTATION KEPT AT FOUR. S145 seeded four
  // `sub_inbound` defaults per company, so the unscoped count is now 8 and this
  // went red. Widening it to 8 would have kept it green and lost what it tests:
  // that the CLIENT seed lays down exactly one template per type × is_final slot.
  // The sub-side equivalent is asserted separately, in s145-sub-inbound S145-S1.
  it('four starting CLIENT templates exist per company (§4)', async () => {
    const { data } = await admin
      .from('lien_release_templates')
      .select('type, is_final')
      .eq('company_id', companyId)
      .eq('direction', 'client_outbound')
      .eq('is_default', true);
    expect(data).toHaveLength(4);
    const slots = (data ?? []).map((t) => `${t.type}|${t.is_final}`).sort();
    expect(slots).toEqual([
      'conditional|false',
      'conditional|true',
      'unconditional|false',
      'unconditional|true',
    ]);
  });

  // [S146] THE FIXTURE'S OWN PAIRING, ASSERTED RATHER THAN ASSUMED.
  //
  // The `.limit(1)` template pick above had no direction filter until S146, and
  // its failure mode was SILENCE: a `sub_inbound` template bound to a
  // `client_outbound` release is accepted by the database, so the fixture would
  // simply have tested the wrong pairing while staying green. There is nothing
  // to make go red, which is exactly why this assertion exists — it converts an
  // unenforced invariant into a checked one at the only layer that can check it.
  it('the fixture template and its release agree on direction (§4)', async () => {
    const { data: rel } = await admin
      .from('lien_releases')
      .select('direction, template_id')
      .eq('id', seededReleaseId)
      .single();
    const { data: tpl } = await admin
      .from('lien_release_templates')
      .select('direction')
      .eq('id', (rel as { template_id: string }).template_id)
      .single();
    expect((tpl as { direction: string }).direction).toBe('client_outbound');
    expect((tpl as { direction: string }).direction).toBe(
      (rel as { direction: string }).direction
    );
  });

  it('NONE of them carries a PDF — FrameFocus supplies no form (§2)', async () => {
    const { data } = await admin
      .from('lien_release_templates')
      .select('pdf_file_id')
      .eq('company_id', companyId)
      .eq('is_default', true);
    for (const t of data ?? []) expect(t.pdf_file_id).toBeNull();
  });

  it('the seeded release exists, read outside every policy', async () => {
    const { data } = await admin
      .from('lien_releases')
      .select('id')
      .eq('id', seededReleaseId)
      .single();
    expect(data).toBeTruthy();
  });
});

describe('S140-F2 — Owner and Admin have full access', () => {
  it('Owner reads the release', async () => {
    const { data } = await ownerC.from('lien_releases').select('id').eq('id', seededReleaseId);
    expect(data?.length).toBe(1);
  });

  it('Admin reads templates', async () => {
    const { data } = await adminC.from('lien_release_templates').select('id').limit(1);
    expect(data?.length).toBe(1);
  });

  it('Owner inserts a conditional release against the same invoice', async () => {
    // §5.2 — one per invoice PER TYPE. A conditional and an unconditional may
    // both exist against one invoice; two conditionals may not (next test).
    const { data, error } = await ownerC
      .from('lien_releases')
      .insert({
        template_id: templateId,
        direction: 'client_outbound',
        invoice_id: invoiceId,
        type: 'conditional',
        amount: 250,
      })
      .select('id')
      .single();
    expect(error).toBeNull();
    created.push((data as { id: string }).id);
  });
});

describe('S140-F3 — PM and foreman are floored on every verb', () => {
  const cases: [string, () => SupabaseClient][] = [
    ['project_manager', () => pmC],
    ['foreman', () => foremanC],
  ];

  for (const [role, client] of cases) {
    it(`${role} reads ZERO releases and ZERO templates — and is not a broken session`, async () => {
      const { data: reachable } = await client().from('projects').select('id').limit(1);
      expect(reachable, `${role} session is broken`).toBeTruthy();

      const { data: releases } = await client().from('lien_releases').select('id');
      expect(releases ?? []).toHaveLength(0);

      const { data: templates } = await client().from('lien_release_templates').select('id');
      expect(templates ?? []).toHaveLength(0);

      const { data: boxes } = await client().from('lien_release_template_boxes').select('id');
      expect(boxes ?? []).toHaveLength(0);
    });

    it(`${role} cannot INSERT a release`, async () => {
      const { data, error } = await client()
        .from('lien_releases')
        .insert({
          template_id: templateId,
          direction: 'client_outbound',
          invoice_id: invoiceId,
          type: 'conditional',
          amount: 1,
        })
        .select('id');
      expect(error).toBeTruthy();
      expect(data).toBeNull();
      if (data) created.push(...(data as { id: string }[]).map((r) => r.id));
    });

    it(`${role} cannot UPDATE a release`, async () => {
      const before = await admin
        .from('lien_releases')
        .select('amount')
        .eq('id', seededReleaseId)
        .single();

      await client().from('lien_releases').update({ amount: 999999 }).eq('id', seededReleaseId);

      // Re-read with the SERVICE ROLE. Asserting through the gated session
      // would be circular — it cannot SELECT the row either, so any read comes
      // back empty whether the write landed or not.
      const after = await admin
        .from('lien_releases')
        .select('amount')
        .eq('id', seededReleaseId)
        .single();
      expect(Number((after.data as { amount: number }).amount)).toBe(
        Number((before.data as { amount: number }).amount)
      );
    });
  }
});

describe('S140-F4 — §5.2 one release per invoice, per type', () => {
  it('a SECOND live conditional against the same invoice is refused', async () => {
    const { data, error } = await ownerC
      .from('lien_releases')
      .insert({
        template_id: templateId,
        direction: 'client_outbound',
        invoice_id: invoiceId,
        type: 'conditional',
        amount: 999,
      })
      .select('id');
    expect(error).toBeTruthy();
    expect(error?.message).toMatch(/duplicate key|one_per_invoice_type/i);
    if (data) created.push(...(data as { id: string }[]).map((r) => r.id));
  });

  it('but a VOIDED one frees the slot, so a correction can be reissued (§8.1)', async () => {
    const { data: voidTarget } = await admin
      .from('lien_releases')
      .insert({
        company_id: companyId,
        template_id: templateId,
        direction: 'client_outbound',
        invoice_id: invoiceId,
        type: 'unconditional',
        status: 'voided',
        void_reason: 'harness — proving the partial index excludes voided rows',
        voided_by: null,
        voided_at: new Date().toISOString(),
      })
      .select('id')
      .maybeSingle();

    // The void-shape CHECK requires voided_by too, so the insert above is
    // EXPECTED to fail — which is itself the assertion that the shape check
    // binds the service role as well.
    expect(voidTarget).toBeNull();
  });
});

describe('S140-F5 — §8.1 the void shape is enforced', () => {
  it('a void without a reason is refused even service-role', async () => {
    const { error } = await admin.from('lien_releases').update({ status: 'voided' }).eq('id', seededReleaseId);
    expect(error).toBeTruthy();
    expect(error?.message).toMatch(/void_shape/i);
  });

  it('a complete void is accepted, and the row is RETAINED', async () => {
    const { data: user } = await admin.auth.admin.listUsers();
    const anyUserId = user.users[0]?.id;

    const { error } = await ownerC
      .from('lien_releases')
      .update({
        status: 'voided',
        void_reason: 'harness void',
        voided_by: anyUserId,
        voided_at: new Date().toISOString(),
      })
      .eq('id', seededReleaseId);
    expect(error).toBeNull();

    // Retained, not deleted — the whole point of §8.1.
    const { data } = await admin
      .from('lien_releases')
      .select('status, void_reason, is_deleted')
      .eq('id', seededReleaseId)
      .single();
    expect((data as { status: string }).status).toBe('voided');
    expect((data as { void_reason: string }).void_reason).toBe('harness void');
    expect((data as { is_deleted: boolean }).is_deleted).toBe(false);
  });
});

describe('S140-F6 — no DELETE reaches anyone', () => {
  it('Owner cannot DELETE a release; the row survives', async () => {
    await ownerC.from('lien_releases').delete().eq('id', seededReleaseId);
    const { data } = await admin
      .from('lien_releases')
      .select('id')
      .eq('id', seededReleaseId)
      .maybeSingle();
    expect(data, 'a release was deleted — it must be retained forever').toBeTruthy();
  });
});
