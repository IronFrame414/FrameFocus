'use client';

import { addedAfterSend } from '@/lib/site-visits/photos';
import { useEffect, useRef, useState } from 'react';
import {
  retryTranscription,
  updateVoiceTranscript,
  uploadVoiceNote,
  type SiteVisitVoiceNote,
} from '@/lib/services/site-visits-client';
import { useOfflineSync } from '@/app/m/offline-sync';
import { useOnline } from '@/app/m/write-ui';
import { useT } from '@/components/i18n/language-provider';
import { UserText } from '@/components/i18n/user-text';
import { makeT, type T } from '@/lib/i18n/messages';

// S108 Spec A — VOICE NOTES [RULED, voice ruling].
//
//   · 10 MINUTES MAX, REFUSED BEFORE UPLOAD. The recorder stops itself at the
//     cap, and a recording whose measured length is over it is refused here
//     with a message and never sent. (The route refuses it again.)
//   · Audio is held OFFLINE like photos — a failed upload goes to the offline
//     queue with the same id, never dropped.
//   · Transcribed SERVER-SIDE after the audio is stored. A failed transcription
//     shows here with a retry; the audio is never lost or altered.
//   · The transcript is STORED in the spoken language and never overwritten by
//     a translation. [S110 H, ruling 3] it is DISPLAYED through <UserText> —
//     the reader's language — while the edit box always holds the original.
//     _Superseded, quoted: "The transcript keeps the SPOKEN language — no
//     translation anywhere."_ (Storage half still stands.)
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

/**
 * Pure, and exported for the unit suite: may this recording be sent? The
 * message is in the caller's language; without a `t` it is English.
 */
export function voiceLengthRefusal(seconds: number, t: T = makeT('en')): string | null {
  if (!(seconds > 0)) return t('visit.voice.empty');
  if (seconds > MAX_SECONDS) return t('visit.voice.tooLong');
  return null;
}

export function VoiceNotes({
  estimateId,
  voiceNotes,
  audioUrls,
  canWrite,
  frozenAt,
  onChanged,
}: {
  estimateId: string;
  voiceNotes: SiteVisitVoiceNote[];
  audioUrls: Record<string, string | null>;
  /** site_visit_access() — this viewer may ADD (every status, S110 A). */
  canWrite: boolean;
  /** site_visits.frozen_at — a note recorded at or before it is frozen. */
  frozenAt: string | null;
  onChanged: () => void | Promise<void>;
}) {
  const t = useT();
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
      recRef.current?.stream.getTracks().forEach((track) => track.stop());
    },
    []
  );

  // [S112 audit F16] Known only AFTER mount. Computed during render, this was
  // false on the server and true in the browser, so every load of
  // /m/site-visits/[id] failed hydration (React #418 ×9 + #423: the server
  // HTML was thrown away and the page re-rendered) and briefly said "This
  // browser cannot record audio" on phones that can. `null` = not yet known,
  // rendered as a same-height blank so neither message flashes.
  const [supported, setSupported] = useState<boolean | null>(null);
  useEffect(() => {
    setSupported(typeof MediaRecorder !== 'undefined');
  }, []);

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
      setMessage(t('visit.voice.noMic'));
    }
  }

  function stop() {
    if (recRef.current?.state === 'recording') recRef.current.stop();
  }

  async function finish(mime: string) {
    if (tick.current) clearInterval(tick.current);
    recRef.current?.stream.getTracks().forEach((track) => track.stop());
    setRecording(false);
    const measured = Math.round(((Date.now() - startedAt.current) / 1000) * 10) / 10;
    // Stopped BY the cap → it is exactly the cap (the stop lands a few hundred
    // ms late). Over the cap WITHOUT the cap firing means the timer was paused
    // (a backgrounded tab) while the microphone kept going — a genuinely long
    // recording, and the ruling refuses it before upload.
    const seconds = cappedRef.current ? MAX_SECONDS : measured;
    const refusal = voiceLengthRefusal(seconds, t);
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
        setMessage(t('visit.voice.transcriptFailedSaved'));
      }
      await onChanged();
      return;
    }
    if (!offlineSync) {
      setMessage(t('visit.voice.cannotHold'));
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
    setMessage(t('visit.voice.heldOnPhone'));
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
        {t('visit.voice.title')} {voiceNotes.length > 0 ? `· ${voiceNotes.length}` : ''}
        {held > 0 ? ` · ${t('visit.waitingForSignal', { n: held })}` : ''}
      </h2>
      {message ? (
        <p data-testid="sv-voice-message" role="status" className="mb-[8px] text-[14px] text-m6m-navy">
          {message}
        </p>
      ) : null}
      {voiceNotes.length === 0 ? <p className="text-[14px] text-m6m-muted">{t('visit.noneYet')}</p> : null}
      <ul className="flex flex-col gap-[8px]">
        {voiceNotes.map((v) => (
          <VoiceRow
            key={v.id}
            note={v}
            url={v.file_id ? audioUrls[v.file_id] ?? null : null}
            // [S110 A] any internal employee edits any transcript, unless the
            // note existed when the estimate was sent (the database refuses it too).
            // _Superseded: `canWrite && (office || v.created_by === viewerUserId)`._
            editable={canWrite && !(frozenAt && v.created_at && v.created_at <= frozenAt)}
            addedAfterSend={addedAfterSend(v.created_at, frozenAt)}
            onChanged={onChanged}
          />
        ))}
      </ul>
      {canWrite && supported === null ? (
        <div className="mt-[10px] h-[56px]" aria-hidden data-testid="sv-voice-pending" />
      ) : canWrite ? (
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
            {busy
              ? t('visit.voice.saving')
              : recording
                ? t('visit.voice.stop', { time: mmss(elapsed) })
                : t('visit.voice.record')}
          </button>
        ) : (
          <p className="mt-[8px] text-[14px] text-m6m-muted">{t('visit.voice.unsupported')}</p>
        )
      ) : null}
    </section>
  );
}

