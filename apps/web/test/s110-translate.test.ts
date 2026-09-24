import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const openai = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock('@/lib/openai', () => ({ getOpenAI: () => ({ chat: { completions: { create: openai.create } } }) }));

import { translateForReader, validate, hashText, TRANSLATION_MODEL } from '@/lib/translation/translate';

// S110 H — the translation service, unit half. The live half (real model, real
// cache) is s110-translate.live.ts.

/** A stand-in admin client that records inserts/upserts and serves a cache. */
function fakeAdmin(cacheRows: Array<{ source_hash: string; source_lang: string | null; translated_text: string | null }> = []) {
  const writes: Array<{ table: string; op: string; rows: unknown }> = [];
  const builder = (table: string) => {
    const q = {
      select: () => q,
      eq: () => q,
      in: () => Promise.resolve({ data: table === 'text_translations' ? cacheRows : [], error: null }),
      insert: (rows: unknown) => {
        writes.push({ table, op: 'insert', rows });
        return Promise.resolve({ error: null });
      },
      upsert: (rows: unknown) => {
        writes.push({ table, op: 'upsert', rows });
        return Promise.resolve({ error: null });
      },
    };
    return q;
  };
  return { admin: { from: builder } as never, writes };
}

// ⚠️ NO beforeEach TOUCHING THE MOCK. Measured under vitest 4: with ANY
// beforeEach that resets or clears `openai.create`, the failure-path test below
// fails with the mock's own thrown error even though the code under test
// caught it (the same test passes with the hook removed). Each test sets its
// own implementation and asserts call-count DELTAS instead.

describe('S110 H — validate(): only well-formed items for indices we asked about (3H rule 4)', () => {
  it('keeps good items, drops out-of-range, bad-language and non-string translations', () => {
    const out = validate(
      JSON.stringify({
        items: [
          { i: 0, lang: 'es', translation: 'The tile is cracked' },
          { i: 1, lang: 'en', translation: null },
          { i: 5, lang: 'es', translation: 'out of range' },
          { i: 2, lang: 'klingon', translation: 'x' },
          { i: 2, lang: 'es', translation: 42 },
        ],
      }),
      3
    );
    expect(out).toEqual([
      { sourceLang: 'es', translated: 'The tile is cracked' },
      { sourceLang: 'en', translated: null },
      undefined,
    ]);
  });
  it('unparseable output → null', () => {
    expect(validate('not json', 1)).toBeNull();
    expect(validate('{"nope":1}', 1)).toBeNull();
  });
});

describe('S110 H — translateForReader()', () => {
  it('a cache hit never calls the model and writes nothing', async () => {
    const { admin, writes } = fakeAdmin([{ source_hash: hashText('hola'), source_lang: 'es', translated_text: 'hello' }]);
    const calls = openai.create.mock.calls.length;
    const r = await translateForReader(admin, 'co', ['hola'], 'en');
    expect(r).toEqual([{ sourceLang: 'es', translated: 'hello' }]);
    expect(openai.create.mock.calls.length, 'the model was called on a cache hit').toBe(calls);
    expect(writes).toEqual([]);
  });

  it('a miss calls the model ONCE for the unique texts, logs cost, and caches', async () => {
    openai.create.mockResolvedValue({
      model: 'gpt-4o-mini-2024-07-18',
      usage: { prompt_tokens: 100, completion_tokens: 20 },
      choices: [{ message: { content: JSON.stringify({ items: [{ i: 0, lang: 'es', translation: 'The tile is cracked' }] }) } }],
    });
    const { admin, writes } = fakeAdmin();
    const calls = openai.create.mock.calls.length;
    const r = await translateForReader(admin, 'co', ['El azulejo está roto', 'El azulejo está roto'], 'en');
    expect(openai.create.mock.calls.length - calls).toBe(1);
    expect(r[0].translated).toBe('The tile is cracked');
    expect(r[1].translated).toBe('The tile is cracked');
    const log = writes.find((w) => w.table === 'ai_translation_logs')!.rows as Record<string, unknown>;
    expect(log.success).toBe(true);
    expect(log.model).toBe('gpt-4o-mini-2024-07-18'); // the RESOLVED model when the response names it
    expect(log.text_count).toBe(1);
    expect(Number(log.estimated_cost_usd)).toBeGreaterThan(0);
    expect(writes.some((w) => w.table === 'text_translations' && w.op === 'upsert')).toBe(true);
  });

  it('a FAILED call still writes a cost row (3H), caches nothing, and the reader gets the original', async () => {
    openai.create.mockImplementation(() => {
      throw new Error('rate limited');
    });
    const { admin, writes } = fakeAdmin();
    const r = await translateForReader(admin, 'co', ['hola'], 'en');
    expect(r).toEqual([{ sourceLang: null, translated: null, failed: true }]);
    const log = writes.find((w) => w.table === 'ai_translation_logs')!.rows as Record<string, unknown>;
    expect(log.success).toBe(false);
    expect(log.error_message).toBe('rate limited');
    expect(log.model).toBe(TRANSLATION_MODEL);
    expect(writes.some((w) => w.table === 'text_translations')).toBe(false);
  });
});
