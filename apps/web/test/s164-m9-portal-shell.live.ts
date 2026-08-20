/**
 * S164 — Module 9 stage 4. The portal's READ LAYER, under real sessions.
 *
 * Service: `apps/web/lib/services/portal.ts`. Routes: `app/portal/**`.
 *
 * ============================================================================
 * ⚠️ WHY THIS EXISTS WHEN STAGE 3 ALREADY PROVED THE POLICIES
 * ============================================================================
 * Stage 3 proved the ARMS. This proves the SERVICE THAT SITS ON THEM, and the
 * two can disagree in exactly one way that matters: a service function that
 * reaches for `getSupabaseAdmin()` would return correct-looking data for a
 * client who is entitled to none of it, and **every one of stage 3's 63 probes
 * would still pass**, because they query PostgREST directly and never touch
 * this file.
 *
 * So each function is called twice — once as the LINKED client and once as the
 * CONTROL — and the control's answer must be empty. A service reading with the
 * service role gives the control the same rows as the linked client, and that
 * is what these pairs catch.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import { readFileSync } from 'node:fs';
import { admin, assertRebuildTest, sessionFor } from './live-session';
import {
  getPortalBilling,
  getPortalBranding,
  getPortalDocuments,
  getPortalIdentity,
  getPortalPhotos,
  getPortalProjects,
  getPortalProposals,
  getPortalSchedule,
  signPortalPaths,
} from '@/lib/services/portal';
import { getPortalAccountsForProject } from '@/lib/services/client-portal';

const LINKED = 'josh+qa-client-linked@worthprop.com';
const CONTROL = 'josh+qa-client@worthprop.com';
const CLOSED = 'josh+qa-client-closed@worthprop.com';
const OWNER = 'josh+test50@worthprop.com';

type DbClient = SupabaseClient<Database>;

let linked: DbClient;
let control: DbClient;
let closed: DbClient;
let owner: DbClient;

let companyId: string;
let linkedProfileId: string;
let projectId: string;

/** Source with `//` and block comments removed. See P7c. */
const strip = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/[^:]\/\/.*$/gm, '');

const code = (rel: string): string =>
  strip(readFileSync(new URL(rel, import.meta.url), 'utf8'));

const setState = async (state: string) => {
  await admin.from('profiles').update({ client_access_state: state }).eq('id', linkedProfileId);
};

