'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  deleteSiteVisitMeasurement,
  deleteSiteVisitNote,
  finishSiteVisit,
  saveSiteVisitMeasurement,
  saveSiteVisitNote,
  uploadSiteVisitPhoto,
  type SiteVisitDetail,
  type SiteVisitNote,
  type SiteVisitNoteKind,
} from '@/lib/services/site-visits-client';
import { useOfflineSync } from '@/app/m/offline-sync';
import { ErrorNotice, useOnline } from '@/app/m/write-ui';
import { VoiceNotes } from './voice-notes';
import { resolveSiteVisitMedia } from '@/lib/site-visits/media';
import { addedAfterSend, type Phase } from '@/lib/site-visits/photos';
import type { EstimateFileListResponse } from '@/lib/api-contracts/estimate-files';
import { useT } from '@/components/i18n/language-provider';
import { UserText } from '@/components/i18n/user-text';

// S108 Spec A — THE SITE VISIT RECORD. ONE component, rendered by BOTH the
// phone (/m/site-visits/[id]) and the desktop page (/dashboard/estimates/
// site-visits/[id]). PARITY [S122]: the two surfaces share this mechanism, not
// just the intent — the same reads, the same RPC writes, the same refusals.
// Desktop adds the office actions (promote, abandon) AROUND it, not inside it.
//
// [S108 follow-up] FINISH lives INSIDE the record (both surfaces, same RPC);
// PROMOTE stays OUTSIDE it, on the office's desktop page only. They are two
// different decisions and must never look like one: the field defect was a
// visit that became a numbered draft because promote was the only "done"
// control anywhere. Finish changes nothing on the estimate — see
// finish_site_visit() in 20261680000000.
//
// Writes go to the database only through the site-visit RPCs and the two file
// routes; the database decides who may write (site_visit_access()). `canWrite`
// here only hides controls the database would refuse anyway.
//
// [S110 Section A, RULED Josh] — every internal employee reads and edits every
// visit; the lock is at SEND (site_visits.frozen_at), not at promotion; what
// existed at send is frozen, and ADDING stays open at every status. So:
//   · `canWrite` = "may ADD" — true at every status for any internal employee;
//   · an item is editable unless it was created at or before `frozen_at`;
//   · items added after the send are marked, and photos are grouped
//     "captured before the estimate was sent" / "added after it was sent".
// _Superseded, quoted: "a recorder only their own"; "After promotion new photos
// belong to the estimate (Files), not the visit — so the record stops offering
// to add them"; "this record is FROZEN … Open blockers stay open."_
//
// OFFLINE [voice ruling: "held offline like photos"]: photos and voice notes
// that fail to upload are held in the M6M offline queue (entity
// `site_visit_media`) and replayed with the SAME client id, so a retry lands
// one row. Notes and measurements are online-only — disabled with a message
// when offline, never silently dropped.

// [S110 H] System text is t('visit.…') — lib/i18n/areas/visit.ts. English on
// /dashboard (its provider pins 'en'), the user's language on /m. Text a person
// TYPED (note bodies, area names) is <UserText>: the READER's language, both
// surfaces. The edit textareas always hold the ORIGINAL, never a translation.
//
// The per-kind labels were a module-level table (KIND_LABEL); they are now keys
// `visit.kind.<kind>.{title,add,placeholder}`, resolved with t() at render time.


interface NoteCtx {
  estimateId: string;
  notes: SiteVisitNote[];
  canWrite: boolean;
  busy: boolean;
  online: boolean;
  run: (fn: () => Promise<{ success: boolean; error?: string }>) => Promise<boolean>;
  mayEdit: (n: { created_at: string | null }) => boolean;
  frozenAt: string | null;
}

