'use client';

import { useEffect, useRef, useState } from 'react';
import {
  retryTranscription,
  updateVoiceTranscript,
  uploadVoiceNote,
  type SiteVisitVoiceNote,
} from '@/lib/services/site-visits-client';
import { useOfflineSync } from '@/app/m/offline-sync';
import { useOnline } from '@/app/m/write-ui';

// S108 Spec A — VOICE NOTES [RULED, voice ruling].
//
//   · 10 MINUTES MAX, REFUSED BEFORE UPLOAD. The recorder stops itself at the
//     cap, and a recording whose measured length is over it is refused here
//     with a message and never sent. (The route refuses it again.)
//   · Audio is held OFFLINE like photos — a failed upload goes to the offline
//     queue with the same id, never dropped.
//   · Transcribed SERVER-SIDE after the audio is stored. A failed transcription
//     shows here with a retry; the audio is never lost or altered.
//   · The transcript keeps the SPOKEN language — no translation anywhere.
//   · The recorder edits the transcript until promotion; owner/admin/PM after.
//     The machine transcript is kept separately and never overwritten.

export const MAX_SECONDS = 600;

function pickMime(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  for (const m of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/aac']) {
    if (MediaRecorder.isTypeSupported?.(m)) return m;
  }
  return '';
}

function mmss(s: number): string {
  const t = Math.max(0, Math.floor(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

/** Pure, and exported for the unit suite: may this recording be sent? */
export function voiceLengthRefusal(seconds: number): string | null {
  if (!(seconds > 0)) return 'That recording is empty.';
  if (seconds > MAX_SECONDS) return 'Voice notes are limited to 10 minutes. This one was not sent — record it in shorter parts.';
  return null;
}

export function VoiceNotes({
  estimateId,
  voiceNotes,
  audioUrls,
  canWrite,
  office,
  viewerUserId,
  onChanged,
}: {
  estimateId: string;
  voiceNotes: SiteVisitVoiceNote[];
  audioUrls: Record<string, string | null>;
  canWrite: boolean;
  office: boolean;
  viewerUserId: string;
  onChanged: () => void | Promise<void>;
}) {
  const online = useOnline();
  const offlineSync = useOfflineSync();
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const startedAt = useRef(0);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);
  const cappedRef = useRef(false);

  useEffect(
    () => () => {
      if (tick.current) clearInterval(tick.current);
      recRef.current?.stream.getTracks().forEach((t) => t.stop());
    },
    []
  );

  const supported = typeof window !== 'undefined' && typeof MediaRecorder !== 'undefined';

  async function start() {
    setMessage(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = pickMime();
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunks.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.current.push(e.data);
      };
      rec.onstop = () => void finish(rec.mimeType || mime || 'audio/webm');
      recRef.current = rec;
      startedAt.current = Date.now();
      cappedRef.current = false;
      setElapsed(0);
      rec.start(1000);
      setRecording(true);
      tick.current = setInterval(() => {
        const s = (Date.now() - startedAt.current) / 1000;
        setElapsed(s);
        // The cap stops the recorder itself — a note can never run past it.
        if (s >= MAX_SECONDS && recRef.current?.state === 'recording') {
          cappedRef.current = true;
          recRef.current.stop();
        }
      }, 250);
    } catch {
      setMessage('The microphone is not available. Allow microphone access and try again.');
    }
  }

  function stop() {
    if (recRef.current?.state === 'recording') recRef.current.stop();
  }

  async function finish(mime: string) {
    if (tick.current) clearInterval(tick.current);
    recRef.current?.stream.getTracks().forEach((t) => t.stop());
    setRecording(false);
    const measured = Math.round(((Date.now() - startedAt.current) / 1000) * 10) / 10;
    // Stopped BY the cap → it is exactly the cap (the stop lands a few hundred
    // ms late). Over the cap WITHOUT the cap firing means the timer was paused
    // (a backgrounded tab) while the microphone kept going — a genuinely long
    // recording, and the ruling refuses it before upload.
    const seconds = cappedRef.current ? MAX_SECONDS : measured;
    const refusal = voiceLengthRefusal(seconds);
    if (refusal) {
      setMessage(refusal);
      return;
    }
    const blob = new Blob(chunks.current, { type: mime });
    const id = crypto.randomUUID();
    setBusy(true);
    const r = online ? await uploadVoiceNote(estimateId, blob, seconds, id) : { success: false as const };
    setBusy(false);
    if (r.success) {
      if ('transcriptStatus' in r && r.transcriptStatus === 'failed') {
        setMessage('Saved. The transcript did not come through — tap "Try again" on the note.');
      }
      await onChanged();
      return;
    }
    if (!offlineSync) {
      setMessage('The recording did not upload and cannot be held on this device. Record it again with signal.');
      return;
    }
    await offlineSync.enqueue({
      entry_id: crypto.randomUUID(),
      target_id: id,
      op: 'insert',
      entity: 'site_visit_media',
      payload: { kind: 'voice', estimate_id: estimateId, id, blob, duration_seconds: seconds },
      captured_at: new Date().toISOString(),
    });
    setMessage('Saved on this phone — it uploads and transcribes when signal returns.');
  }

  const held = (offlineSync?.entries ?? []).filter(
    (e) =>
      e.entity === 'site_visit_media' &&
      (e.payload as { estimate_id?: string; kind?: string }).estimate_id === estimateId &&
      (e.payload as { kind?: string }).kind === 'voice'
  ).length;

  return (
    <section data-testid="sv-section-voice" className="mt-[18px]">
      <h2 className="mb-[8px] font-mono text-[11px] font-medium uppercase tracking-wide text-m6m-muted">
        Voice notes {voiceNotes.length > 0 ? `· ${voiceNotes.length}` : ''}
        {held > 0 ? ` · ${held} waiting for signal` : ''}
      </h2>
      {message ? (
        <p data-testid="sv-voice-message" role="status" className="mb-[8px] text-[14px] text-m6m-navy">
          {message}
        </p>
      ) : null}
      {voiceNotes.length === 0 ? <p className="text-[14px] text-m6m-muted">None yet.</p> : null}
      <ul className="flex flex-col gap-[8px]">
        {voiceNotes.map((v) => (
          <VoiceRow
            key={v.id}
            note={v}
            url={v.file_id ? audioUrls[v.file_id] ?? null : null}
            editable={canWrite && (office || v.created_by === viewerUserId)}
            onChanged={onChanged}
          />
        ))}
      </ul>
      {canWrite ? (
        supported ? (
          <button
            type="button"
            data-testid="sv-voice-record"
            disabled={busy}
            onClick={recording ? stop : start}
            className={`mt-[10px] flex h-[56px] w-full items-center justify-center rounded-[14px] text-[16px] font-bold text-white disabled:opacity-40 ${
              recording ? 'bg-m6m-danger' : 'bg-m6m-blue'
            }`}
          >
            {busy ? 'Saving…' : recording ? `Stop · ${mmss(elapsed)} / 10:00` : 'Record a voice note'}
          </button>
        ) : (
          <p className="mt-[8px] text-[14px] text-m6m-muted">This browser cannot record audio.</p>
        )
      ) : null}
    </section>
  );
}

function VoiceRow({
  note,
  url,
  editable,
  onChanged,
}: {
  note: SiteVisitVoiceNote;
  url: string | null;
  editable: boolean;
  onChanged: () => void | Promise<void>;
}) {
  const online = useOnline();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(note.transcript ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  return (
    <li
      data-testid="sv-voice-note"
      data-status={note.transcript_status}
      className="rounded-[12px] border border-m6m-border bg-m6m-card px-[12px] py-[10px]"
    >
      <div className="mb-[6px] font-mono text-[12px] text-m6m-muted">
        {mmss(Number(note.duration_seconds))}
        {note.transcript_edited_at ? ' · transcript edited' : ''}
      </div>
      {url ? <audio controls preload="none" src={url} className="w-full" /> : null}
      {note.transcript_status === 'pending' ? (
        <p className="mt-[6px] text-[14px] text-m6m-muted">Transcribing…</p>
      ) : note.transcript_status === 'failed' ? (
        <div className="mt-[6px]">
          <p data-testid="sv-voice-failed" className="text-[14px] text-m6m-danger">
            The transcript did not come through. The recording is saved.
          </p>
          {editable ? (
            <button
              type="button"
              data-testid="sv-voice-retry"
              disabled={busy || !online}
              onClick={async () => {
                setBusy(true);
                setErr(null);
                const r = await retryTranscription(note.id);
                setBusy(false);
                if (!r.success) setErr(r.error ?? 'Still did not come through.');
                await onChanged();
              }}
              className="mt-[6px] h-[44px] rounded-[10px] border border-m6m-blue px-[14px] text-[14px] font-semibold text-m6m-blue disabled:opacity-40"
            >
              {busy ? 'Trying…' : 'Try again'}
            </button>
          ) : null}
        </div>
      ) : editing ? (
        <div className="mt-[6px]">
          <textarea
            data-testid="sv-voice-transcript-edit"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            className="w-full rounded-[10px] border border-m6m-border px-[10px] py-[8px] text-[15px]"
          />
          <div className="mt-[6px] flex gap-[8px]">
            <button
              type="button"
              disabled={busy || !online}
              onClick={async () => {
                setBusy(true);
                setErr(null);
                const r = await updateVoiceTranscript(note.id, text);
                setBusy(false);
                if (!r.success) setErr(r.error ?? 'Could not save.');
                else {
                  setEditing(false);
                  await onChanged();
                }
              }}
              className="h-[40px] rounded-[10px] bg-m6m-blue px-[14px] text-[14px] font-semibold text-white disabled:opacity-40"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => {
                setText(note.transcript ?? '');
                setEditing(false);
              }}
              className="h-[40px] rounded-[10px] border border-m6m-border px-[14px] text-[14px]"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          <p data-testid="sv-voice-transcript" className="mt-[6px] whitespace-pre-wrap text-[15px] text-m6m-navy">
            {note.transcript || '(nothing heard)'}
          </p>
          {editable ? (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="mt-[6px] h-[40px] rounded-[10px] border border-m6m-border px-[14px] text-[14px]"
            >
              Edit transcript
            </button>
          ) : null}
        </>
      )}
      {err ? <p className="mt-[6px] text-[14px] text-m6m-danger">{err}</p> : null}
    </li>
  );
}
