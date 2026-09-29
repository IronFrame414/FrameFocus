import { test, expect } from '@playwright/test';
import { adminClient } from './hub-fixture';

// [S118 item 5, #169] The bid page lists the scope documents staff SHARED with
// bidders — and only those. Anonymous, like a real sub: the token is the only
// credential. Fixtures made with the service role, removed after, counted.
//
//   positive: a staff file tagged bid-scope is listed, and opening it yields a URL
//   negative: an UNTAGGED staff file on the same estimate (the shape of a
//             site-visit photo) is not listed — the S114 exposure, by name
//   negative: a cancelled token shows no list at all

const RUN = `S118B-${Date.now()}`;
const admin = adminClient();
const made = {
  estimate: '',
  sub: '',
  request: '',
  token: '',
  files: [] as string[],
  paths: [] as string[],
};

test.beforeAll(async () => {
  const { data: seed, error: seedErr } = await admin
    .from('estimates')
    .select('company_id, contact_id, created_by')
    .eq('status', 'draft')
    .eq('is_deleted', false)
    .not('contact_id', 'is', null)
    .order('created_at', { ascending: true })
    .limit(1)
    .single();
  if (seedErr || !seed) throw new Error(`seed estimate: ${seedErr?.message}`);
  const companyId = seed.company_id as string;
  const { data: est } = await admin
    .from('estimates')
    .insert({
      company_id: companyId,
      contact_id: seed.contact_id,
      name: `${RUN} estimate`,
      status: 'draft',
      estimate_number: `EST-${RUN}`,
      created_by_role: 'owner',
      created_by: seed.created_by,
    })
    .select('id')
    .single();
  made.estimate = est!.id as string;
  const { data: cat } = await admin
    .from('estimate_categories')
    .insert({
      company_id: companyId,
      estimate_id: made.estimate,
      name: `${RUN} cat`,
      sort_order: 0,
    })
    .select('id')
    .single();
  const { data: line } = await admin
    .from('estimate_line_items')
    .insert({
      company_id: companyId,
      estimate_id: made.estimate,
      category_id: cat!.id,
      name: `${RUN} framing`,
      sort_order: 0,
      total_price: 0,
    })
    .select('id')
    .single();
  const { data: sub } = await admin
    .from('subcontractors')
    .insert({
      company_id: companyId,
      company_name: `${RUN} Bidder`,
      sub_type: 'subcontractor',
      status: 'active',
      email: 'JSBishop14@gmail.com',
    })
    .select('id')
    .single();
  made.sub = sub!.id as string;
  const { data: req } = await admin
    .from('estimate_sub_bid_requests')
    .insert({
      company_id: companyId,
      estimate_id: made.estimate,
      line_item_id: line!.id,
      subcontractor_id: made.sub,
      scope_text: 'Frame the second floor.',
      expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    })
    .select('id, token')
    .single();
  made.request = req!.id as string;
  made.token = req!.token as string;

  for (const [name, tags] of [
    [`${RUN}-shared-plans.pdf`, ['plans', 'bid-scope']],
    [`${RUN}-private-site-photo.pdf`, ['plans']],
  ] as const) {
    const path = `${companyId}/estimates/${made.estimate}/${name}`;
    await admin.storage
      .from('project-files')
      .upload(path, Buffer.from('%PDF-1.4'), { contentType: 'application/pdf', upsert: true });
    made.paths.push(path);
    const { data: f } = await admin
      .from('files')
      .insert({
        company_id: companyId,
        estimate_id: made.estimate,
        category: 'plans',
        file_name: name,
        file_path: path,
        file_size: 8,
        mime_type: 'application/pdf',
        created_by: seed.created_by,
        tags: [...tags],
      })
      .select('id')
      .single();
    made.files.push(f!.id as string);
  }
});

test.afterAll(async () => {
  if (made.files.length) await admin.from('files').delete().in('id', made.files);
  if (made.paths.length) await admin.storage.from('project-files').remove(made.paths);
  if (made.request) await admin.from('estimate_sub_bid_requests').delete().eq('id', made.request);
  if (made.estimate) await admin.from('estimates').delete().eq('id', made.estimate);
  if (made.sub) await admin.from('subcontractors').delete().eq('id', made.sub);
  const { count } = await admin
    .from('files')
    .select('id', { count: 'exact', head: true })
    .like('file_name', `${RUN}%`);
  expect(count, 'bid-docs fixtures left behind').toBe(0);
});

test.describe('S118 item 5 · the bid page lists shared scope documents, and only those', () => {
  test.setTimeout(120_000);

  test('the shared document is listed and opens; the untagged staff file is not listed', async ({
    page,
    context,
  }) => {
    await page.goto(`/bid/${made.token}`);
    const docs = page.getByTestId('bid-doc');
    await expect(docs).toHaveCount(1);
    await expect(docs.first()).toContainText(`${RUN}-shared-plans.pdf`);
    await expect(page.locator('body')).not.toContainText('private-site-photo');
    const popup = context.waitForEvent('page');
    await docs.first().getByRole('button').click();
    const opened = await popup;
    expect(opened.url()).toContain('/storage/v1/object/sign/project-files/');
    await opened.close();
  });

  test('a CANCELLED token shows the closed card and no document list', async ({ page }) => {
    await admin
      .from('estimate_sub_bid_requests')
      .update({ status: 'cancelled' })
      .eq('id', made.request);
    await page.goto(`/bid/${made.token}`);
    await expect(page.getByText('This request is no longer open')).toBeVisible();
    await expect(page.getByTestId('bid-docs')).toHaveCount(0);
    const res = await page.request.get(`/api/bid/${made.token}/files`);
    expect(res.status()).not.toBe(200);
  });
});
