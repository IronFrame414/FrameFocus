import 'server-only';
import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import { getOpenAI } from '@/lib/openai';
import type { Lang } from '@/lib/i18n/lang';

/**
 * S110 H [RULED Josh, Q12 / Q13] — TRANSLATE WHAT PEOPLE TYPED, FOR THE READER.
 *
 * ON READ, CACHED: a text is translated the first time someone whose language
 * differs reads it, and the result is kept in `text_translations`, keyed by
 * (company, sha256 of the exact text, target language, model). An edit is a new
 * hash, so it is re-translated; a better model is a new key. THE ORIGINAL IS
 * NEVER WRITTEN — only the cache row.
 *
 * ⚠️ RULING 5 — EVERYTHING CLIENT-FACING IS ENGLISH. This module is imported by
 * `/api/translate` (which refuses a client) and by NOTHING that renders a
 * proposal, contract, lien release, invoice, the portal or a client email;
 * `test/s110-client-facing-english.test.ts` fails if that changes.
 *
 * Module 3H rules, followed: lazy client (getOpenAI); a cost row on success AND
 * failure; cheapest checks first (cache before model); the model's output is
 * VALIDATED against the request (index in range, language in the known set,
 * translation a string or null) and anything else is discarded; the resolved
 * model is logged when the response names it; no retry.
 */

export const TRANSLATION_MODEL = 'gpt-4o-mini';
// ⚠️ Read from developers.openai.com/api/docs/pricing through a summarising
// fetch at S110 Phase 1, NOT verbatim — re-check before relying on the figure.
const USD_PER_M_INPUT = 0.15;
const USD_PER_M_OUTPUT = 0.6;

export const MAX_TEXTS = 50;
export const MAX_CHARS = 4000;

export interface TranslationResult {
  /** What the model detected: 'en', 'es', 'other', or null if unknown. */
  sourceLang: string | null;
  /** null = already in the reader's language (show the original as is). */
  translated: string | null;
  /** true = no translation could be produced; the reader sees the original. */
  failed?: boolean;
}

export const hashText = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');

const LANG_NAME: Record<Lang, string> = { en: 'English', es: 'Spanish' };

function prompt(target: Lang): string {
  return [
    `You translate short notes written by construction workers into ${LANG_NAME[target]}.`,
    'For each item: detect its language as "en", "es" or "other".',
    `If it is already ${LANG_NAME[target]}, return translation null.`,
    'Otherwise translate faithfully and plainly. Keep numbers, measurements, units, names, addresses and',
    'product names exactly as written. Never add, explain, soften or summarise.',
    'Reply with JSON only: {"items":[{"i":<index>,"lang":"en"|"es"|"other","translation":<string or null>}]}.',
  ].join(' ');
}

export async function translateForReader(
  admin: SupabaseClient<Database>,
  companyId: string,
  texts: string[],
  target: Lang
): Promise<TranslationResult[]> {
  const hashes = texts.map(hashText);
  const unique = [...new Set(hashes)];

  // 1. The cache — cheapest first.
  const cached = new Map<string, TranslationResult>();
  const { data: rows } = await admin
    .from('text_translations')
    .select('source_hash, source_lang, translated_text')
    .eq('company_id', companyId)
    .eq('target_lang', target)
    .eq('model', TRANSLATION_MODEL)
    .in('source_hash', unique);
  for (const r of rows ?? [])
    cached.set(r.source_hash, { sourceLang: r.source_lang, translated: r.translated_text });

  const missing = unique.filter((h) => !cached.has(h));
  if (missing.length) {
    const textOf = new Map(hashes.map((h, i) => [h, texts[i]]));
    const batch = missing.map((h) => textOf.get(h)!);
    const fresh = await callModel(admin, companyId, batch, target);
    if (fresh) {
      const inserts = missing
        .map((h, i) => ({ h, r: fresh[i] }))
        .filter((x): x is { h: string; r: TranslationResult } => x.r !== undefined);
      for (const { h, r } of inserts) cached.set(h, r);
      if (inserts.length) {
        const { error } = await admin.from('text_translations').upsert(
          inserts.map(({ h, r }) => ({
            company_id: companyId,
            source_hash: h,
            source_lang: r.sourceLang,
            target_lang: target,
            model: TRANSLATION_MODEL,
            translated_text: r.translated,
          })),
          { onConflict: 'company_id,source_hash,target_lang,model', ignoreDuplicates: true }
        );
        if (error)
          console.error('[translate] cache write failed', { companyId, message: error.message });
      }
    }
  }
  // A text with no result (the model failed or dropped it) comes back
  // `failed`, and the reader sees the ORIGINAL (FILL-H.8) — never a blank. It is
  // not cached, so the next read tries again.
  return hashes.map((h) => cached.get(h) ?? { sourceLang: null, translated: null, failed: true });
}

async function callModel(
  admin: SupabaseClient<Database>,
  companyId: string,
  batch: string[],
  target: Lang
): Promise<Array<TranslationResult | undefined> | null> {
  let model = TRANSLATION_MODEL;
  let inTok: number | null = null;
  let outTok: number | null = null;
  let error: string | null = null;
  let parsed: Array<TranslationResult | undefined> | null = null;
  try {
    const res = await getOpenAI().chat.completions.create({
      model: TRANSLATION_MODEL,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: prompt(target) },
        { role: 'user', content: JSON.stringify({ items: batch.map((text, i) => ({ i, text })) }) },
      ],
    });
    model = res.model || TRANSLATION_MODEL;
    inTok = res.usage?.prompt_tokens ?? null;
    outTok = res.usage?.completion_tokens ?? null;
    parsed = validate(res.choices[0]?.message?.content ?? '', batch.length);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  const cost =
    inTok !== null && outTok !== null
      ? Number(((inTok * USD_PER_M_INPUT + outTok * USD_PER_M_OUTPUT) / 1_000_000).toFixed(6))
      : null;
  // Cost row on success AND failure — a failed call can still cost money.
  const { error: logErr } = await admin.from('ai_translation_logs').insert({
    company_id: companyId,
    model,
    target_lang: target,
    text_count: batch.length,
    input_tokens: inTok,
    output_tokens: outTok,
    estimated_cost_usd: cost,
    success: !error && parsed !== null,
    error_message: error ?? (parsed === null ? 'unparseable model output' : null),
  });
  if (logErr)
    console.error('[translate] cost log insert failed', { companyId, message: logErr.message });
  if (error) console.error('[translate] model call failed', { companyId, message: error });
  return parsed;
}

/** Keep only well-formed items for indices we asked about (3H rule 4). */
export function validate(content: string, n: number): Array<TranslationResult | undefined> | null {
  let body: unknown;
  try {
    body = JSON.parse(content);
  } catch {
    return null;
  }
  const items = (body as { items?: unknown })?.items;
  if (!Array.isArray(items)) return null;
  const out: Array<TranslationResult | undefined> = new Array(n).fill(undefined);
  for (const it of items) {
    const { i, lang, translation } = (it ?? {}) as {
      i?: unknown;
      lang?: unknown;
      translation?: unknown;
    };
    if (typeof i !== 'number' || !Number.isInteger(i) || i < 0 || i >= n || out[i]) continue;
    if (lang !== 'en' && lang !== 'es' && lang !== 'other') continue;
    if (translation !== null && typeof translation !== 'string') continue;
    out[i] = {
      sourceLang: lang,
      translated: typeof translation === 'string' && translation.trim() ? translation : null,
    };
  }
  return out;
}
