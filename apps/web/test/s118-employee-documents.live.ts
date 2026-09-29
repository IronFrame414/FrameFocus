/**
 * S118 item 16 — EMPLOYEE DOCUMENTS: who reads, who writes. FILL-16.3.
 *
 * Migration 20262060000000. RULED [Josh, 2026-09-29]: WRITE Owner/Admin only;
 * READ Owner/Admin and the employee — THEIR OWN documents only.
 *
 * ⚠️ THE LOAD-BEARING NEGATIVE IS EMPLOYEE-TO-EMPLOYEE: two employees (crew and
 * foreman, both crew-type members) each hold documents, counted with the
 * SERVICE ROLE first so "zero" is a refusal and never an empty table.
 * ⚠️ Writes are attempted WITHOUT returning rows and judged by the service role.
 * Storage is probed the way the app reads it: createSignedUrl on the private
 * `employee-documents` bucket, per role, per document.
 *
 * Fixtures: marker `S118D` in file names; objects under each member's own
 * prefix; a disposable crew member (no login) for the survive-the-person case.
 * Swept before and after, with the service role.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CompanyRole } from '@framefocus/shared/types/roles';
import { forEveryRole } from '@/test-support/role-matrix';
import { admin, assertRebuildTest, sessionFor } from './live-session';

const MARKER = 'S118D';
const BUCKET = 'employee-documents';
const IDENTITY: Record<CompanyRole, string> = {
  owner: 'josh+test50@worthprop.com',
  admin: 'josh+qa-admin@worthprop.com',
  project_executive: 'josh+qa-pe@worthprop.com',
  project_manager: 'josh+pm@worthprop.com',
  foreman: 'josh+qa-foreman@worthprop.com',
  crew_member: 'josh+crew@worthprop.com',
  client: 'josh+qa-client@worthprop.com',
  subcontractor: 'josh+qa-sub@worthprop.com',
};

const session = {} as Record<CompanyRole, SupabaseClient>;
let companyId = '';
const member = { crew: '', foreman: '', leaver: '' };
const docs = {
  crew: [] as { id: string; path: string }[],
  foreman: [] as { id: string; path: string }[],
  leaver: [] as { id: string; path: string }[],
};
let ownerUserId = '';

async function memberIdOf(email: string): Promise<string> {
  const { data: p } = await admin.from('profiles').select('id').eq('email', email).single();
  const { data: m } = await admin
    .from('company_members')
    .select('id, member_type')
    .eq('profile_id', p!.id)
    .single();
  if (m!.member_type !== 'crew') throw new Error(`${email} is not a crew-type member`);
  return m!.id as string;
}

async function seedDoc(memberId: string, n: number): Promise<{ id: string; path: string }> {
  const path = `${companyId}/${memberId}/${MARKER}-${n}-${Date.now()}.pdf`;
  const up = await admin.storage
    .from(BUCKET)
    .upload(path, Buffer.from(`%PDF-1.4 ${MARKER} ${n}`), { contentType: 'application/pdf' });
  if (up.error) throw new Error(`seed object: ${up.error.message}`);
  const { data, error } = await admin
    .from('employee_documents')
    .insert({
      company_id: companyId,
      member_id: memberId,
      file_name: `${MARKER} handbook ${n}.pdf`,
      file_path: path,
      file_size: 10,
      mime_type: 'application/pdf',
      created_by: ownerUserId,
      updated_by: ownerUserId,
    })
    .select('id')
    .single();
  if (error) throw new Error(`seed row: ${error.message}`);
  return { id: data!.id as string, path };
}

async function sweep() {
  const { data } = await admin
    .from('employee_documents')
    .select('id, file_path')
    .like('file_name', `${MARKER}%`);
  const rows = (data ?? []) as { id: string; file_path: string }[];
  if (rows.length) {
    await admin.storage.from(BUCKET).remove(rows.map((r) => r.file_path));
    await admin
      .from('employee_documents')
      .delete()
      .in(
        'id',
        rows.map((r) => r.id)
      );
  }
  await admin.from('company_members').delete().eq('display_name', `${MARKER} Leaver`);
}

/** Service-role count of this marker's rows for one member. */
async function serviceCount(memberId: string): Promise<number> {
  const { count } = await admin
    .from('employee_documents')
    .select('id', { count: 'exact', head: true })
    .eq('member_id', memberId)
    .like('file_name', `${MARKER}%`);
  return count ?? 0;
}

