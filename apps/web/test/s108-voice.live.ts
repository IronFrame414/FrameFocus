// S108 Spec A — VOICE NOTES, against rebuild-test AND the real OpenAI endpoint.
//
// Every row of the voice ruling that the database or the server can prove:
//   · transcription runs SERVER-SIDE on stored audio, with the ruled model;
//   · the SPOKEN LANGUAGE IS KEPT — a Spanish clip comes back Spanish;
//   · a cost row on SUCCESS and on FAILURE (Module 3H);
//   · a failed transcription leaves the AUDIO untouched and the row 'failed'
//     (the phone's retry), and a retry never overwrites a HUMAN edit;
//   · the recorder edits the transcript until promotion; owner/admin/PM after.
//
// The 10-minute cap BEFORE upload is a phone behaviour — unit-tested in
// s108-voice.test.ts; the route's own backstop is read in the route.
// ⚠️ This file spends real money: two ~6-second transcriptions ≈ $0.001.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { admin, assertRebuildTest, sessionFor } from './live-session';
import {
  TRANSCRIPTION_MODEL,
  TRANSCRIPTION_USD_PER_MINUTE,
  transcribeVoiceNote,
} from '@/lib/site-visits/transcribe';

const MARKER = 'S108A-VOICE';
const BUCKET = 'project-files';
const CLIP = readFileSync(fileURLToPath(new URL('./fixtures/s108-voice-es.mp3', import.meta.url)));
const CLIP_SECONDS = 6.5;

let crewC: SupabaseClient;
let ownerC: SupabaseClient;
let crewUid = '';
let companyId = '';
let contactId = '';
let visitId = '';
let voiceId = '';
let storagePath = '';

async function sweep() {
  const { data } = await admin.from('estimates').select('id').like('name', `${MARKER}%`);
  const ids = (data ?? []).map((e) => e.id);
  if (!ids.length) return;
  const { data: files } = await admin.from('files').select('file_path').in('estimate_id', ids);
  const paths = (files ?? []).map((f) => f.file_path);
  if (paths.length) await admin.storage.from(BUCKET).remove(paths);
  await admin.from('files').delete().in('estimate_id', ids);
  await admin.from('estimates').delete().in('id', ids);
}

beforeAll(async () => {
  assertRebuildTest();
  await sweep();
  [crewC, ownerC] = await Promise.all([
    sessionFor('josh+crew@worthprop.com'),
    sessionFor('josh+test50@worthprop.com'),
  ]);
  const { data: p } = await admin
    .from('profiles')
    .select('user_id, company_id')
    .eq('email', 'josh+crew@worthprop.com')
    .eq('is_deleted', false)
    .single();
  crewUid = (p as { user_id: string }).user_id;
  companyId = (p as { company_id: string }).company_id;
  // Any contact will do; nothing depends on which. Ordered.
  const { data: c } = await admin
    .from('contacts')
    .select('id')
    .eq('company_id', companyId)
    .eq('is_deleted', false)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(1)
    .single();
  contactId = (c as { id: string }).id;

  const v = await crewC.rpc('create_site_visit', { p_title: `${MARKER} bath`, p_contact_id: contactId });
  if (v.error) throw new Error(v.error.message);
  visitId = v.data as string;

  // What the voice ROUTE does after its floor: store the audio, a files row, a
  // pending voice-note row — built here with the same shape.
  voiceId = crypto.randomUUID();
  storagePath = `${companyId}/estimates/${visitId}/${voiceId}-voice.mp3`;
  const up = await admin.storage.from(BUCKET).upload(storagePath, CLIP, { contentType: 'audio/mpeg' });
  if (up.error) throw new Error(up.error.message);
  const { data: f, error: fe } = await admin
    .from('files')
    .insert({
      company_id: companyId, project_id: null, estimate_id: visitId, category: 'other',
      file_name: 'voice.mp3', file_path: storagePath, file_size: CLIP.length, mime_type: 'audio/mpeg',
      created_by: crewUid, updated_by: crewUid,
    })
    .select('id')
    .single();
  if (fe) throw new Error(fe.message);
  const { error: ve } = await admin.from('site_visit_voice_notes').insert({
    id: voiceId, company_id: companyId, estimate_id: visitId, file_id: (f as { id: string }).id,
    duration_seconds: CLIP_SECONDS, transcript_status: 'pending', created_by: crewUid, updated_by: crewUid,
  });
  if (ve) throw new Error(ve.message);
}, 120_000);

afterAll(async () => {
  await sweep();
}, 120_000);

async function note() {
  const { data } = await admin
    .from('site_visit_voice_notes')
    .select('transcript_status, transcript, transcript_machine, transcript_model, transcript_error, transcript_edited_at')
    .eq('id', voiceId)
    .single();
  return data as Record<string, string | null>;
}
async function logs() {
  const { data } = await admin
    .from('ai_transcription_logs')
    .select('model, success, estimated_cost_usd, error_message, audio_seconds')
    .eq('voice_note_id', voiceId)
    .order('created_at', { ascending: true });
  return (data ?? []) as Array<Record<string, unknown>>;
}