// Module-level on purpose: a component DEFINED INSIDE the parent is a new type
// on every render, so React would remount it and discard a half-typed note.
function NoteSection({ kind, ctx }: { kind: SiteVisitNoteKind; ctx: NoteCtx }) {
  const { estimateId, canWrite, busy, online, run, mayEdit } = ctx;
  const t = useT();
  const [draft, setDraft] = useState('');
  const items = ctx.notes.filter((n) => n.kind === kind);
  return (
    <section data-testid={`sv-section-${kind}`} className="mt-[18px]">
      <h2 className="mb-[8px] font-mono text-[11px] font-medium uppercase tracking-wide text-m6m-muted">
        {t(`visit.kind.${kind}.title` as const)}
      </h2>
      {items.length === 0 ? (
        <p className="text-[14px] text-m6m-muted">{t('visit.noneYet')}</p>
      ) : (
        <ul className="flex flex-col gap-[8px]">
          {items.map((n) => (
            <NoteRow key={n.id} note={n} editable={mayEdit(n)} ctx={ctx} />
          ))}
        </ul>
      )}
      {canWrite ? (
        <div className="mt-[10px] flex flex-col gap-[8px]">
          <textarea
            data-testid={`sv-new-${kind}`}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={t(`visit.kind.${kind}.placeholder` as const)}
            rows={2}
            className="w-full rounded-[12px] border border-m6m-border bg-m6m-card px-[12px] py-[10px] text-[15px] text-m6m-navy"
          />
          <button
            type="button"
            data-testid={`sv-add-${kind}`}
            disabled={busy || !online || draft.trim() === ''}
            onClick={async () => {
              if (await run(() => saveSiteVisitNote({ estimate_id: estimateId, kind, body: draft }))) setDraft('');
            }}
            className="h-[48px] rounded-[12px] border border-m6m-blue bg-[#f5f7ff] text-[15px] font-semibold text-m6m-blue disabled:opacity-40"
          >
            {t(`visit.kind.${kind}.add` as const)}
          </button>
        </div>
      ) : null}
    </section>
  );
}


function NoteRow({ note, editable, ctx }: { note: SiteVisitNote; editable: boolean; ctx: NoteCtx }) {
  const { estimateId, busy, online, run } = ctx;
  const t = useT();
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(note.body);
  const isBlocker = note.kind === 'blocker';
  return (
    <li
      data-testid="sv-note"
      data-kind={note.kind}
      className="rounded-[12px] border border-m6m-border bg-m6m-card px-[12px] py-[10px]"
    >
      <div className="flex items-start gap-[10px]">
        {isBlocker ? (
          <input
            type="checkbox"
            aria-label={note.resolved ? t('visit.blocker.resolvedReopen') : t('visit.blocker.markResolved')}
            data-testid="sv-blocker-toggle"
            checked={note.resolved}
            disabled={!editable || busy || !online}
            onChange={(e) =>
              run(() =>
                saveSiteVisitNote({
                  estimate_id: estimateId,
                  id: note.id,
                  kind: 'blocker',
                  body: note.body,
                  resolved: e.target.checked,
                })
              )
            }
            className="mt-[4px] h-[22px] w-[22px] shrink-0"
          />
        ) : null}
        {editing ? (
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={2}
            className="min-w-0 flex-1 rounded-[10px] border border-m6m-border px-[10px] py-[8px] text-[15px]"
          />
        ) : (
          <p
            className={`min-w-0 flex-1 whitespace-pre-wrap text-[15px] ${
              isBlocker && note.resolved ? 'text-m6m-muted line-through' : 'text-m6m-navy'
            }`}
          >
            <UserText text={note.body} />
            {addedAfterSend(note.created_at, ctx.frozenAt) ? (
              <span data-testid="sv-added-after" className="mt-[2px] block text-[12px] text-m6m-muted">
                {t('visit.addedAfterSend')}
              </span>
            ) : null}
          </p>
        )}
      </div>
      {editable ? (
        <div className="mt-[8px] flex gap-[8px]">
          {editing ? (
            <>
              <button
                type="button"
                disabled={busy || !online || body.trim() === ''}
                onClick={async () => {
                  if (
                    await run(() =>
                      saveSiteVisitNote({ estimate_id: estimateId, id: note.id, kind: note.kind, body, resolved: note.resolved })
                    )
                  )
                    setEditing(false);
                }}
                className="h-[40px] rounded-[10px] bg-m6m-blue px-[14px] text-[14px] font-semibold text-white disabled:opacity-40"
              >
                {t('visit.save')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setBody(note.body);
                  setEditing(false);
                }}
                className="h-[40px] rounded-[10px] border border-m6m-border px-[14px] text-[14px]"
              >
                {t('visit.cancel')}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="h-[40px] rounded-[10px] border border-m6m-border px-[14px] text-[14px]"
              >
                {t('visit.edit')}
              </button>
              <button
                type="button"
                disabled={busy || !online}
                onClick={() => run(() => deleteSiteVisitNote(note.id))}
                className="h-[40px] rounded-[10px] border border-[#f1c4bf] px-[14px] text-[14px] text-m6m-danger disabled:opacity-40"
              >
                {t('visit.remove')}
              </button>
            </>
          )}
        </div>
      ) : null}
    </li>
  );
}


