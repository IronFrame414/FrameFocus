import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import { getOpenAI } from '@/lib/openai';

/**
 * S110 H [RULED Josh, Q14 → A + C, never B] — BEFORE A CLIENT-FACING DOCUMENT
 * IS SENT, NAME ANY FIELD THAT IS NOT IN ENGLISH.
 *
 * _"A + C, never B … the send-time check WARNS and names the offending field,
 * and the sender — always office — may override and send. Record the override.
 * A hard block on a false positive (a proper noun, a street name, a brand)
 * would wedge a real send. Documents import no translation code."_
 *
 * ⚠️ THIS MODULE PRODUCES NO TEXT. It asks the model for a LANGUAGE CODE per
 * field and nothing else, and discards any other field of the reply — so
 * machine output can STOP a send but can never become words on a document
 * (ruling 5). It is deliberately NOT under lib/translation/, which the
 * client-facing test forbids every renderer and send route from reaching.
 *
 * FAILS OPEN: if detection is unavailable, the send proceeds and the log row
 * says so — a model outage must not wedge a real send either.
 *
 * Crew-typed Spanish ALREADY reached clients before this existed: a site-visit
 * title becomes `estimates.name`, which is the proposal's title and its email
 * subject [recorded as ruled, S110 Q14]. This check is what addresses it.
 */

export const LANGUAGE_CHECK_MODEL = 'gpt-4o-mini';
// ⚠️ Read through a summarising fetch at S110 Phase 1, not verbatim.
const USD_PER_M_INPUT = 0.15;
const USD_PER_M_OUTPUT = 0.6;

export interface CheckedField {
  /** Shown to the sender, e.g. "Estimate name" or "Line 3 name". */
  field: string;
  text: string | null | undefined;
}

export interface EnglishCheck {
  /** false = detection was unavailable; the send is NOT blocked (fail open). */
  checked: boolean;
  /** Fields detected as not English, in the order given. */
  flagged: Array<{ field: string; lang: 'es' | 'other' }>;
}

export async function checkClientFacingEnglish(
  admin: SupabaseClient<Database>,
  companyId: string,
  fields: CheckedField[]
): Promise<EnglishCheck> {
  const live = fields.filter(
    (f): f is { field: string; text: string } => !!f.text && /\p{L}/u.test(f.text)
  );
  if (live.length === 0) return { checked: true, flagged: [] };

  const flagged: EnglishCheck['flagged'] = [];
  for (let start = 0; start < live.length; start += 50) {
    const chunk = live.slice(start, start + 50);
    const langs = await detect(
      admin,
      companyId,
      chunk.map((f) => f.text.slice(0, 2000))
    );
    if (!langs) return { checked: false, flagged: [] };
    chunk.forEach((f, i) => {
      const l = langs[i];
      if (l === 'es' || l === 'other') flagged.push({ field: f.field, lang: l });
    });
  }
  return { checked: true, flagged };
}

async function detect(
  admin: SupabaseClient<Database>,
  companyId: string,
  texts: string[]
): Promise<Array<'en' | 'es' | 'other' | undefined> | null> {
  let model = LANGUAGE_CHECK_MODEL;
  let inTok: number | null = null;
  let outTok: number | null = null;
  let error: string | null = null;
  let out: Array<'en' | 'es' | 'other' | undefined> | null = null;
  try {
    const res = await getOpenAI().chat.completions.create({
      model: LANGUAGE_CHECK_MODEL,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'Identify the language of each item. Names, addresses, brands and numbers alone do not make an item non-English. ' +
            'Reply with JSON only: {"items":[{"i":<index>,"lang":"en"|"es"|"other"}]}. Do not include any other text.',
        },
        { role: 'user', content: JSON.stringify({ items: texts.map((text, i) => ({ i, text })) }) },
      ],
    });
    model = res.model || LANGUAGE_CHECK_MODEL;
    inTok = res.usage?.prompt_tokens ?? null;
    outTok = res.usage?.completion_tokens ?? null;
    out = validateLangs(res.choices[0]?.message?.content ?? '', texts.length);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  const cost =
    inTok !== null && outTok !== null
      ? Number(((inTok * USD_PER_M_INPUT + outTok * USD_PER_M_OUTPUT) / 1_000_000).toFixed(6))
      : null;
  // Module 3H: a cost row on success AND failure.
  const { error: logErr } = await admin.from('ai_translation_logs').insert({
    company_id: companyId,
    model,
    target_lang: 'detect',
    text_count: texts.length,
    input_tokens: inTok,
    output_tokens: outTok,
    estimated_cost_usd: cost,
    success: !error && out !== null,
    error_message: error ?? (out === null ? 'unparseable model output' : null),
  });
  if (logErr)
    console.error('[english-check] cost log insert failed', { companyId, message: logErr.message });
  if (error)
    console.error('[english-check] detection failed — sending unchecked', {
      companyId,
      message: error,
    });
  return out;
}

/** Language codes only, for indices we asked about — any other field (a
 *  "translation" the model volunteered) is dropped here. */
export function validateLangs(
  content: string,
  n: number
): Array<'en' | 'es' | 'other' | undefined> | null {
  let body: unknown;
  try {
    body = JSON.parse(content);
  } catch {
    return null;
  }
  const items = (body as { items?: unknown })?.items;
  if (!Array.isArray(items)) return null;
  const out: Array<'en' | 'es' | 'other' | undefined> = new Array(n).fill(undefined);
  for (const it of items) {
    const { i, lang } = (it ?? {}) as { i?: unknown; lang?: unknown };
    if (typeof i !== 'number' || !Number.isInteger(i) || i < 0 || i >= n) continue;
    if (lang === 'en' || lang === 'es' || lang === 'other') out[i] = lang;
  }
  return out;
}

/** The 409 body a send route returns when fields are flagged and not overridden. */
export function nonEnglishResponseBody(flagged: EnglishCheck['flagged']) {
  return {
    code: 'NON_ENGLISH' as const,
    error:
      `These parts of the document are not in English: ${flagged.map((f) => f.field).join(', ')}. ` +
      'A client always receives English. Edit them, or send anyway if they are names or brands.',
    fields: flagged.map((f) => f.field),
  };
}
