import { createClient } from '@/lib/supabase-server';
import { getOpenAI } from '@/lib/openai';
import { getActiveTags } from '@/lib/services/tag-options';
import { getSignedUrl } from '@/lib/services/files';

// ----------------------------------------------------------------------------
// Constants
// ----------------------------------------------------------------------------

const MAX_TAGS = 4;
const MODEL = 'gpt-4o';
const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];
const SIGNED_URL_TTL_SECONDS = 300;

// GPT-4o pricing, USD per million tokens.
// VERIFY before public launch and any time OpenAI publishes a price change.
// Source: https://openai.com/api/pricing/
const INPUT_COST_PER_M = 2.5;
const OUTPUT_COST_PER_M = 10.0;

// ----------------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------------

export type AutoTagResult = { success: true; tags: string[] } | { success: false; reason: string };

// ----------------------------------------------------------------------------
// autoTagFile — runs the full AI auto-tag pipeline for one file.
//
// Pre-flight checks bail early without an OpenAI call:
//   1. Auth check
//   2. File fetch (RLS scopes to user's company)
//   3. MIME check (images only)
//   4. Add-on flag check (companies.ai_tagging_enabled)
//   5. Active tags check (at least one tag in the company's allowed list)
//
// After a successful GPT-4o call, the response is parsed, validated against
// the allowed tag list, capped at MAX_TAGS, written to files.ai_tags, and
// logged to ai_tag_logs. Failures are also logged to ai_tag_logs for cost
// tracking and debugging.
//
// Returns a structured result. The caller (the route) can return it as JSON.
// ----------------------------------------------------------------------------

export async function autoTagFile(fileId: string): Promise<AutoTagResult> {
  const supabase = await createClient();

  // 1. Auth check
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, reason: 'unauthenticated' };
  }

  // 2. Fetch file (RLS filters by company_id)
  const { data: file, error: fileError } = await supabase
    .from('files')
    .select('id, company_id, file_path, mime_type')
    .eq('id', fileId)
    .single();

  if (fileError || !file) {
    return { success: false, reason: 'not_found' };
  }

  // 3. MIME check
  if (!IMAGE_MIME_TYPES.includes(file.mime_type)) {
    return { success: false, reason: 'not_image' };
  }

  // 4. Add-on flag check
  const { data: company } = await supabase
    .from('companies')
    .select('ai_tagging_enabled')
    .eq('id', file.company_id)
    .single();

  if (!company?.ai_tagging_enabled) {
    return { success: false, reason: 'add_on_disabled' };
  }

  // 5. Active tags check
  const activeTags = await getActiveTags();
  if (activeTags.length === 0) {
    return { success: false, reason: 'no_tags_configured' };
  }

  // Sign a short-lived URL for GPT to fetch the image
  const signedUrl = await getSignedUrl(file.file_path, SIGNED_URL_TTL_SECONDS);
  if (!signedUrl) {
    return { success: false, reason: 'signed_url_failed' };
  }

  // Build the grouped tag list for the prompt
  const tagsByCategory: Record<string, string[]> = {};
  for (const tag of activeTags) {
    if (!tagsByCategory[tag.category]) tagsByCategory[tag.category] = [];
    tagsByCategory[tag.category].push(tag.name);
  }
  const groupedTagList = Object.entries(tagsByCategory)
    .map(([category, names]) => `${category.toUpperCase()}: ${names.join(', ')}`)
    .join('\n');

  const prompt = `You are a construction-photo tagger for FrameFocus, a contractor management platform. You analyze a single photo and select the most relevant tags from a fixed allowed list.

Rules:
1. Pick AT MOST ${MAX_TAGS} tags.
2. ONLY pick tags from the allowed list below. Do not invent new tags. Do not modify the spelling or wording of any tag.
3. Pick a tag only if you are clearly confident it applies to the photo. Skip uncertain matches.
4. Return a JSON object with a single "tags" property whose value is an array of tag strings. Example: {"tags": ["bathroom", "plumbing", "rough-in"]}

Allowed tags (grouped by category for context — return only the tag names, not the categories):

${groupedTagList}`;

  // ------------------------------------------------------------------------
  // OpenAI call
  // ------------------------------------------------------------------------

  let validatedTags: string[] = [];
  let inputTokens = 0;
  let outputTokens = 0;
  let callSucceeded = false;
  let errorMessage: string | null = null;
  let resolvedModel = MODEL;

  try {
    const openai = getOpenAI();
    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: signedUrl } },
          ],
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2,
      max_tokens: 100,
    });

    inputTokens = response.usage?.prompt_tokens ?? 0;
    outputTokens = response.usage?.completion_tokens ?? 0;
    resolvedModel = response.model ?? MODEL;

    const content = response.choices[0]?.message?.content;
    if (!content) {
      errorMessage = 'Empty response from OpenAI';
    } else {
      try {
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed.tags)) {
          // Server-side validation — discard any tag not in the company's active list.
          // Per Session 30 decision #3: trust the prompt, verify the output.
          const allowedSet = new Set(activeTags.map((t) => t.name));
          validatedTags = parsed.tags
            .filter((t: unknown): t is string => typeof t === 'string' && allowedSet.has(t))
            .slice(0, MAX_TAGS);
          callSucceeded = true;
        } else {
          errorMessage = 'Response missing tags array';
        }
      } catch (e) {
        errorMessage = `JSON parse failed: ${e instanceof Error ? e.message : 'unknown'}`;
      }
    }
  } catch (e) {
    errorMessage = e instanceof Error ? e.message : 'Unknown OpenAI error';
  }

  // ------------------------------------------------------------------------
  // Cost calculation + always-log
  // ------------------------------------------------------------------------

  const estimatedCost =
    (inputTokens / 1_000_000) * INPUT_COST_PER_M + (outputTokens / 1_000_000) * OUTPUT_COST_PER_M;

  await supabase.from('ai_tag_logs').insert({
    company_id: file.company_id,
    file_id: file.id,
    model: resolvedModel,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    estimated_cost_usd: estimatedCost,
    success: callSucceeded,
    error_message: errorMessage,
  });

  // ------------------------------------------------------------------------
  // Write validated tags to the file (if any made it through)
  // ------------------------------------------------------------------------

  if (callSucceeded && validatedTags.length > 0) {
    await supabase.from('files').update({ ai_tags: validatedTags }).eq('id', fileId);
  }

  if (callSucceeded) {
    return { success: true, tags: validatedTags };
  }
  return { success: false, reason: errorMessage ?? 'unknown_error' };
}