/** Rows of `memberId` this ROLE's session can read. */
async function readsAs(role: CompanyRole, memberId: string): Promise<number> {
  const { data, error } = await session[role]
    .from('employee_documents')
    .select('id')
    .eq('member_id', memberId)
    .like('file_name', `${MARKER}%`);
  if (error) return 0;
  return (data ?? []).length;
}

/** Can this ROLE sign a URL for the object? (null = refused by storage RLS) */
async function signsAs(role: CompanyRole, path: string): Promise<boolean> {
  const { data } = await session[role].storage.from(BUCKET).createSignedUrl(path, 60);
  return Boolean(data?.signedUrl);
}

beforeAll(async () => {
  assertRebuildTest();
  const { data: prof } = await admin
    .from('profiles')
    .select('company_id, user_id')
    .eq('email', IDENTITY.owner)
    .single();
  companyId = prof!.company_id as string;
  ownerUserId = prof!.user_id as string;
  await sweep();
  member.crew = await memberIdOf(IDENTITY.crew_member);
  member.foreman = await memberIdOf(IDENTITY.foreman);
  const { data: lv, error: lvErr } = await admin
    .from('company_members')
    .insert({ company_id: companyId, member_type: 'crew', display_name: `${MARKER} Leaver` })
    .select('id')
    .single();
  if (lvErr) throw new Error(`leaver: ${lvErr.message}`);
  member.leaver = lv!.id as string;
  docs.crew = [await seedDoc(member.crew, 1), await seedDoc(member.crew, 2)];
  docs.foreman = [await seedDoc(member.foreman, 3)];
  docs.leaver = [await seedDoc(member.leaver, 4)];
  for (const role of Object.keys(IDENTITY) as CompanyRole[])
    session[role] = await sessionFor(IDENTITY[role]);
}, 240_000);

afterAll(async () => {
  await sweep();
  const { count } = await admin
    .from('employee_documents')
    .select('id', { count: 'exact', head: true })
    .like('file_name', `${MARKER}%`);
  expect(count ?? 0, 'S118D rows survived teardown').toBe(0);
}, 120_000);

describe('CONTROL — the fixtures exist (service role), so every zero below is a refusal', () => {
  it('crew holds 2, foreman holds 1, the leaver holds 1', async () => {
    expect(await serviceCount(member.crew)).toBe(2);
    expect(await serviceCount(member.foreman)).toBe(1);
    expect(await serviceCount(member.leaver)).toBe(1);
  });
});

describe("⚠️ EMPLOYEE-TO-EMPLOYEE — each reads their own and ZERO of the other's", () => {
  it('crew reads its own 2 rows and signs its own objects', async () => {
    expect(await readsAs('crew_member', member.crew)).toBe(2);
    for (const d of docs.crew) expect(await signsAs('crew_member', d.path)).toBe(true);
  });
  it("crew reads ZERO of the foreman's rows and cannot sign the foreman's object", async () => {
    expect(await readsAs('crew_member', member.foreman)).toBe(0);
    expect(await signsAs('crew_member', docs.foreman[0].path)).toBe(false);
  });
  it('foreman reads its own 1 row and signs it', async () => {
    expect(await readsAs('foreman', member.foreman)).toBe(1);
    expect(await signsAs('foreman', docs.foreman[0].path)).toBe(true);
  });
  it("foreman reads ZERO of the crew member's rows and cannot sign them", async () => {
    expect(await readsAs('foreman', member.crew)).toBe(0);
    for (const d of docs.crew) expect(await signsAs('foreman', d.path)).toBe(false);
  });
  it("an unfiltered read returns ONLY one's own (no company-wide leak)", async () => {
    const { data } = await session.crew_member
      .from('employee_documents')
      .select('member_id')
      .like('file_name', `${MARKER}%`);
    const owners = new Set((data ?? []).map((r) => r.member_id as string));
    expect([...owners]).toEqual([member.crew]);
  });
});

