import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { transcribeVoiceNote } from '@/lib/site-visits/transcribe';

// S108 Spec A — RETRY a failed transcription (the phone's "Try again").
//
// THE FLOOR: the voice note is read through the caller's SESSION (the
// site_visit_voice_notes SELECT policy — office, or the recorder's own), and
// site_visit_access() must say the caller may still write. Only then is the
// service-role client used, to fetch the stored audio. The audio is read,
// never rewritten.

const BUCKET = 'project-files';

export async function POST(_req: Request, { params }: { params: { voiceId: string } }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { data: note } = await supabase
    .from('site_visit_voice_notes')
    .select('id, estimate_id, company_id, file_id, duration_seconds, transcript_status')
    .eq('id', params.voiceId)
    .eq('is_deleted', false)
    .maybeSingle();
  if (!note) return NextResponse.json({ error: 'Voice note not found' }, { status: 404 });

  const { data: access } = await supabase.rpc('site_visit_access', { p_estimate_id: note.estimate_id });
  if (!access) {
    return NextResponse.json({ error: 'You cannot change this voice note.' }, { status: 403 });
  }
  if (note.transcript_status === 'done') {
    return NextResponse.json({ id: note.id, transcript_status: 'done' });
  }

  const admin = getSupabaseAdmin();
  const { data: file } = await admin
    .from('files')
    .select('file_path, mime_type')
    .eq('id', note.file_id as string)
    .maybeSingle();
  if (!file) {
    console.error('[transcribe retry] audio file row missing', { voiceNoteId: note.id });
    return NextResponse.json({ error: 'The recording could not be found.' }, { status: 500 });
  }
  const { data: blob, error: dlErr } = await admin.storage.from(BUCKET).download(file.file_path);
  if (dlErr || !blob) {
    console.error('[transcribe retry] audio download failed', { voiceNoteId: note.id, message: dlErr?.message });
    return NextResponse.json({ error: 'The recording could not be read.' }, { status: 500 });
  }

  const outcome = await transcribeVoiceNote(admin, {
    voiceNoteId: note.id,
    companyId: note.company_id,
    bytes: Buffer.from(await blob.arrayBuffer()),
    mime: file.mime_type,
    durationSeconds: Number(note.duration_seconds),
  });
  return NextResponse.json({ id: note.id, transcript_status: outcome.status, error: outcome.error });
}