beforeAll(async () => {
  assertRebuildTest();
  [linked, control, closed, owner] = (await Promise.all([
    sessionFor(LINKED),
    sessionFor(CONTROL),
    sessionFor(CLOSED),
    sessionFor(OWNER),
  ])) as DbClient[];

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

// ───────────────────────────────────────────────────────────────────────────
describe('P1 — identity and branding', () => {
  it('P1a — the linked client resolves as a client at full access', async () => {
    const id = await getPortalIdentity(linked);
    expect(id).not.toBeNull();
    expect(id!.accessLevel).toBe('full');
    expect(id!.contactId).toBeTruthy();
  });

  it('P1b — ⚠️ an OWNER resolves as null, not as a portal user', async () => {
    // The portal layout redirects a staff role away, but the service must not
    // depend on the layout having done so: a null here is what makes any
    // future caller safe by default.
    expect(await getPortalIdentity(owner)).toBeNull();
  });

  it('P1c — the CLOSED client resolves, at level none', async () => {
    // She is still a client with a valid session — R2/R5 shut the WINDOW, not
    // the account. Returning null would make the portal tell her she is signed
    // out, which is false.
    const id = await getPortalIdentity(closed);
    expect(id).not.toBeNull();
    expect(id!.accessLevel).toBe('none');
  });

  it('P1d — R20: branding is the COMPANY’s, read with her own session', async () => {
    const b = await getPortalBranding(linked, companyId);
    expect(b.companyName.length).toBeGreaterThan(0);
  });

  it('P1e — ⚠️ and the CONTROL cannot read another tenant’s branding', async () => {
    const { data: other } = await admin
      .from('companies').select('id').neq('id', companyId).limit(1).single();
    const b = await getPortalBranding(control, (other as { id: string }).id);
    expect(b.companyName).toBe('');
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('P2 — every read is paired against the unlinked control', () => {
  it('P2a — projects', async () => {
    expect((await getPortalProjects(linked)).length).toBeGreaterThan(0);
    expect(await getPortalProjects(control)).toHaveLength(0);
  });

  it('P2b — schedule', async () => {
    expect(await getPortalSchedule(control, projectId)).toHaveLength(0);
  });

  it('P2c — documents', async () => {
    expect((await getPortalDocuments(linked, projectId)).length).toBeGreaterThan(0);
    expect(await getPortalDocuments(control, projectId)).toHaveLength(0);
  });

  it('P2d — proposals', async () => {
    expect((await getPortalProposals(linked, projectId)).length).toBeGreaterThan(0);
    expect(await getPortalProposals(control, projectId)).toHaveLength(0);
  });

  it('P2e — photos', async () => {
    expect((await getPortalPhotos(linked, projectId)).length).toBeGreaterThan(0);
    expect(await getPortalPhotos(control, projectId)).toHaveLength(0);
  });

  it('P2f — billing, including the totals', async () => {
    const mine = await getPortalBilling(linked, projectId);
    expect(mine.invoices.length).toBeGreaterThan(0);
    expect(mine.totalBilled).toBeGreaterThan(0);

    const theirs = await getPortalBilling(control, projectId);
    expect(theirs.invoices).toHaveLength(0);
    expect(theirs.totalBilled).toBe(0);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('P3 — the portal shows what the invoice shows [Josh, S164 Q3]', () => {
  it('P3a — a full_detail bill arrives WITH lines and cost basis', async () => {
    const b = await getPortalBilling(linked, projectId);
    const full = b.invoices.find((i) => i.presentation_level === 'full_detail')!;
    expect(full, 'no full_detail bill on this project').toBeTruthy();
    expect(full.lines.length).toBe(2);
    expect(full.lines.some((l) => l.cost_basis !== null)).toBe(true);
  });

  it('P3b — ⚠️ a lump_sum bill arrives with NO lines, on the same project', async () => {
    const b = await getPortalBilling(linked, projectId);
    const lump = b.invoices.find((i) => i.presentation_level === 'lump_sum')!;
    expect(lump, 'no lump_sum bill on this project').toBeTruthy();
    expect(lump.lines).toHaveLength(0);
    expect(lump.sections).toHaveLength(0);
    // ...and the total is still there. That IS the lump-sum disclosure.
    expect(lump.billed_total).toBeGreaterThan(0);
  });

  it('P3c — a by_section bill arrives with sections and no lines', async () => {
    const b = await getPortalBilling(linked, projectId);
    const sec = b.invoices.find((i) => i.presentation_level === 'by_section')!;
    expect(sec.lines).toHaveLength(0);
    expect(sec.sections.length).toBeGreaterThan(0);
    for (const s of sec.sections) expect(Object.keys(s)).not.toContain('cost_basis');
  });

  it('P3d — ⚠️ TWO instruments on ONE project, rendered on their own terms', async () => {
    // Josh: "a lump-sum contract can carry a T&M change order … sometimes the
    // original contract will be different from COs." This is that, measured:
    // one project, one client, one call, three different disclosure levels.
    const b = await getPortalBilling(linked, projectId);
    const levels = new Set(b.invoices.map((i) => i.presentation_level));
    expect(levels.size).toBeGreaterThan(1);
  });

  it('P3e — the totals sum the bills she can see, and nothing else', async () => {
    const b = await getPortalBilling(linked, projectId);
    const sum = b.invoices.reduce((t, i) => t + i.billed_total, 0);
    expect(b.totalBilled).toBeCloseTo(sum, 2);

    // The draft bill is excluded by the arm, so it must not be in the total.
    const { data: draft } = await admin
      .from('invoices').select('id, billed_total')
      .eq('company_id', companyId).eq('title', 'QA M9 — draft bill').single();
    expect(b.invoices.map((i) => i.id)).not.toContain((draft as { id: string }).id);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('P4 — §6.1: the marked-up image, and it must actually resolve', () => {
  it('P4a — display_path is the .markup.jpg derivative when markup exists', async () => {
    const photos = await getPortalPhotos(linked, projectId);
    const annotated = photos.find((p) => p.has_markup)!;
    expect(annotated, 'no annotated fixture — P4 would be vacuous').toBeTruthy();
    expect(annotated.display_path).toBe(`${annotated.file_path}.markup.jpg`);
  });

  it('P4b — ⚠️ and the derivative SIGNS, which is the half that 403s', async () => {
    // The row reads fine whether or not the storage policy has the derivative
    // branch. This is the assertion that tells the two apart.
    const photos = await getPortalPhotos(linked, projectId);
    const urls = await signPortalPaths(linked, photos.map((p) => p.display_path), 60);
    for (const p of photos) {
      expect(urls.get(p.display_path), `${p.display_path} did not sign`).toBeTruthy();
    }
  });

  it('P4c — an un-annotated photo keeps its original path', async () => {
    const photos = await getPortalPhotos(linked, projectId);
    for (const p of photos.filter((x) => !x.has_markup)) {
      expect(p.display_path).toBe(p.file_path);
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('P5 — R17 reaches the service without the service knowing about it', () => {
  it('P5a — deactivated: identity says none and every read empties', async () => {
    try {
      await setState('deactivated');
      const fresh = (await sessionFor(LINKED)) as DbClient;
      expect((await getPortalIdentity(fresh))!.accessLevel).toBe('none');
      expect(await getPortalProjects(fresh)).toHaveLength(0);
      expect((await getPortalBilling(fresh, projectId)).invoices).toHaveLength(0);
      expect(await getPortalPhotos(fresh, projectId)).toHaveLength(0);
    } finally {
      await setState('active');
    }
  });

  it('P5b — documents_for_signature: documents stay, content goes', async () => {
    try {
      await setState('documents_for_signature');
      const fresh = (await sessionFor(LINKED)) as DbClient;
      expect((await getPortalDocuments(fresh, projectId)).length).toBeGreaterThan(0);
      expect(await getPortalPhotos(fresh, projectId)).toHaveLength(0);
      expect(await getPortalSchedule(fresh, projectId)).toHaveLength(0);
      expect((await getPortalBilling(fresh, projectId)).invoices).toHaveLength(0);
    } finally {
      await setState('active');
    }
  });

  it('P5c — and it all comes back', async () => {
    const fresh = (await sessionFor(LINKED)) as DbClient;
    expect((await getPortalProjects(fresh)).length).toBeGreaterThan(0);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('P6 — the dashboard side, which had no caller until now', () => {
  it('P6a — the Owner sees the client contact and its existing account', async () => {
    const rows = await getPortalAccountsForProject(owner, projectId);
    expect(rows.length).toBeGreaterThan(0);
    const linkedRow = rows.find((r) => r.profileId === linkedProfileId)!;
    expect(linkedRow, 'the linked client must appear on her own project').toBeTruthy();
    expect(linkedRow.state).toBe('active');
    expect(linkedRow.email).toBeTruthy();
  });

  it('P6b — ⚠️ the panel is useless to a CLIENT, and here is exactly how far it gets', async () => {
    // Measured rather than assumed, because the answer is not the same on
    // every project and a single blanket assertion would have been wrong:
    //
    //   HER OWN project      — `projects.contact_id` IS her contact, and
    //                          `contacts_select_client_own` lets her read that
    //                          one row. She sees HERSELF and nobody else.
    //   A SHARED project     — the project's own contact is someone else's, and
    //                          `project_contacts` has NO client arm at all, so
    //                          she resolves nothing. Zero rows.
    //
    // Either way she learns nothing about another client's account or its R17
    // state, which is the property. The panel is Owner/Admin by RLS, not by
    // being hidden.
    const mine = await getPortalAccountsForProject(linked, projectId);
    expect(mine).toHaveLength(1);
    expect(mine[0].profileId).toBe(linkedProfileId);

    const { data: shared } = await admin
      .from('projects').select('id')
      .eq('company_id', companyId).eq('name', 'QA A — M9 completed 200d').single();
    const sharedId = (shared as { id: string }).id;

    const asOwner = await getPortalAccountsForProject(owner, sharedId);
    expect(asOwner.length, 'need 2+ client contacts here or this proves nothing').toBeGreaterThan(1);
    expect(await getPortalAccountsForProject(linked, sharedId)).toHaveLength(0);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('P7 — the service reads with the CALLER’s client, provably', () => {
  it('P7a — no service-role client is reachable from portal.ts', () => {
    // The whole security model of stage 4 is that these functions cannot
    // out-read their caller. One `getSupabaseAdmin()` would break every arm
    // above while leaving stage 3 entirely green — so it is asserted in the
    // source, not only in behaviour.
    // ⚠️ COMMENTS STRIPPED FIRST. These files EXPLAIN why they never reach for
    // the service role, so a raw substring search matches the warning and fails
    // on the very discipline it is checking. A test that cannot tell a rule
    // from its own documentation is not checking the rule.
    expect(code('../lib/services/portal.ts')).not.toContain('getSupabaseAdmin');
    expect(code('../lib/services/portal.ts')).not.toContain('SERVICE_ROLE');
    expect(code('../lib/services/portal.ts')).not.toContain('supabase-admin');
  });

  it('P7b — nor from the portal route tree', () => {
    for (const f of ['../app/portal/layout.tsx', '../app/portal/page.tsx', '../app/portal/[projectId]/page.tsx']) {
      expect(code(f), f).not.toContain('getSupabaseAdmin');
    }
  });

  it('P7c — ⚠️ and the stripper works, or P7a and P7b prove nothing', () => {
    expect(strip('const a = 1; // getSupabaseAdmin\n')).not.toContain('getSupabaseAdmin');
    expect(strip('/* getSupabaseAdmin */ const a = 1;')).not.toContain('getSupabaseAdmin');
    expect(strip('const a = getSupabaseAdmin();')).toContain('getSupabaseAdmin');
  });
});