interface PhotoFile {
  id: string;
  file_name: string;
  mime_type: string;
  created_at: string | null;
  url: string | null;
  /** [S111 D] Stored thumbnail for the tile; null → `url`. */
  thumbUrl: string | null;
  phase: Phase;
}

export function SiteVisitRecord({
  detail,
  canWrite,
  viewerUserId,
  office,
}: {
  detail: SiteVisitDetail;
  /** site_visit_access() said this viewer may ADD — every status [S110 A]. */
  canWrite: boolean;
  viewerUserId: string;
  /** Owner/Admin/PM. Finishing the visit is the office's or the recorder's. */
  office: boolean;
}) {
  const router = useRouter();
  const t = useT();
  const online = useOnline();
  const offlineSync = useOfflineSync();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const estimateId = detail.visit.estimate_id;
  const promoted = detail.visit.promoted_at != null;
  const finishedAt = detail.visit.finished_at;
  // [S110 A] stamped by the database when the estimate is sent (and moved
  // forward at its outcome). Everything created at or before it is frozen.
  const frozenAt = detail.visit.frozen_at ?? null;
  const isFrozen = (createdAt: string | null) => !!frozenAt && !!createdAt && createdAt <= frozenAt;
  const recordedByMe = detail.visit.created_by === viewerUserId;
  const [confirmingFinish, setConfirmingFinish] = useState(false);

  const refresh = useCallback(() => router.refresh(), [router]);

  async function run(fn: () => Promise<{ success: boolean; error?: string }>) {
    setBusy(true);
    setError(null);
    const r = await fn();
    setBusy(false);
    if (!r.success) setError(r.error ?? t('visit.didNotSave'));
    else refresh();
    return r.success;
  }

  // ── photos ────────────────────────────────────────────────────────────
  const [photos, setPhotos] = useState<PhotoFile[]>([]);
  const [audioUrls, setAudioUrls] = useState<Record<string, string | null>>({});
  const loadFiles = useCallback(async () => {
    const res = await fetch(`/api/estimates/${estimateId}/files`);
    if (!res.ok) return;
    const body = (await res.json()) as EstimateFileListResponse;
    // [S110 A, Q4] site-visit CAPTURES only, grouped before/after the send —
    // lib/site-visits/photos.ts (S108 ruling 4's promotion cutoff is quoted
    // there, superseded). Files-tab uploads stay in Files.
    // [S109 regression] The list carries NO url since #161 (161.B) — each photo
    // and voice note is signed through the per-file route, in parallel; a failed
    // one comes back url: null and renders the fallback tile. See media.ts.
    const media = await resolveSiteVisitMedia(estimateId, body.files, frozenAt, (u) => fetch(u));
    setPhotos(media.photos);
    setAudioUrls(media.audioUrls);
  }, [estimateId, frozenAt]);
  useEffect(() => {
    void loadFiles();
  }, [loadFiles]);

  const heldForThisVisit = (offlineSync?.entries ?? []).filter(
    (e) => e.entity === 'site_visit_media' && (e.payload as { estimate_id?: string }).estimate_id === estimateId
  ).length;

  const fileInput = useRef<HTMLInputElement>(null);
  async function onPhotos(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);
    let held = 0;
    for (const file of Array.from(files)) {
      const id = crypto.randomUUID();
      const r = online ? await uploadSiteVisitPhoto(estimateId, file, file.name, id) : { success: false };
      if (r.success) continue;
      // A weak signal reads as online and fails — the same fallback as M6M
      // capture: ANY failure is held, never dropped.
      if (!offlineSync) {
        setError(t('visit.photo.cannotHold'));
        continue;
      }
      await offlineSync.enqueue({
        entry_id: crypto.randomUUID(),
        target_id: id,
        op: 'insert',
        entity: 'site_visit_media',
        payload: { kind: 'photo', estimate_id: estimateId, id, blob: file, file_name: file.name },
        captured_at: new Date().toISOString(),
      });
      held += 1;
    }
    if (fileInput.current) fileInput.current.value = '';
    if (held > 0) setError(t(held === 1 ? 'visit.photo.heldOne' : 'visit.photo.heldMany', { n: held }));
    await loadFiles();
  }

  // ── notes ─────────────────────────────────────────────────────────────
  const notesOf = (kind: SiteVisitNoteKind) => detail.notes.filter((n) => n.kind === kind);
  // [S110 ruling 1] anyone who may add may edit — anything not frozen at send.
  const mayEdit = (n: { created_at: string | null }) => canWrite && !isFrozen(n.created_at);

  // ── measurements ──────────────────────────────────────────────────────
  const [area, setArea] = useState('');
  const [len, setLen] = useState('');
  const [wid, setWid] = useState('');
  const lenN = Number(len);
  const widN = Number(wid);
  const previewSqft = lenN > 0 && widN > 0 ? Math.round(lenN * widN * 100) / 100 : null;
  const totalSqft = detail.measurements.reduce((s, m) => s + Number(m.square_feet ?? 0), 0);

  const noteCtx: NoteCtx = { estimateId, notes: detail.notes, canWrite, busy, online, run, mayEdit, frozenAt };
  const photosBefore = photos.filter((p) => p.phase === 'before');
  const photosAfter = photos.filter((p) => p.phase === 'after');
  const blockersOpen = notesOf('blocker').filter((n) => !n.resolved).length;

  return (
    <div data-testid="site-visit-record">
      {promoted ? (
        <p
          data-testid="sv-promoted-banner"
          className="mb-[12px] rounded-[10px] border border-m6m-border bg-[#f5f7ff] px-[12px] py-[10px] text-[14px] text-m6m-navy"
        >
          {t('visit.promoted.title')}{' '}
          {frozenAt
            ? null
            : canWrite
              ? t('visit.promoted.canWrite')
              : t('visit.promoted.readOnly')}
        </p>
      ) : null}
      {frozenAt ? (
        <p
          data-testid="sv-frozen-banner"
          className="mb-[12px] rounded-[10px] border border-[#f5cf8f] bg-[#fffbeb] px-[12px] py-[10px] text-[14px] text-m6m-navy"
        >
          <strong>{t('visit.frozen.title')}</strong> {t('visit.frozen.body')}
          {canWrite ? ` ${t('visit.frozen.canAdd')}` : ''}
        </p>
      ) : null}
      {!promoted && finishedAt ? (
        <p
          data-testid="sv-finished-banner"
          className="mb-[12px] rounded-[10px] border border-[#b7e4c7] bg-[#ecfdf5] px-[12px] py-[10px] text-[14px] text-m6m-navy"
        >
          <strong>{t('visit.finished.title')}</strong> {new Date(finishedAt).toLocaleString()} {t('visit.finished.body')}
          {canWrite ? ` ${t('visit.finished.canFix')}` : ''}
        </p>
      ) : null}
      {!online && canWrite ? (
        <p role="status" className="mb-[12px] rounded-[10px] border border-m6m-border bg-m6m-card px-[12px] py-[10px] text-[14px]">
          {t('visit.offline')}
        </p>
      ) : null}
      {error ? <ErrorNotice message={error} testId="sv-error" /> : null}

      <p data-testid="sv-blockers-open" className="text-[14px] text-m6m-navy">
        {blockersOpen === 0
          ? t('visit.blockers.none')
          : t(blockersOpen === 1 ? 'visit.blockers.openOne' : 'visit.blockers.openMany', { n: blockersOpen })}
      </p>

      {/* PHOTOS */}
      <section data-testid="sv-section-photos" className="mt-[18px]">
        <h2 className="mb-[8px] font-mono text-[11px] font-medium uppercase tracking-wide text-m6m-muted">
          {t('visit.photos.title')} {photos.length > 0 ? `· ${photos.length}` : ''}
          {heldForThisVisit > 0 ? ` · ${t('visit.waitingForSignal', { n: heldForThisVisit })}` : ''}
        </h2>
        {photos.length === 0 ? <p className="text-[14px] text-m6m-muted">{t('visit.photos.none')}</p> : null}
        {(['before', 'after'] as const).map((phase) => {
          const group = phase === 'before' ? photosBefore : photosAfter;
          if (group.length === 0) return null;
          return (
            <div key={phase} data-testid={`sv-photos-${phase}`} className="mt-[6px]">
              {frozenAt ? (
                <p className="mb-[4px] text-[12px] text-m6m-muted">
                  {phase === 'before' ? t('visit.photos.before') : t('visit.photos.after')} · {group.length}
                </p>
              ) : null}
              <div className="grid grid-cols-3 gap-[6px]">
                {group.map((p) =>
                  p.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    // [S111 D] The stored thumbnail, or the full file when there is none.
                    <img key={p.id} data-testid="sv-photo" src={p.thumbUrl ?? p.url} alt={p.file_name} className="aspect-square w-full rounded-[8px] object-cover" />
                  ) : (
                    <div key={p.id} data-testid="sv-photo-missing" className="aspect-square rounded-[8px] bg-m6m-border" />
                  )
                )}
              </div>
            </div>
          );
        })}
        {promoted && office ? (
          <p className="mt-[6px] text-[13px] text-m6m-muted">{t('visit.photos.filesTabStays')}</p>
        ) : null}
        {/* [S110 ruling 3] ADDING stays open at every status. */}
        {canWrite ? (
          <label className="mt-[10px] flex h-[52px] cursor-pointer items-center justify-center rounded-[14px] bg-m6m-blue text-[16px] font-bold text-white">
            {t('visit.photos.add')}
            <input
              ref={fileInput}
              data-testid="sv-photo-input"
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => void onPhotos(e.target.files)}
            />
          </label>
        ) : null}
      </section>

      <NoteSection kind="condition" ctx={noteCtx} />
      <NoteSection kind="scope" ctx={noteCtx} />

      {/* MEASUREMENTS — structured (ASK-A5): area, L × W, sq ft computed. */}
      <section data-testid="sv-section-measurements" className="mt-[18px]">
        <h2 className="mb-[8px] font-mono text-[11px] font-medium uppercase tracking-wide text-m6m-muted">
          {t('visit.measurements.title')}{' '}
          {detail.measurements.length > 0 ? t('visit.measurements.total', { n: totalSqft.toLocaleString() }) : ''}
        </h2>
        {detail.measurements.length === 0 ? (
          <p className="text-[14px] text-m6m-muted">{t('visit.noneYet')}</p>
        ) : (
          <ul className="flex flex-col gap-[6px]">
            {detail.measurements.map((m) => (
              <li
                key={m.id}
                data-testid="sv-measurement"
                className="flex items-center justify-between gap-[8px] rounded-[12px] border border-m6m-border bg-m6m-card px-[12px] py-[10px]"
              >
                <span className="min-w-0">
                  <span className="block text-[15px] font-semibold text-m6m-navy">
                    <UserText text={m.area_name} />
                  </span>
                  <span className="block font-mono text-[12px] text-m6m-muted">
                    {t('visit.measurements.row', {
                      l: Number(m.length_ft),
                      w: Number(m.width_ft),
                      sqft: Number(m.square_feet),
                    })}
                  </span>
                  {addedAfterSend(m.created_at, frozenAt) ? (
                    <span data-testid="sv-added-after" className="block text-[12px] text-m6m-muted">
                      {t('visit.addedAfterSend')}
                    </span>
                  ) : null}
                </span>
                {mayEdit(m) ? (
                  <button
                    type="button"
                    disabled={busy || !online}
                    onClick={() => run(() => deleteSiteVisitMeasurement(m.id))}
                    className="h-[40px] shrink-0 rounded-[10px] border border-[#f1c4bf] px-[12px] text-[14px] text-m6m-danger disabled:opacity-40"
                  >
                    {t('visit.remove')}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {canWrite ? (
          <div className="mt-[10px] grid grid-cols-[1fr_5rem_5rem] gap-[6px]">
            <input
              data-testid="sv-m-area"
              value={area}
              onChange={(e) => setArea(e.target.value)}
              placeholder={t('visit.measurements.area')}
              className="h-[48px] rounded-[12px] border border-m6m-border px-[10px] text-[15px]"
            />
            <input
              data-testid="sv-m-length"
              value={len}
              onChange={(e) => setLen(e.target.value.replace(/[^0-9.]/g, ''))}
              inputMode="decimal"
              placeholder={t('visit.measurements.length')}
              className="h-[48px] rounded-[12px] border border-m6m-border px-[10px] font-mono text-[15px]"
            />
            <input
              data-testid="sv-m-width"
              value={wid}
              onChange={(e) => setWid(e.target.value.replace(/[^0-9.]/g, ''))}
              inputMode="decimal"
              placeholder={t('visit.measurements.width')}
              className="h-[48px] rounded-[12px] border border-m6m-border px-[10px] font-mono text-[15px]"
            />
            <button
              type="button"
              data-testid="sv-m-add"
              disabled={busy || !online || area.trim() === '' || previewSqft === null}
              onClick={async () => {
                if (
                  await run(() =>
                    saveSiteVisitMeasurement({ estimate_id: estimateId, area_name: area, length_ft: lenN, width_ft: widN })
                  )
                ) {
                  setArea('');
                  setLen('');
                  setWid('');
                }
              }}
              className="col-span-3 h-[48px] rounded-[12px] border border-m6m-blue bg-[#f5f7ff] text-[15px] font-semibold text-m6m-blue disabled:opacity-40"
            >
              {previewSqft === null
                ? t('visit.measurements.add')
                : t('visit.measurements.addWithPreview', { n: previewSqft })}
            </button>
          </div>
        ) : null}
      </section>

      <NoteSection kind="blocker" ctx={noteCtx} />

      <VoiceNotes
        estimateId={estimateId}
        voiceNotes={detail.voiceNotes}
        audioUrls={audioUrls}
        canWrite={canWrite}
        frozenAt={frozenAt}
        onChanged={async () => {
          await loadFiles();
          refresh();
        }}
      />

      {/* FINISH — the recorder's "done". Not promotion: no number, no estimate. */}
      {canWrite && (office || recordedByMe) && !promoted && !detail.visit.is_deleted && !finishedAt ? (
        <section data-testid="sv-finish" className="mt-[24px] border-t border-m6m-border pt-[18px]">
          {confirmingFinish ? (
            <div className="flex flex-col gap-[8px]">
              <p className="text-[14px] text-m6m-navy">
                {t('visit.finish.confirmBefore')} <strong>{t('visit.finish.confirmStrong')}</strong>{' '}
                {t('visit.finish.confirmAfter')}
                {blockersOpen > 0
                  ? ` ${t(blockersOpen === 1 ? 'visit.finish.blockersOne' : 'visit.finish.blockersMany', { n: blockersOpen })}`
                  : ''}
                {heldForThisVisit > 0
                  ? ` ${t(heldForThisVisit === 1 ? 'visit.finish.heldOne' : 'visit.finish.heldMany', { n: heldForThisVisit })}`
                  : ''}
              </p>
              <button
                type="button"
                data-testid="sv-finish-confirm"
                disabled={busy || !online}
                onClick={async () => {
                  if (await run(() => finishSiteVisit(estimateId))) setConfirmingFinish(false);
                }}
                className="h-[52px] rounded-[14px] bg-m6m-navy text-[16px] font-bold text-white disabled:opacity-40"
              >
                {t('visit.finish.yes')}
              </button>
              <button
                type="button"
                onClick={() => setConfirmingFinish(false)}
                className="h-[48px] rounded-[12px] border border-m6m-border text-[15px]"
              >
                {t('visit.finish.keepRecording')}
              </button>
            </div>
          ) : (
            <button
              type="button"
              data-testid="sv-finish-start"
              disabled={busy || !online}
              onClick={() => setConfirmingFinish(true)}
              className="h-[52px] w-full rounded-[14px] bg-m6m-navy text-[16px] font-bold text-white disabled:opacity-40"
            >
              {t('visit.finish.start')}
            </button>
          )}
          {!online ? <p className="mt-[6px] text-[13px] text-m6m-muted">{t('visit.finish.needsConnection')}</p> : null}
        </section>
      ) : null}

    </div>
  );
}