function VoiceRow({
  note,
  url,
  editable,
  addedAfterSend: after,
  onChanged,
}: {
  note: SiteVisitVoiceNote;
  url: string | null;
  editable: boolean;
  addedAfterSend: boolean;
  onChanged: () => void | Promise<void>;
}) {
  const t = useT();
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
        {note.transcript_edited_at ? ` · ${t('visit.voice.transcriptEdited')}` : ''}
        {after ? <span data-testid="sv-added-after"> · {t('visit.voice.addedAfterSend')}</span> : null}
      </div>
      {url ? <audio data-testid="sv-voice-audio" controls preload="none" src={url} className="w-full" /> : null}
      {note.transcript_status === 'pending' ? (
        <p className="mt-[6px] text-[14px] text-m6m-muted">{t('visit.voice.transcribing')}</p>
      ) : note.transcript_status === 'failed' ? (
        <div className="mt-[6px]">
          <p data-testid="sv-voice-failed" className="text-[14px] text-m6m-danger">
            {t('visit.voice.failed')}
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
                if (!r.success) setErr(r.error ?? t('visit.voice.stillFailed'));
                await onChanged();
              }}
              className="mt-[6px] h-[44px] rounded-[10px] border border-m6m-blue px-[14px] text-[14px] font-semibold text-m6m-blue disabled:opacity-40"
            >
              {busy ? t('visit.voice.trying') : t('visit.voice.tryAgain')}
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
                if (!r.success) setErr(r.error ?? t('visit.voice.couldNotSave'));
                else {
                  setEditing(false);
                  await onChanged();
                }
              }}
              className="h-[40px] rounded-[10px] bg-m6m-blue px-[14px] text-[14px] font-semibold text-white disabled:opacity-40"
            >
              {t('visit.save')}
            </button>
            <button
              type="button"
              onClick={() => {
                setText(note.transcript ?? '');
                setEditing(false);
              }}
              className="h-[40px] rounded-[10px] border border-m6m-border px-[14px] text-[14px]"
            >
              {t('visit.cancel')}
            </button>
          </div>
        </div>
      ) : (
        <>
          <p data-testid="sv-voice-transcript" className="mt-[6px] whitespace-pre-wrap text-[15px] text-m6m-navy">
            {note.transcript ? <UserText text={note.transcript} /> : t('visit.voice.nothingHeard')}
          </p>
          {editable ? (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="mt-[6px] h-[40px] rounded-[10px] border border-m6m-border px-[14px] text-[14px]"
            >
              {t('visit.voice.editTranscript')}
            </button>
          ) : null}
        </>
      )}
      {err ? <p className="mt-[6px] text-[14px] text-m6m-danger">{err}</p> : null}
    </li>
  );
}
