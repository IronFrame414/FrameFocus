import 'server-only';
import { toFile } from 'openai';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import { getOpenAI } from '@/lib/openai';

// S108 Spec A — VOICE NOTE TRANSCRIPTION. Module 3H's reference pattern
// (ai-tagging.ts) applied to audio:
//   1. lazy client (getOpenAI) — never at module load;
//   2. a cost row on EVERY call, success and failure (ai_transcription_logs);
//   3. cheapest checks first — the caller has already passed auth and the
//      floor; this function checks the row, then the size, then calls out;
//   4. no retry inside — a retry is the phone's button, never a silent loop
//      that could double-charge.
//
// ⚠️ LANGUAGE [RULED]: the spoken language is KEPT. This calls
// /audio/transcriptions — never /audio/translations — and passes NO `language`
// and NO `prompt`, so nothing nudges Spanish toward English. Proven S108 on a
// real Spanish clip: it came back in Spanish.
//
// MODEL: gpt-4o-transcribe, chosen from the models this key lists (S108) and
// proven by a real call. Price $0.006 / minute — read from OpenAI's pricing
// page (developers.openai.com/api/docs/pricing, "Transcription models",
// 2026-09-22). ⚠️ The transcription response carries NO `model` field, so the
// Module 3H rule "log the RESOLVED model, not the alias" cannot be met here:
// the REQUESTED id is logged, and that is stated rather than hidden.
export const TRANSCRIPTION_MODEL = 'gpt-4o-transcribe';
export const TRANSCRIPTION_USD_PER_MINUTE = 0.006;
/** The ruled cap. Refused on the phone BEFORE upload, and again server-side. */
export const VOICE_NOTE_MAX_SECONDS = 600;
/** OpenAI's upload cap for /audio/transcriptions, and the route's MAX_SIZE. */
export const VOICE_NOTE_MAX_BYTES = 25 * 1024 * 1024;

export const VOICE_MIME = new Set([
  'audio/webm',
  'audio/mp4',
  'audio/x-m4a',
  'audio/m4a',
  'audio/aac',
  'audio/mpeg',
  'audio/ogg',
  'audio/wav',
  'audio/x-wav',
]);

/** Strip codec parameters: `audio/webm;codecs=opus` → `audio/webm`. */
export function baseMime(mime: string): string {
  return (mime || '').split(';')[0].trim().toLowerCase();
}

export function extensionFor(mime: string): string {
  const m = baseMime(mime);
  if (m === 'audio/webm') return 'webm';
  if (m === 'audio/ogg') return 'ogg';
  if (m === 'audio/mpeg') return 'mp3';
  if (m === 'audio/wav' || m === 'audio/x-wav') return 'wav';
  return 'm4a'; // mp4 / m4a / aac — what iOS Safari's MediaRecorder produces
}

export interface TranscribeOutcome {
  status: 'done' | 'failed';
  transcript: string | null;
  error: string | null;
}

/**
 * Transcribe one stored voice note and write the result onto its row. The
 * AUDIO IS NEVER TOUCHED — only site_visit_voice_notes' transcript columns.
 * A failure leaves the row `failed` with the reason, so the phone shows a
 * retry; the audio file stays exactly as uploaded.
 */
export async function transcribeVoiceNote(
  admin: SupabaseClient<Database>,
  args: {
    voiceNoteId: string;
    companyId: string;
    bytes: Buffer;
    mime: string;
    durationSeconds: number;
  }
): Promise<TranscribeOutcome> {
  const { voiceNoteId, companyId, bytes, mime, durationSeconds } = args;
  const minutes = Math.max(durationSeconds, 1) / 60;
  const estimatedCost = Number((minutes * TRANSCRIPTION_USD_PER_MINUTE).toFixed(6));

  let text: string | null = null;
  let error: string | null = null;
  try {
    const file = await toFile(bytes, `voice.${extensionFor(mime)}`, { type: baseMime(mime) });
    const res = await getOpenAI().audio.transcriptions.create({ model: TRANSCRIPTION_MODEL, file });
    text = (res.text ?? '').trim();
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  // Cost row first, success or failure — a failed call can still cost money.
  const { error: logErr } = await admin.from('ai_transcription_logs').insert({
    company_id: companyId,
    voice_note_id: voiceNoteId,
    model: TRANSCRIPTION_MODEL,
    audio_seconds: durationSeconds,
    estimated_cost_usd: error ? null : estimatedCost,
    success: !error,
    error_message: error,
  });
  if (logErr) console.error('[site-visit voice] cost log insert failed', { voiceNoteId, message: logErr.message });

  const now = new Date().toISOString();
  const update = error
    ? { transcript_status: 'failed', transcript_error: error.slice(0, 500), transcript_model: TRANSCRIPTION_MODEL }
    : {
        transcript_status: 'done',
        transcript_machine: text,
        // The editable copy starts as the machine text, unless someone has
        // already typed one (a retry must never overwrite a human edit).
        transcript_error: null,
        transcript_model: TRANSCRIPTION_MODEL,
        transcribed_at: now,
      };
  const { error: upErr } = await admin
    .from('site_visit_voice_notes')
    .update(update as never)
    .eq('id', voiceNoteId);
  if (upErr) {
    console.error('[site-visit voice] transcript write failed', { voiceNoteId, message: upErr.message });
    return { status: 'failed', transcript: null, error: 'Could not save the transcript.' };
  }
  if (!error) {
    await admin
      .from('site_visit_voice_notes')
      .update({ transcript: text } as never)
      .eq('id', voiceNoteId)
      .is('transcript_edited_at', null);
  }
  return error
    ? { status: 'failed', transcript: null, error: 'Transcription failed — the recording is saved. Try again.' }
    : { status: 'done', transcript: text, error: null };
}
