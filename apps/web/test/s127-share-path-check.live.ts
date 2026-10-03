/**
 * S127 R-2 — the DATABASE binds a public share link's `share_path` to its own
 * photo (migration 20262134700000). [RULED Josh, 2026-10-03.]
 *
 * An Owner and an Admin write link rows DIRECTLY (around the create route),
 * WITHOUT returning rows; the SERVICE ROLE counts what landed, by token_hash.
 *   own original           → lands
 *   own .markup.jpg        → lands
 *   another company's path → refused, 0 rows
 *   another photo's path   → refused, 0 rows
 *   another photo's derivative → refused, 0 rows
 * Fixture: image rows on one Company A project, marked by path; no storage
 * objects (the policy reads paths, not bytes).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHash, randomBytes } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { admin, assertRebuildTest, sessionFor } from './live-session';

const MARK = 'S127SPC';
const PROJECT = 'eaf0e25b-d60e-49c0-89b2-5612118d94b4';
const OTHER_COMPANY = '22222222-2222-4222-8222-222222222222';
let companyId = '';
let mine = '';
let minePath = '';
let otherPath = '';
const writers: Record<'owner' | 'admin', SupabaseClient> = {} as never;
const hashes: string[] = [];

async function photo(name: string): Promise<{ id: string; path: string }> {
  const id = crypto.randomUUID();
  const path = `${companyId}/${PROJECT}/${MARK}-${name}.png`;
  const { error } = await admin.from('files').insert({
    id,
    company_id: companyId,
    project_id: PROJECT,
    category: 'photos',
    file_name: `${MARK}-${name}.png`,
    file_path: path,
    file_size: 68,
    mime_type: 'image/png',
  });
  if (error) throw new Error(`file: ${error.message}`);
  return { id, path };
}

/** Insert as `who`, returning NO rows; count by the service role. */
async function lands(who: 'owner' | 'admin', fileId: string, sharePath: string): Promise<number> {
  const hash = createHash('sha256').update(randomBytes(32).toString('base64url')).digest('hex');
  hashes.push(hash);
  const { error } = await writers[who]
    .from('photo_share_links')
    .insert({ file_id: fileId, share_path: sharePath, token_hash: hash });
  const { count } = await admin
    .from('photo_share_links')
    .select('id', { count: 'exact', head: true })
    .eq('token_hash', hash);
  console.log(
    `[${MARK}] ${who} share_path=${sharePath.slice(-40)} error=${error?.code ?? 'none'} rows=${count}`
  );
  return count ?? 0;
}

beforeAll(async () => {
  assertRebuildTest();
  const { data: proj } = await admin
    .from('projects')
    .select('company_id')
    .eq('id', PROJECT)
    .single();
  companyId = proj!.company_id as string;
  await admin.from('files').delete().like('file_path', `%/${MARK}-%`);
  ({ id: mine, path: minePath } = await photo('mine'));
  ({ path: otherPath } = await photo('other'));
  writers.owner = await sessionFor('josh+test50@worthprop.com');
  writers.admin = await sessionFor('josh+qa-admin@worthprop.com');
}, 120_000);

afterAll(async () => {
  if (hashes.length) await admin.from('photo_share_links').delete().in('token_hash', hashes);
  await admin.from('files').delete().like('file_path', `%/${MARK}-%`);
  const { count } = await admin
    .from('photo_share_links')
    .select('id', { count: 'exact', head: true })
    .in('token_hash', hashes.length ? hashes : ['-']);
  expect(count ?? 0).toBe(0);
});

describe.each(['owner', 'admin'] as const)('%s writing a link row directly', (who) => {
  it('its own original lands', async () => {
    expect(await lands(who, mine, minePath)).toBe(1);
  });
  it('its own marked-up derivative lands', async () => {
    expect(await lands(who, mine, `${minePath}.markup.jpg`)).toBe(1);
  });
  it("another company's object is refused (0 rows)", async () => {
    expect(await lands(who, mine, `${OTHER_COMPANY}/p/x.png`)).toBe(0);
  });
  it("another photo's path in the same company is refused (0 rows)", async () => {
    expect(await lands(who, mine, otherPath)).toBe(0);
  });
  it("another photo's derivative is refused (0 rows)", async () => {
    expect(await lands(who, mine, `${otherPath}.markup.jpg`)).toBe(0);
  });
});
