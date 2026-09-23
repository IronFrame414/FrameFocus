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
import { resolveSiteVisitMedia, type ListedFile } from '@/lib/site-visits/media';

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
// OFFLINE [voice ruling: "held offline like photos"]: photos and voice notes
// that fail to upload are held in the M6M offline queue (entity
// `site_visit_media`) and replayed with the SAME client id, so a retry lands
// one row. Notes and measurements are online-only — disabled with a message
// when offline, never silently dropped.

const KIND_LABEL: Record<SiteVisitNoteKind, { title: string; add: string; placeholder: string }> = {
  condition: {
    title: 'Existing conditions',
    add: 'Add condition',
    placeholder: 'What is there now — e.g. "Tile is cracked, subfloor may be soft"',
  },
  scope: {
    title: 'Proposed scope',
    add: 'Add scope item',
    placeholder: 'What the work is — e.g. "Demo tile, level, install LVP"',
  },
  blocker: {
    title: 'Blockers — what stops a price',
    add: 'Add blocker',
    placeholder: 'e.g. "Need access to the crawlspace", "Permit question"',
  },
};


interface NoteCtx {
  estimateId: string;
  notes: SiteVisitNote[];
  canWrite: boolean;
  busy: boolean;
  online: boolean;
  run: (fn: () => Promise<{ success: boolean; error?: string }>) => Promise<boolean>;
  mayEdit: (n: { created_by: string | null }) => boolean;
}

// Module-level on purpose: a component DEFINED INSIDE the parent is a new type
// on every render, so React would remount it and discard a half-typed note.
function NoteSection({ kind, ctx }: { kind: SiteVisitNoteKind; ctx: NoteCtx }) {
  const { estimateId, canWrite, busy, online, run, mayEdit } = ctx;
  const [draft, setDraft] = useState('');
  const items = ctx.notes.filter((n) => n.kind === kind);
  return (
    <section data-testid={`sv-section-${kind}`} className="mt-[18px]">
      <h2 className="mb-[8px] font-mono text-[11px] font-medium uppercase tracking-wide text-m6m-muted">
        {KIND_LABEL[kind].title}
      </h2>
      {items.length === 0 ? (
        <p className="text-[14px] text-m6m-muted">None yet.</p>
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
            placeholder={KIND_LABEL[kind].placeholder}
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
            {KIND_LABEL[kind].add}
          </button>
        </div>
      ) : null}
    </section>
  );
}


function NoteRow({ note, editable, ctx }: { note: SiteVisitNote; editable: boolean; ctx: NoteCtx }) {
  const { estimateId, busy, online, run } = ctx;
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
            aria-label={note.resolved ? 'Resolved — tap to reopen' : 'Mark resolved'}
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
            {note.body}
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
                Save
              </button>
              <button
                type="button"
                onClick={() => {
                  setBody(note.body);
                  setEditing(false);
                }}
                className="h-[40px] rounded-[10px] border border-m6m-border px-[14px] text-[14px]"
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="h-[40px] rounded-[10px] border border-m6m-border px-[14px] text-[14px]"
              >
                Edit
              </button>
              <button
                type="button"
                disabled={busy || !online}
                onClick={() => run(() => deleteSiteVisitNote(note.id))}
                className="h-[40px] rounded-[10px] border border-[#f1c4bf] px-[14px] text-[14px] text-m6m-danger disabled:opacity-40"
              >
                Remove
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
}

