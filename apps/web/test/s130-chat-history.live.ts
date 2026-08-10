import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import { admin, assertRebuildTest, sessionFor } from './live-session';
import { resolveThread } from '@/lib/chat/threads';
import { messagesBefore, recentMessages, PAGE_SIZE } from '@/lib/chat/messages';

// ============================================================================
// §7.2 / ND-38 — load-older, exercised for the first time.
// ============================================================================
//
// ⚠️ THIS CLOSES A GAP THAT WAS OPEN SINCE SLICE 3. `messagesBefore()` shipped
// with slice 3 and had NEVER RETURNED A SECOND PAGE, because no thread on
// rebuild-test exceeded one — so only its ABSENCE was asserted (the control does
// not render on a short thread). Its success was not.
//
// The fixture is the whole point: 30 messages is past the panel's 25, so the
// boundary is real rather than simulated.

const OWNER = 'josh+test50@worthprop.com';
const COMPANY = '03bb903f-1084-4ab4-afb8-03192cb58d30';
const PROJECT = '4a4f8567-67f8-4394-baae-181229974bd9';
const TOTAL = 30;

let ownerC: SupabaseClient<Database>;
let threadId: string;

async function cleanup() {
  await admin.from('chat_threads').delete().eq('project_id', PROJECT);
}

beforeAll(async () => {
  assertRebuildTest();
  ownerC = await sessionFor(OWNER);
  await cleanup();

  const { data: profile } = await admin
    .from('profiles')
    .select('id')
    .eq('email', OWNER)
    .single();
  const authorProfileId = (profile as { id: string }).id;

  const thread = await resolveThread(ownerC, PROJECT, 'crew');
  threadId = thread!.id;

  // ⚠️ created_at IS SET EXPLICITLY AND SPACED. The paging keys on created_at,
  // and 30 rows inserted in one statement can share a timestamp to the
  // microsecond — which would make `.lt(created_at, before)` skip or duplicate
  // rows and the page boundary meaningless. Ordered oldest-first so index 0 is
  // the start of the thread.
  const base = new Date('2026-08-01T09:00:00Z').getTime();
  const rows = Array.from({ length: TOTAL }, (_, i) => ({
    company_id: COMPANY,
    thread_id: threadId,
    author_profile_id: authorProfileId,
    body: `history ${String(i).padStart(2, '0')}`,
    created_at: new Date(base + i * 60_000).toISOString(),
  }));
  const { error } = await admin.from('chat_messages').insert(rows);
  if (error) throw new Error(`seed: ${error.message}`);
});

afterAll(cleanup);

describe('§7.2 — a page of recent messages with load-more', () => {
  it('the first page is the NEWEST PAGE_SIZE, not the oldest', async () => {
    // The defect this shape exists to avoid: ordering ascending with a LIMIT
    // returns the START of the thread, which on a long-running job is a wall of
    // history from months ago.
    const page = await recentMessages(ownerC, threadId, PAGE_SIZE.panel);
    expect(page).toHaveLength(PAGE_SIZE.panel);
    expect(page[0].body).toBe('history 05');
    expect(page[page.length - 1].body).toBe('history 29');
  });

  it('⚠️ load-older returns a SECOND page, adjacent and non-overlapping', async () => {
    const first = await recentMessages(ownerC, threadId, PAGE_SIZE.panel);
    const older = await messagesBefore(ownerC, threadId, first[0].created_at, PAGE_SIZE.panel);

    // 30 seeded, 25 on the first page — the remainder is exactly 5.
    expect(older).toHaveLength(TOTAL - PAGE_SIZE.panel);
    expect(older[0].body).toBe('history 00');
    expect(older[older.length - 1].body).toBe('history 04');

    // Adjacency and non-overlap, asserted together: the two pages must join
    // with no gap and no repeat. A `lte` instead of `lt` duplicates one row and
    // an off-by-one drops one, and both look plausible in a UI.
    const joined = [...older, ...first].map((m) => m.body);
    expect(joined).toHaveLength(TOTAL);
    expect(new Set(joined).size).toBe(TOTAL);
    expect(joined[0]).toBe('history 00');
    expect(joined[TOTAL - 1]).toBe('history 29');
  });

  it('a third request past the start returns EMPTY, which is how the UI stops', async () => {
    const older = await messagesBefore(
      ownerC,
      threadId,
      new Date('2026-08-01T09:00:00Z').toISOString(),
      PAGE_SIZE.panel
    );
    expect(older).toEqual([]);
  });

  it('ND-38 — the tab takes 50 and the panel 25 from the same thread', async () => {
    // One thread, two surfaces, two page sizes — and the numbers come from
    // PAGE_SIZE rather than from either caller.
    const tab = await recentMessages(ownerC, threadId, PAGE_SIZE.tab);
    const panel = await recentMessages(ownerC, threadId, PAGE_SIZE.panel);
    expect(tab).toHaveLength(TOTAL); // 30 < 50, so the tab gets everything
    expect(panel).toHaveLength(PAGE_SIZE.panel);
  });
});