// Reads of the CREW member's documents, per role (the employee's own row is the crew identity).
const READS_CREW_DOCS: Record<CompanyRole, boolean> = {
  owner: true,
  admin: true,
  project_executive: false,
  project_manager: false,
  foreman: false,
  crew_member: true, // their own
  subcontractor: false,
  client: false,
};

describe("Every role against the CREW member's documents (total map)", () => {
  forEveryRole(READS_CREW_DOCS, (role, reads) => {
    it(`${role}: reads ${reads ? 'all 2' : 'ZERO'} rows; signs ${reads ? 'both' : 'neither'} object`, async () => {
      expect(await readsAs(role, member.crew)).toBe(reads ? 2 : 0);
      for (const d of docs.crew) expect(await signsAs(role, d.path)).toBe(reads);
    });
  });
});

const WRITES: Record<CompanyRole, boolean> = {
  owner: true,
  admin: true,
  project_executive: false,
  project_manager: false,
  foreman: false,
  crew_member: false,
  subcontractor: false,
  client: false,
};

describe('WRITE is Owner/Admin only — every attempt counted with the service role', () => {
  forEveryRole(WRITES, (role, writes) => {
    it(`${role}: INSERT a row for the crew member → ${writes ? 'lands' : 'refused'}`, async () => {
      const before = await serviceCount(member.crew);
      const path = `${companyId}/${member.crew}/${MARKER}-w-${role}-${Date.now()}.pdf`;
      await session[role]
        .from('employee_documents')
        .insert({
          member_id: member.crew,
          file_name: `${MARKER} by ${role}.pdf`,
          file_path: path,
          file_size: 1,
          mime_type: 'application/pdf',
        });
      expect(await serviceCount(member.crew)).toBe(before + (writes ? 1 : 0));
      if (writes) {
        const { data } = await admin
          .from('employee_documents')
          .select('id')
          .eq('file_path', path)
          .single();
        await admin.from('employee_documents').delete().eq('id', data!.id);
      }
    });

    it(`${role}: upload an OBJECT under the crew member's prefix → ${writes ? 'lands' : 'refused'}`, async () => {
      const path = `${companyId}/${member.crew}/${MARKER}-o-${role}-${Date.now()}.pdf`;
      await session[role].storage
        .from(BUCKET)
        .upload(path, Buffer.from('x'), { contentType: 'application/pdf' });
      const { data } = await admin.storage
        .from(BUCKET)
        .list(`${companyId}/${member.crew}`, { search: `${MARKER}-o-${role}` });
      expect((data ?? []).length).toBe(writes ? 1 : 0);
      if (writes) await admin.storage.from(BUCKET).remove([path]);
    });
  });

  it('the employee cannot rename or trash their own document (UPDATE is Owner/Admin)', async () => {
    const d = docs.crew[0];
    await session.crew_member
      .from('employee_documents')
      .update({ file_name: 'renamed', is_deleted: true })
      .eq('id', d.id);
    const { data } = await admin
      .from('employee_documents')
      .select('file_name, is_deleted')
      .eq('id', d.id)
      .single();
    expect(data).toEqual({ file_name: `${MARKER} handbook 1.pdf`, is_deleted: false });
  });

  it('the employee cannot overwrite their own signed object (upsert)', async () => {
    const d = docs.crew[0];
    const { error } = await session.crew_member.storage
      .from(BUCKET)
      .upload(d.path, Buffer.from('forged'), { upsert: true, contentType: 'application/pdf' });
    expect(error).not.toBeNull();
    const { data: blob } = await admin.storage.from(BUCKET).download(d.path);
    expect(await blob!.text()).toContain(MARKER);
  });

  it('a document never moves to another person (Owner cannot re-point member_id)', async () => {
    const d = docs.crew[1];
    await session.owner
      .from('employee_documents')
      .update({ member_id: member.foreman })
      .eq('id', d.id);
    const { data } = await admin
      .from('employee_documents')
      .select('member_id')
      .eq('id', d.id)
      .single();
    expect(data!.member_id).toBe(member.crew);
  });

  it('Owner cannot file a document against a subcontractor member (crew only)', async () => {
    const { data: sub } = await admin
      .from('company_members')
      .select('id')
      .eq('company_id', companyId)
      .eq('member_type', 'subcontractor')
      .eq('is_deleted', false)
      .order('created_at', { ascending: true })
      .limit(1)
      .single();
    const path = `${companyId}/${sub!.id}/${MARKER}-sub.pdf`;
    await session.owner
      .from('employee_documents')
      .insert({
        member_id: sub!.id,
        file_name: `${MARKER} sub.pdf`,
        file_path: path,
        file_size: 1,
      });
    const { count } = await admin
      .from('employee_documents')
      .select('id', { count: 'exact', head: true })
      .eq('file_path', path);
    expect(count).toBe(0);
  });

  it('there is no hard delete: Owner DELETE removes nothing', async () => {
    const d = docs.foreman[0];
    await session.owner.from('employee_documents').delete().eq('id', d.id);
    expect(await serviceCount(member.foreman)).toBe(1);
  });
});