export function SiteVisitRecord({
  detail,
  canWrite,
  viewerUserId,
  office,
}: {
  detail: SiteVisitDetail;
  /** site_visit_access() said this viewer may still write. */
  canWrite: boolean;
  viewerUserId: string;
  /** Owner/Admin/PM — may edit anyone's notes; a recorder only their own. */
  office: boolean;
}) {
  const router = useRouter();
  const online = useOnline();
  const offlineSync = useOfflineSync();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const estimateId = detail.visit.estimate_id;
  const promoted = detail.visit.promoted_at != null;
  const finishedAt = detail.visit.finished_at;
  const [confirmingFinish, setConfirmingFinish] = useState(false);

  const refresh = useCallback(() => router.refresh(), [router]);

  async function run(fn: () => Promise<{ success: boolean; error?: string }>) {
    setBusy(true);
    setError(null);
    const r = await fn();
    setBusy(false);
    if (!r.success) setError(r.error ?? 'That did not save.');
    else refresh();
    return r.success;
  }

  // ── photos ────────────────────────────────────────────────────────────
  const [photos, setPhotos] = useState<PhotoFile[]>([]);
  const [audioUrls, setAudioUrls] = useState<Record<string, string | null>>({});
  const loadFiles = useCallback(async () => {
    const res = await fetch(`/api/estimates/${estimateId}/files`);
    if (!res.ok) return;
    const body = (await res.json()) as { files: ListedFile[] };
    // [ruling 4, 2026-09-23] VISIT-ERA photos only — cutoff = promotion, see
    // lib/site-visits/photos.ts. Later photos live in the estimate's Files tab.
    // [S109 regression] The list carries NO url since #161 (161.B) — each photo
    // and voice note is signed through the per-file route, in parallel; a failed
    // one comes back url: null and renders the fallback tile. See media.ts.
    const media = await resolveSiteVisitMedia(estimateId, body.files, detail.visit.promoted_at, (u) => fetch(u));
    setPhotos(media.photos);
    setAudioUrls(media.audioUrls);
  }, [estimateId, detail.visit.promoted_at]);
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
        setError('A photo did not upload and cannot be held on this device. Try again.');
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
    if (held > 0) setError(`${held} photo${held === 1 ? '' : 's'} saved on this phone — they upload when signal returns.`);
    await loadFiles();
  }

  // ── notes ─────────────────────────────────────────────────────────────
  const notesOf = (kind: SiteVisitNoteKind) => detail.notes.filter((n) => n.kind === kind);
  const mayEdit = (n: { created_by: string | null }) => canWrite && (office || n.created_by === viewerUserId);

  // ── measurements ──────────────────────────────────────────────────────
  const [area, setArea] = useState('');
  const [len, setLen] = useState('');
  const [wid, setWid] = useState('');
  const lenN = Number(len);
  const widN = Number(wid);
  const previewSqft = lenN > 0 && widN > 0 ? Math.round(lenN * widN * 100) / 100 : null;
  const totalSqft = detail.measurements.reduce((s, m) => s + Number(m.square_feet ?? 0), 0);

  const noteCtx: NoteCtx = { estimateId, notes: detail.notes, canWrite, busy, online, run, mayEdit };
  const blockersOpen = notesOf('blocker').filter((n) => !n.resolved).length;

  return (
    <div data-testid="site-visit-record">
      {promoted ? (
        <p
          data-testid="sv-promoted-banner"
          className="mb-[12px] rounded-[10px] border border-m6m-border bg-[#f5f7ff] px-[12px] py-[10px] text-[14px] text-m6m-navy"
        >
          This visit is now an estimate.{' '}
          {canWrite
            ? 'The office can still update it here until the estimate is sent.'
            : office
              ? 'The estimate has been sent, so this record is FROZEN — it is the evidence of what was found on site at the price quoted. Open blockers stay open.'
              : 'You can still read everything you captured.'}
        </p>
      ) : null}
      {!promoted && finishedAt ? (
        <p
          data-testid="sv-finished-banner"
          className="mb-[12px] rounded-[10px] border border-[#b7e4c7] bg-[#ecfdf5] px-[12px] py-[10px] text-[14px] text-m6m-navy"
        >
          <strong>Finished</strong> {new Date(finishedAt).toLocaleString()} — ready for the office to price.
          It becomes an estimate, and gets its number, only when the office creates one.
          {canWrite ? ' Mistakes can still be fixed here until then.' : ''}
        </p>
      ) : null}
      {!online && canWrite ? (
        <p role="status" className="mb-[12px] rounded-[10px] border border-m6m-border bg-m6m-card px-[12px] py-[10px] text-[14px]">
          No signal — photos and voice notes are saved on this phone and upload later. Notes and
          measurements need a connection.
        </p>
      ) : null}
      {error ? <ErrorNotice message={error} testId="sv-error" /> : null}

      <p data-testid="sv-blockers-open" className="text-[14px] text-m6m-navy">
        {blockersOpen === 0 ? 'Nothing blocking a price.' : `${blockersOpen} blocker${blockersOpen === 1 ? '' : 's'} still open.`}
      </p>

      {/* PHOTOS */}
      <section data-testid="sv-section-photos" className="mt-[18px]">
        <h2 className="mb-[8px] font-mono text-[11px] font-medium uppercase tracking-wide text-m6m-muted">
          {promoted ? 'Photos taken during the visit' : 'Photos'} {photos.length > 0 ? `· ${photos.length}` : ''}
          {heldForThisVisit > 0 ? ` · ${heldForThisVisit} waiting for signal` : ''}
        </h2>
        {photos.length > 0 ? (
          <div className="grid grid-cols-3 gap-[6px]">
            {photos.map((p) =>
              p.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={p.id} data-testid="sv-photo" src={p.url} alt={p.file_name} className="aspect-square w-full rounded-[8px] object-cover" />
              ) : (
                <div key={p.id} data-testid="sv-photo-missing" className="aspect-square rounded-[8px] bg-m6m-border" />
              )
            )}
          </div>
        ) : (
          <p className="text-[14px] text-m6m-muted">No photos yet.</p>
        )}
        {promoted && office ? (
          <p className="mt-[6px] text-[13px] text-m6m-muted">Photos added after it became an estimate are in Files.</p>
        ) : null}
        {/* After promotion new photos belong to the estimate (Files), not the
            visit — so the record stops offering to add them. */}
        {canWrite && !promoted ? (
          <label className="mt-[10px] flex h-[52px] cursor-pointer items-center justify-center rounded-[14px] bg-m6m-blue text-[16px] font-bold text-white">
            Add photos
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
          Measurements {detail.measurements.length > 0 ? `· ${totalSqft.toLocaleString()} sq ft total` : ''}
        </h2>
        {detail.measurements.length === 0 ? (
          <p className="text-[14px] text-m6m-muted">None yet.</p>
        ) : (
          <ul className="flex flex-col gap-[6px]">
            {detail.measurements.map((m) => (
              <li
                key={m.id}
                data-testid="sv-measurement"
                className="flex items-center justify-between gap-[8px] rounded-[12px] border border-m6m-border bg-m6m-card px-[12px] py-[10px]"
              >
                <span className="min-w-0">
                  <span className="block text-[15px] font-semibold text-m6m-navy">{m.area_name}</span>
                  <span className="block font-mono text-[12px] text-m6m-muted">
                    {Number(m.length_ft)} × {Number(m.width_ft)} ft = {Number(m.square_feet)} sq ft
                  </span>
                </span>
                {mayEdit(m) ? (
                  <button
                    type="button"
                    disabled={busy || !online}
                    onClick={() => run(() => deleteSiteVisitMeasurement(m.id))}
                    className="h-[40px] shrink-0 rounded-[10px] border border-[#f1c4bf] px-[12px] text-[14px] text-m6m-danger disabled:opacity-40"
                  >
                    Remove
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
              placeholder="Area (e.g. Kitchen)"
              className="h-[48px] rounded-[12px] border border-m6m-border px-[10px] text-[15px]"
            />
            <input
              data-testid="sv-m-length"
              value={len}
              onChange={(e) => setLen(e.target.value.replace(/[^0-9.]/g, ''))}
              inputMode="decimal"
              placeholder="L ft"
              className="h-[48px] rounded-[12px] border border-m6m-border px-[10px] font-mono text-[15px]"
            />
            <input
              data-testid="sv-m-width"
              value={wid}
              onChange={(e) => setWid(e.target.value.replace(/[^0-9.]/g, ''))}
              inputMode="decimal"
              placeholder="W ft"
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
              {previewSqft === null ? 'Add measurement' : `Add measurement · ${previewSqft} sq ft`}
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
        office={office}
        viewerUserId={viewerUserId}
        onChanged={async () => {
          await loadFiles();
          refresh();
        }}
      />

      {/* FINISH — the recorder's "done". Not promotion: no number, no estimate. */}
      {canWrite && !promoted && !detail.visit.is_deleted && !finishedAt ? (
        <section data-testid="sv-finish" className="mt-[24px] border-t border-m6m-border pt-[18px]">
          {confirmingFinish ? (
            <div className="flex flex-col gap-[8px]">
              <p className="text-[14px] text-m6m-navy">
                Finish this visit? The office sees it is ready to price. It does <strong>not</strong> become an
                estimate yet — the office does that. You can still fix mistakes until then.
                {blockersOpen > 0 ? ` ${blockersOpen} blocker${blockersOpen === 1 ? ' is' : 's are'} still open.` : ''}
                {heldForThisVisit > 0
                  ? ` ${heldForThisVisit} photo or voice note${heldForThisVisit === 1 ? ' is' : 's are'} still on this phone and will upload when signal returns.`
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
                Yes, finish the visit
              </button>
              <button
                type="button"
                onClick={() => setConfirmingFinish(false)}
                className="h-[48px] rounded-[12px] border border-m6m-border text-[15px]"
              >
                Keep recording
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
              Finish site visit
            </button>
          )}
          {!online ? <p className="mt-[6px] text-[13px] text-m6m-muted">Finishing needs a connection.</p> : null}
        </section>
      ) : null}

    </div>
  );
}