describe('S108 A — voice: a FAILED transcription keeps the audio and offers a retry', () => {
  it('V1 — garbage bytes → status failed, reason stored, a cost row with success=false, audio untouched', async () => {
    const out = await transcribeVoiceNote(admin as never, {
      voiceNoteId: voiceId, companyId, bytes: Buffer.from('not audio at all'), mime: 'audio/mpeg',
      durationSeconds: CLIP_SECONDS,
    });
    expect(out.status).toBe('failed');
    const n = await note();
    expect(n.transcript_status).toBe('failed');
    expect(n.transcript_error).toBeTruthy();
    expect(n.transcript).toBeNull();
    const l = await logs();
    expect(l).toHaveLength(1);
    expect(l[0]).toMatchObject({ model: TRANSCRIPTION_MODEL, success: false, estimated_cost_usd: null });
    // The stored audio is byte-identical to what was uploaded.
    const { data: blob } = await admin.storage.from(BUCKET).download(storagePath);
    expect(Buffer.from(await blob!.arrayBuffer()).equals(CLIP)).toBe(true);
  });
});

describe('S108 A — voice: the retry, in the SPOKEN language', () => {
  it('V2 — the stored clip → done; Spanish comes back SPANISH; a success cost row at the ruled price', async () => {
    const out = await transcribeVoiceNote(admin as never, {
      voiceNoteId: voiceId, companyId, bytes: CLIP, mime: 'audio/mpeg', durationSeconds: CLIP_SECONDS,
    });
    expect(out.status, out.error ?? '').toBe('done');
    const n = await note();
    expect(n.transcript_status).toBe('done');
    expect(n.transcript_model).toBe(TRANSCRIPTION_MODEL);
    // Structure, not exact wording (CLAUDE.md: tests on AI assert structure).
    // Spanish words from the clip, and NOT an English rendering of them.
    expect((n.transcript_machine ?? '').toLowerCase()).toMatch(/azulejo|cocina|piso/);
    expect((n.transcript_machine ?? '').toLowerCase()).not.toMatch(/\bthe kitchen\b|\btile\b/);
    expect(n.transcript).toBe(n.transcript_machine); // the editable copy starts as the machine text
    const l = await logs();
    expect(l).toHaveLength(2);
    expect(l[1]).toMatchObject({ success: true });
    expect(Number(l[1].estimated_cost_usd)).toBeCloseTo((CLIP_SECONDS / 60) * TRANSCRIPTION_USD_PER_MINUTE, 6);
  });
});

describe('S108 A — voice: who may edit the transcript', () => {
  it('V3 — the RECORDER edits it before promotion; the machine text is kept', async () => {
    const r = await crewC.rpc('update_voice_note_transcript', {
      p_voice_note_id: voiceId, p_transcript: 'El azulejo de la cocina está roto (corregido).',
    });
    expect(r.error, r.error?.message).toBeNull();
    const n = await note();
    expect(n.transcript).toContain('corregido');
    expect(n.transcript_edited_at).toBeTruthy();
    expect(n.transcript_machine).not.toContain('corregido');
  });

  it('V4 — a later re-transcription never overwrites the HUMAN edit', async () => {
    await admin.from('site_visit_voice_notes').update({ transcript_status: 'failed' }).eq('id', voiceId);
    const out = await transcribeVoiceNote(admin as never, {
      voiceNoteId: voiceId, companyId, bytes: CLIP, mime: 'audio/mpeg', durationSeconds: CLIP_SECONDS,
    });
    expect(out.status).toBe('done');
    expect((await note()).transcript).toContain('corregido');
  });

  it('V5 — after PROMOTION the recorder may NOT edit it; the owner may', async () => {
    const p = await ownerC.rpc('promote_site_visit', { p_estimate_id: visitId });
    expect(p.error, p.error?.message).toBeNull();
    const crew = await crewC.rpc('update_voice_note_transcript', { p_voice_note_id: voiceId, p_transcript: 'late' });
    expect(crew.error?.code).toBe('42501');
    const owner = await ownerC.rpc('update_voice_note_transcript', {
      p_voice_note_id: voiceId, p_transcript: 'Revisado por la oficina.',
    });
    expect(owner.error, owner.error?.message).toBeNull();
    expect((await note()).transcript).toBe('Revisado por la oficina.');
    // And the recorder still READS it (money-free table, created_by = them).
    const read = await crewC.from('site_visit_voice_notes').select('transcript').eq('id', voiceId);
    expect(read.data).toEqual([{ transcript: 'Revisado por la oficina.' }]);
  });
});
