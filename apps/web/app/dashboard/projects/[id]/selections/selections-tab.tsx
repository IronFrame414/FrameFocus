"use client";
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createSelection, createSelectionArea, fetchSelectionOptionImages } from '@/lib/services/selections-client';
import { getFileSignedUrlClient } from '@/lib/services/files-client';

// §9.2 — the no-cost tab. The props type is the contract: there is no amount,
// no markup, no variance anywhere in it, so a future edit cannot "just show the
// price" without changing this type.
export interface TabOption {
  id: string;
  name: string;
  spec_detail: string | null;
  is_chosen: boolean;
  image_file_id: string | null;
  link_url: string | null;
}
export interface TabSelection {
  id: string;
  name: string;
  description: string | null;
  due_date: string | null;
  status: string;
  mode: string;
  client_supplied: boolean;
  allowance_description: string | null;
  options: TabOption[];
}
export interface TabArea {
  id: string;
  name: string;
  selections: TabSelection[];
}

const MANAGER = ['owner', 'admin', 'project_manager'];

export const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  in_discussion: 'In discussion',
  awaiting_approval: 'Awaiting approval',
  approved: 'Approved',
  denied: 'Denied', // [S172] a resting state — the company reopens it
};
const STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  draft: { bg: '#f3f4f6', fg: '#374151' },
  in_discussion: { bg: '#fef3c7', fg: '#92400e' },
  awaiting_approval: { bg: '#dbeafe', fg: '#1e40af' },
  approved: { bg: '#dcfce7', fg: '#166534' },
  denied: { bg: '#fee2e2', fg: '#991b1b' },
};

const card: React.CSSProperties = { backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '0.5rem', padding: '1rem', marginBottom: '1rem' };
const input: React.CSSProperties = { padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '0.375rem', fontSize: '0.875rem' };
const button: React.CSSProperties = { padding: '0.5rem 0.875rem', borderRadius: '0.375rem', border: '1px solid #1f2937', backgroundColor: '#1f2937', color: '#fff', fontSize: '0.8125rem', fontWeight: 600, cursor: 'pointer' };

export function StatusPill({ status }: { status: string }) {
  const c = STATUS_COLORS[status] ?? STATUS_COLORS.draft;
  return (
    <span data-testid="selection-status" style={{ fontSize: '0.6875rem', fontWeight: 700, padding: '0.125rem 0.5rem', borderRadius: '9999px', backgroundColor: c.bg, color: c.fg }}>
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

/** A thumbnail from an already-signed URL (the definer read, S172). */
export function UrlThumb({ url, size = 56 }: { url: string | null; size?: number }) {
  if (!url) return <div aria-hidden style={{ width: size, height: size, borderRadius: '0.375rem', backgroundColor: '#f3f4f6', border: '1px dashed #d1d5db' }} />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="" style={{ width: size, height: size, objectFit: 'cover', borderRadius: '0.375rem', border: '1px solid #e5e7eb' }} />;
}

/** A thumbnail for a file the CALLER can read directly (thread photos). Option
 *  images use UrlThumb via the definer read instead. */
export function OptionThumb({ fileId, size = 56 }: { fileId: string | null; size?: number }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    if (fileId) getFileSignedUrlClient(fileId).then((u) => live && setUrl(u));
    return () => {
      live = false;
    };
  }, [fileId]);
  if (!fileId) return <div aria-hidden style={{ width: size, height: size, borderRadius: '0.375rem', backgroundColor: '#f3f4f6', border: '1px dashed #d1d5db' }} />;
  // eslint-disable-next-line @next/next/no-img-element
  return url ? <img src={url} alt="" style={{ width: size, height: size, objectFit: 'cover', borderRadius: '0.375rem', border: '1px solid #e5e7eb' }} /> : <div style={{ width: size, height: size, borderRadius: '0.375rem', backgroundColor: '#f3f4f6' }} />;
}