describe('Files survive the person', () => {
  it('deactivating the member keeps the row AND the object; Owner still reads and signs it', async () => {
    await admin
      .from('company_members')
      .update({ is_deleted: true, deleted_at: new Date().toISOString() })
      .eq('id', member.leaver);
    expect(await serviceCount(member.leaver)).toBe(1);
    const { data: obj } = await admin.storage.from(BUCKET).download(docs.leaver[0].path);
    expect(obj).not.toBeNull();
    expect(await readsAs('owner', member.leaver)).toBe(1);
    expect(await signsAs('owner', docs.leaver[0].path)).toBe(true);
  });
});

describe('Not reachable through the project store', () => {
  it('no files row and no project-files object carries an employee document (they are not in that store)', async () => {
    const { count } = await admin
      .from('files')
      .select('id', { count: 'exact', head: true })
      .like('file_name', `${MARKER}%`);
    expect(count).toBe(0);
    const { data } = await admin.storage.from('project-files').list(`${companyId}/${member.crew}`);
    expect((data ?? []).length).toBe(0);
  });
});

// ─── External surfaces: a bid token and the client portal reach ZERO ─────────
// Each probe has a POSITIVE CONTROL in the same response, so "no employee
// document" cannot pass on an empty or failed response.
describe('External probes — bid token and client portal', () => {
  const PORTAL_CLIENT = 'josh+qa-client-linked@worthprop.com';
  const PORTAL_PROJECT = '4a4f8567-67f8-4394-baae-181229974bd9';
  const created = { estimate: '', sub: '', request: '', file: '', path: '' };

  afterAll(async () => {
    if (created.file) await admin.from('files').delete().eq('id', created.file);
    if (created.path) await admin.storage.from('project-files').remove([created.path]);
    if (created.request)
      await admin.from('estimate_sub_bid_requests').delete().eq('id', created.request);
    if (created.estimate) await admin.from('estimates').delete().eq('id', created.estimate);
    if (created.sub) await admin.from('subcontractors').delete().eq('id', created.sub);
  }, 120_000);

  it('GET /api/bid/[token]/files (the real route, in-process): the shared scope doc is served, NO employee document', async () => {
    const { GET } = (await import('@/app/api/bid/[token]/files/route')) as unknown as {
      GET: (req: Request, ctx: { params: { token: string } }) => Promise<Response>;
    };
    const { data: seed } = await admin
      .from('estimates')
      .select('contact_id, created_by')
      .eq('company_id', companyId)
      .eq('is_deleted', false)
      .not('contact_id', 'is', null)
      .order('created_at', { ascending: true })
      .limit(1)
      .single();
    const { data: est, error: estErr } = await admin
      .from('estimates')
      .insert({
        company_id: companyId,
        contact_id: seed!.contact_id,
        name: `${MARKER} estimate`,
        status: 'draft',
        estimate_number: `EST-${MARKER}-${Date.now()}`,
        created_by_role: 'owner',
        created_by: seed!.created_by,
      })
      .select('id')
      .single();
    if (estErr) throw new Error(`estimate: ${estErr.message}`);
    created.estimate = est!.id as string;
    const { data: cat } = await admin
      .from('estimate_categories')
      .insert({
        company_id: companyId,
        estimate_id: created.estimate,
        name: `${MARKER} cat`,
        sort_order: 0,
      })
      .select('id')
      .single();
    const { data: line } = await admin
      .from('estimate_line_items')
      .insert({
        company_id: companyId,
        estimate_id: created.estimate,
        category_id: cat!.id,
        name: `${MARKER} line`,
        sort_order: 0,
        total_price: 0,
      })
      .select('id')
      .single();
    const { data: sub } = await admin
      .from('subcontractors')
      .insert({
        company_id: companyId,
        company_name: `${MARKER} Bidder`,
        sub_type: 'subcontractor',
        status: 'active',
        email: 'JSBishop14@gmail.com',
      })
      .select('id')
      .single();
    created.sub = sub!.id as string;
    const expires = new Date(Date.now() + 7 * 86_400_000).toISOString();
    const { data: req } = await admin
      .from('estimate_sub_bid_requests')
      .insert({
        company_id: companyId,
        estimate_id: created.estimate,
        line_item_id: line!.id,
        subcontractor_id: created.sub,
        scope_text: 'probe',
        expires_at: expires,
      })
      .select('id, token')
      .single();
    created.request = req!.id as string;
    // POSITIVE CONTROL — a staff scope document SHARED with bidders.
    created.path = `${companyId}/estimates/${created.estimate}/${MARKER}-scope.pdf`;
    await admin.storage
      .from('project-files')
      .upload(created.path, Buffer.from('%PDF scope'), {
        contentType: 'application/pdf',
        upsert: true,
      });
    const { data: f } = await admin
      .from('files')
      .insert({
        company_id: companyId,
        estimate_id: created.estimate,
        category: 'plans',
        file_name: `${MARKER}-scope.pdf`,
        file_path: created.path,
        file_size: 10,
        mime_type: 'application/pdf',
        created_by: seed!.created_by,
        tags: ['bid-scope'],
      })
      .select('id')
      .single();
    created.file = f!.id as string;

    const res = await GET(new Request('http://t/'), { params: { token: req!.token as string } });
    expect(res.status).toBe(200);
    const body = JSON.stringify(await res.json());
    expect(body, 'control: the shared scope doc must be served').toContain(`${MARKER}-scope.pdf`);
    expect(body).not.toContain('handbook');
    for (const d of [...docs.crew, ...docs.foreman, ...docs.leaver]) {
      expect(body).not.toContain(d.path);
      expect(body).not.toContain(d.id);
    }
    expect(body).not.toContain('employee-documents');
  });

  it('client portal (documents, photos, shared files) as the linked client: content present, NO employee document', async () => {
    const { getPortalDocuments, getPortalPhotos, getPortalSharedFiles } =
      await import('@/lib/services/portal');
    const client = await sessionFor(PORTAL_CLIENT);
    const [documents, photos, shared] = await Promise.all([
      getPortalDocuments(client as never, PORTAL_PROJECT),
      getPortalPhotos(client as never, PORTAL_PROJECT),
      getPortalSharedFiles(client as never, PORTAL_PROJECT),
    ]);
    // POSITIVE CONTROL — the rich fixture project shows the client SOMETHING.
    expect(
      documents.length + photos.length + shared.length,
      'control: the portal returned nothing at all'
    ).toBeGreaterThan(0);
    const body = JSON.stringify({ documents, photos, shared });
    expect(body).not.toContain(MARKER);
    expect(body).not.toContain('employee-documents');
    // And straight at the table and the bucket, as that client:
    const { data: rows } = await client.from('employee_documents').select('id');
    expect((rows ?? []).length).toBe(0);
    const { data: signed } = await client.storage
      .from(BUCKET)
      .createSignedUrl(docs.crew[0].path, 60);
    expect(signed?.signedUrl ?? null).toBeNull();
  });
});
