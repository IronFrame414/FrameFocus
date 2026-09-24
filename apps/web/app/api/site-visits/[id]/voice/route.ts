import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { resolveEstimateFileAccess } from '@/lib/site-visits/access';
import {
  VOICE_MIME,
  VOICE_NOTE_MAX_BYTES,
  VOICE_NOTE_MAX_SECONDS,
  baseMime,
  extensionFor,
  transcribeVoiceNote,
} from '@/lib/site-visits/transcribe';

// S108 Spec A — upload a voice note to a site visit, then transcribe it.
//
// ⚠️ THE FLOOR IS resolveEstimateFileAccess(), ON THE SESSION, AND IT RUNS
// BEFORE THE SERVICE-ROLE CLIENT IS EVER CONSTRUCTED — the same shape as the
// estimate-files route, and the same shared decision, so the two cannot drift.
//
// ORDER IS THE VOICE RULING: the audio is STORED first, the transcript comes
// after. A transcription failure answers 200 with transcript_status 'failed'
// — the recording is kept and the phone offers a retry; it never loses audio.

const BUCKET = 'project-files';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const estimateId = params.id;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const access = await resolveEstimateFileAccess(supabase, user.id, estimateId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  // [S110 A] a voice note is site-visit material: capture rights, every status.
  if (!access.canCapture) {
    return NextResponse.json(
      { error: 'You cannot add to this site visit.' },
      { status: 403 }
    );
  }

  const form = await req.formData();
  const file = form.get('file');
  const duration = Number(form.get('duration_seconds'));
  const clientId = String(form.get('id') ?? '');
  if (!(file instanceof File)) return NextResponse.json({ error: 'No recording provided' }, { status: 400 });
  if (!/^[0-9a-f-]{36}$/i.test(clientId)) {
    return NextResponse.json({ error: 'A recording id is required' }, { status: 400 });
  }
  if (!Number.isFinite(duration) || duration <= 0) {
    return NextResponse.json({ error: 'Recording length is missing' }, { status: 400 });
  }
  // The phone refuses a long recording BEFORE upload; this is the backstop.
  if (duration > VOICE_NOTE_MAX_SECONDS) {
    return NextResponse.json({ error: 'Voice notes are limited to 10 minutes.' }, { status: 400 });
  }
  if (file.size > VOICE_NOTE_MAX_BYTES) {
    return NextResponse.json({ error: 'Recording too large. Max size is 25 MB.' }, { status: 400 });
  }
  const mime = baseMime(file.type);
  if (!VOICE_MIME.has(mime)) {
    return NextResponse.json({ error: 'That audio format is not supported.' }, { status: 400 });
  }

  const admin = getSupabaseAdmin();

  // Idempotent replay from the offline queue: the same id lands once.
  const { data: existing } = await admin
    .from('site_visit_voice_notes')
    .select('id, transcript_status')
    .eq('id', clientId)
    .eq('estimate_id', estimateId)
    .maybeSingle();
  if (existing) return NextResponse.json({ id: existing.id, transcript_status: existing.transcript_status });

  const storagePath = `${access.companyId}/estimates/${estimateId}/${clientId}-voice.${extensionFor(mime)}`;
  const bytes = Buffer.from(await file.arrayBuffer());
  const { error: upErr } = await admin.storage
    .from(BUCKET)
    .upload(storagePath, bytes, { contentType: mime, upsert: false });
  if (upErr) {
    console.error('[POST /api/site-visits/[id]/voice] storage upload failed', { estimateId, message: upErr.message });
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }

  const { data: fileRow, error: fileErr } = await admin
    .from('files')
    .insert({
      company_id: access.companyId,
      project_id: null,
      estimate_id: estimateId,
      category: 'other',
      // [S110 A, Q4] a voice note's audio is site-visit material by definition.
      site_visit_capture: true,
      file_name: `Voice note ${new Date().toISOString().slice(0, 16).replace('T', ' ')}.${extensionFor(mime)}`,
      file_path: storagePath,
      file_size: file.size,
      mime_type: mime,
      created_by: user.id,
      updated_by: user.id,
    })
    .select('id')
    .single();
  if (fileErr || !fileRow) {
    await admin.storage.from(BUCKET).remove([storagePath]);
    console.error('[POST /api/site-visits/[id]/voice] files insert failed', { estimateId, message: fileErr?.message });
    return NextResponse.json({ error: 'Could not store the recording.' }, { status: 500 });
  }

  const { error: noteErr } = await admin.from('site_visit_voice_notes').insert({
    id: clientId,
    company_id: access.companyId,
    estimate_id: estimateId,
    file_id: fileRow.id,
    duration_seconds: Math.round(duration * 10) / 10,
    transcript_status: 'pending',
    created_by: user.id,
    updated_by: user.id,
  });
  if (noteErr) {
    console.error('[POST /api/site-visits/[id]/voice] voice note insert failed', { estimateId, message: noteErr.message });
    return NextResponse.json({ error: 'Could not store the recording.' }, { status: 500 });
  }

  const outcome = await transcribeVoiceNote(admin, {
    voiceNoteId: clientId,
    companyId: access.companyId,
    bytes,
    mime,
    durationSeconds: duration,
  });
  return NextResponse.json({ id: clientId, transcript_status: outcome.status, error: outcome.error });
}