export function SelectionsTab({ projectId, role, areas }: { projectId: string; role: string; areas: TabArea[] }) {
  const router = useRouter();
  const canManage = MANAGER.includes(role);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [areaId, setAreaId] = useState<string>('');
  const [newArea, setNewArea] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // [S173 Job 3] Release Selections — the batch is a DELIVERY mechanism, not a
  // signing unit: N selections go out together, the client signs each one
  // separately, and a partial batch is fine (an unsigned selection stays put
  // and blocks nothing). One signature per selection because each signature
  // binds one selection against one allowance — so no instrument ever spans
  // several allowance lines (this is why one-signature-over-the-batch, the
  // obvious design, is wrong here).
  const [selected, setSelected] = useState<string[]>([]);
  const [releaseErrors, setReleaseErrors] = useState<string[]>([]);
  // [S174 #1] The release now MAILS the client, and a send that did not happen
  // must reach the screen. The defect being fixed was a release that told the
  // client nothing; a release that silently fails to mail her is the same
  // defect wearing a different coat (invite-email.ts, D2).
  const [emailWarning, setEmailWarning] = useState<string | null>(null);
  // [S175 stage 6] Generate & send the specifications sheet (§7.3, §9.4).
  // ONE action, both halves — Josh: "Same sheet. Emailed to client and added
  // to project files." There is deliberately no generate-without-sending and
  // no send-the-last-one: the artifact is REPLACED on every generation (Q4.1),
  // so a filed copy and a sent copy that were produced separately would be two
  // documents claiming to be the same one.
  const [specBusy, setSpecBusy] = useState(false);
  const [specResult, setSpecResult] = useState<string | null>(null);
  const [specError, setSpecError] = useState<string | null>(null);
  const base = `/dashboard/projects/${projectId}/selections`;

  const nameById = new Map(areas.flatMap((a) => a.selections.map((s) => [s.id, s.name] as const)));

  function toggleSelected(id: string, on: boolean) {
    setSelected((prev) => (on ? [...prev, id] : prev.filter((x) => x !== id)));
  }

  async function release() {
    if (!selected.length) return;
    setBusy(true);
    setReleaseErrors([]);
    setEmailWarning(null);
    try {
      const res = await fetch('/api/selections/release', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selected }),
      });
      const body = (await res.json().catch(() => ({}))) as { results?: { id: string; success: boolean; error?: string }[]; error?: string; emailed?: boolean; emailError?: string | null };
      if (!res.ok || !body.results) {
        setReleaseErrors([body.error ?? 'The release did not go through.']);
        return;
      }
      if (body.emailError) setEmailWarning(body.emailError);
      const failed = body.results.filter((r) => !r.success);
      setReleaseErrors(failed.map((f) => `${nameById.get(f.id) ?? f.id}: ${f.error ?? 'refused'}`));
      setSelected(failed.map((f) => f.id)); // keep only the refused ones ticked
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function sendSpecSheet() {
    setSpecBusy(true);
    setSpecResult(null);
    setSpecError(null);
    try {
      const res = await fetch('/api/selections/spec-sheet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        emailed?: boolean;
        emailError?: string | null;
        recipient?: string | null;
        selectionCount?: number;
      };
      if (!res.ok) {
        setSpecError(body.error ?? 'The specifications sheet could not be sent.');
        return;
      }
      // A send that did not happen must reach the screen. The sheet IS filed
      // and IS in her portal either way, so this is a warning and not a
      // failure — but reporting it as success would be the S174 defect
      // (a UI that implies delivery) wearing a different coat.
      if (body.emailed) {
        setSpecResult(
          `Specifications sheet sent to ${body.recipient ?? 'the client'} and filed under project files.`
        );
      } else {
        setSpecError(
          `Filed under project files, but not emailed. ${body.emailError ?? ''}`.trim()
        );
      }
      router.refresh();
    } finally {
      setSpecBusy(false);
    }
  }

  async function create() {
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    let area = areaId || null;
    if (!area && newArea.trim()) {
      const a = await createSelectionArea({ project_id: projectId, name: newArea });
      if (!a.success) {
        setError(a.error ?? 'Could not create the area');
        setBusy(false);
        return;
      }
      area = a.id ?? null;
    }
    const r = await createSelection({ project_id: projectId, name, area_id: area });
    setBusy(false);
    if (!r.success || !r.id) {
      setError(r.error ?? 'Could not create the selection');
      return;
    }
    router.push(`${base}/${r.id}`);
  }

  const total = areas.reduce((n, a) => n + a.selections.length, 0);

  return (
    <div data-testid="selections-tab">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.125rem', fontWeight: 700, margin: 0 }}>Selections</h2>
          <p style={{ fontSize: '0.8125rem', color: '#6b7280', margin: '0.125rem 0 0' }}>
            Finishes, fixtures and materials the client chooses, by area. {total} selection{total === 1 ? '' : 's'}.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          {canManage && selected.length > 0 && (
            <button type="button" data-testid="selections-release" style={button} disabled={busy} onClick={release}>
              Release {selected.length} selection{selected.length === 1 ? '' : 's'} to the client
            </button>
          )}
          {canManage && (
            <button
              type="button"
              data-testid="selections-spec-sheet"
              style={{ ...button, backgroundColor: '#fff', color: '#1f2937' }}
              disabled={specBusy}
              onClick={sendSpecSheet}
            >
              {specBusy ? 'Sending…' : 'Generate & send specifications'}
            </button>
          )}
          {canManage && !creating && (
            <button type="button" data-testid="selection-new" style={button} onClick={() => setCreating(true)}>
              + New selection
            </button>
          )}
        </div>
      </div>

      {releaseErrors.length > 0 && (
        <div style={{ ...card, borderColor: '#fecaca', color: '#991b1b', fontSize: '0.8125rem' }} data-testid="selections-release-errors">
          {releaseErrors.map((e) => (
            <div key={e}>{e}</div>
          ))}
        </div>
      )}

      {specResult && (
        <div style={{ ...card, borderColor: '#bbf7d0', backgroundColor: '#f0fdf4', color: '#166534', fontSize: '0.8125rem' }} data-testid="selections-spec-sheet-result">
          {specResult}
        </div>
      )}

      {specError && (
        <div style={{ ...card, borderColor: '#fed7aa', backgroundColor: '#fffbeb', color: '#92400e', fontSize: '0.8125rem' }} data-testid="selections-spec-sheet-error">
          {specError}
        </div>
      )}

      {emailWarning && (
        <div style={{ ...card, borderColor: '#fed7aa', backgroundColor: '#fffbeb', color: '#92400e', fontSize: '0.8125rem' }} data-testid="selections-email-warning">
          <strong>Released, but not emailed.</strong> {emailWarning}
        </div>
      )}

      {creating && (
        <div style={card} data-testid="selection-new-form">
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <input style={{ ...input, minWidth: 220 }} placeholder="Selection name (e.g. Kitchen countertop)" value={name} onChange={(e) => setName(e.target.value)} data-testid="selection-new-name" />
            <select style={input} value={areaId} onChange={(e) => setAreaId(e.target.value)} data-testid="selection-new-area">
              <option value="">— area —</option>
              {areas.filter((a) => a.id !== '__unassigned__').map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
            {!areaId && <input style={input} placeholder="or new area (Kitchen, Bath 2…)" value={newArea} onChange={(e) => setNewArea(e.target.value)} data-testid="selection-new-area-name" />}
            <button type="button" style={button} disabled={busy || !name.trim()} onClick={create} data-testid="selection-new-save">Create</button>
            <button type="button" style={{ ...button, backgroundColor: '#fff', color: '#1f2937' }} onClick={() => setCreating(false)}>Cancel</button>
          </div>
          {error && <p style={{ color: '#b91c1c', fontSize: '0.8125rem', marginTop: '0.5rem' }}>{error}</p>}
        </div>
      )}

      {total === 0 && !creating && (
        <div style={{ ...card, textAlign: 'center', color: '#6b7280' }} data-testid="selections-empty">
          No selections yet.{canManage ? ' Add an allowance on the estimate, then create a selection against it here.' : ''}
        </div>
      )}

      {areas.filter((a) => a.selections.length > 0).map((area) => (
        <section key={area.id} style={card} data-testid={`selection-area-${area.id}`}>
          <h3 style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', margin: '0 0 0.75rem' }}>{area.name}</h3>
          <div style={{ display: 'grid', gap: '0.75rem' }}>
            {area.selections.map((s) => {
              const chosen = s.options.filter((o) => o.is_chosen);
              const show = chosen.length ? chosen : s.options.slice(0, 1);
              const releasable = canManage && (s.status === 'draft' || s.status === 'in_discussion');
              return (
                <div key={s.id} style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                  {releasable && (
                    <input
                      type="checkbox"
                      aria-label={`Release ${s.name}`}
                      data-testid={`selection-release-${s.id}`}
                      checked={selected.includes(s.id)}
                      onChange={(e) => toggleSelected(s.id, e.target.checked)}
                      style={{ marginTop: '0.75rem' }}
                    />
                  )}
                <Link href={`${base}/${s.id}`} data-testid={`selection-row-${s.id}`} style={{ flex: 1, display: 'flex', gap: '0.75rem', alignItems: 'flex-start', textDecoration: 'none', color: 'inherit', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #f3f4f6' }}>
                  <RowThumb selectionId={s.id} optionId={show[0]?.id ?? null} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                      <strong style={{ fontSize: '0.9375rem' }}>{s.name}</strong>
                      <StatusPill status={s.status} />
                      {s.client_supplied && <span style={{ fontSize: '0.6875rem', color: '#6b7280' }}>client supplies</span>}
                    </div>
                    {chosen.length > 0 && (
                      <div style={{ fontSize: '0.8125rem', marginTop: '0.125rem' }}>
                        Chosen: {chosen.map((o) => o.name).join(', ')}
                        {chosen[0]?.spec_detail ? <span style={{ color: '#6b7280' }}> — {chosen[0].spec_detail}</span> : null}
                      </div>
                    )}
                    {chosen.length === 0 && s.options.length > 0 && <div style={{ fontSize: '0.8125rem', color: '#6b7280', marginTop: '0.125rem' }}>{s.options.length} option{s.options.length === 1 ? '' : 's'} for the client to choose from</div>}
                    {s.mode === 'discussion' && s.options.length === 0 && <div style={{ fontSize: '0.8125rem', color: '#6b7280', marginTop: '0.125rem' }}>In discussion with the client</div>}
                    <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.25rem' }}>
                      {s.allowance_description ? `Against allowance: ${s.allowance_description}` : s.client_supplied ? 'No allowance' : 'Not linked to an allowance'}
                      {s.due_date ? ` · due ${s.due_date}` : ''}
                      {show[0]?.link_url ? ' · link' : ''}
                    </div>
                  </div>
                </Link>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

function RowThumb({ selectionId, optionId }: { selectionId: string; optionId: string | null }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    if (optionId) fetchSelectionOptionImages(selectionId).then((m) => live && setUrl(m[optionId]?.image ?? m[optionId]?.link_thumbnail ?? null));
    return () => {
      live = false;
    };
  }, [selectionId, optionId]);
  return <UrlThumb url={url} />;
}
