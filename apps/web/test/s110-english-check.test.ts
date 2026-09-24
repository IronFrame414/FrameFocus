import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

vi.mock('server-only', () => ({}));
const openai = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock('@/lib/openai', () => ({
  getOpenAI: () => ({ chat: { completions: { create: openai.create } } }),
}));

import {
  checkClientFacingEnglish,
  nonEnglishResponseBody,
  validateLangs,
} from '@/lib/language-check/english-check';

// S110 H, Q14 — the send-time English check. Unit half; the live half drives
// the real proposal send route (s110-english-check.live.ts).

function fakeAdmin() {
  const logs: unknown[] = [];
  return {
    admin: {
      from: () => ({ insert: (r: unknown) => (logs.push(r), Promise.resolve({ error: null })) }),
    } as never,
    logs,
  };
}

describe('S110 H, Q14 — the check returns LANGUAGE CODES, never text (ruling 5)', () => {
  it('a "translation" the model volunteers is dropped; only en/es/other survive', () => {
    const out = validateLangs(
      JSON.stringify({
        items: [
          { i: 0, lang: 'es', translation: 'Bathroom remodel' },
          { i: 1, lang: 'de' },
        ],
      }),
      2
    );
    expect(out).toEqual(['es', undefined]);
    expect(JSON.stringify(out)).not.toContain('Bathroom');
  });

  it('the module never imports the translation service', () => {
    const src = readFileSync(
      fileURLToPath(new URL('../lib/language-check/english-check.ts', import.meta.url)),
      'utf8'
    );
    expect(src).not.toMatch(/from\s+['"][^'"]*lib\/translation/);
  });
});

describe('S110 H, Q14 — checkClientFacingEnglish()', () => {
  it('names the non-English fields, in order, and logs a cost row', async () => {
    openai.create.mockImplementation(() =>
      Promise.resolve({
        model: 'gpt-4o-mini-2024-07-18',
        usage: { prompt_tokens: 80, completion_tokens: 20 },
        choices: [
          {
            message: {
              content: JSON.stringify({
                items: [
                  { i: 0, lang: 'es' },
                  { i: 1, lang: 'en' },
                ],
              }),
            },
          },
        ],
      })
    );
    const { admin, logs } = fakeAdmin();
    const r = await checkClientFacingEnglish(admin, 'co', [
      { field: 'Estimate name (the proposal title)', text: 'Remodelación de baño' },
      { field: 'Cover letter', text: 'Thank you for the opportunity.' },
      { field: 'Scope summary', text: '' }, // empty → not sent to the model
    ]);
    expect(r).toEqual({
      checked: true,
      flagged: [{ field: 'Estimate name (the proposal title)', lang: 'es' }],
    });
    expect(logs).toHaveLength(1);
    expect((logs[0] as { target_lang: string }).target_lang).toBe('detect');
  });

  it('FAILS OPEN: detection unavailable → checked false, nothing flagged, a failure cost row', async () => {
    openai.create.mockImplementation(() => {
      throw new Error('upstream down');
    });
    const { admin, logs } = fakeAdmin();
    const r = await checkClientFacingEnglish(admin, 'co', [
      { field: 'Estimate name', text: 'Remodelación' },
    ]);
    expect(r).toEqual({ checked: false, flagged: [] });
    expect((logs[0] as { success: boolean }).success).toBe(false);
  });

  it('the 409 body names every flagged field for the sender', () => {
    const body = nonEnglishResponseBody([
      { field: 'Line 3 name', lang: 'es' },
      { field: 'Cover letter', lang: 'other' },
    ]);
    expect(body.code).toBe('NON_ENGLISH');
    expect(body.fields).toEqual(['Line 3 name', 'Cover letter']);
    expect(body.error).toContain('Line 3 name, Cover letter');
  });
});
