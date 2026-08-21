"use client";
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createSelection, createSelectionArea } from '@/lib/services/selections-client';
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
};
const STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  draft: { bg: '#f3f4f6', fg: '#374151' },
  in_discussion: { bg: '#fef3c7', fg: '#92400e' },
  awaiting_approval: { bg: '#dbeafe', fg: '#1e40af' },
  approved: { bg: '#dcfce7', fg: '#166534' },
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
  const base = `/dashboard/projects/${projectId}/selections`;

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
        {canManage && !creating && (
          <button type="button" data-testid="selection-new" style={button} onClick={() => setCreating(true)}>
            + New selection
          </button>
        )}
      </div>

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
              return (
                <Link key={s.id} href={`${base}/${s.id}`} data-testid={`selection-row-${s.id}`} style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start', textDecoration: 'none', color: 'inherit', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #f3f4f6' }}>
                  <OptionThumb fileId={show[0]?.image_file_id ?? null} />
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
                    {chosen.length === 0 && s.options.length > 0 && <div style={{ fontSize: '0.8125rem', color: '#6b7280', marginTop: '0.125rem' }}>{s.options.length} option{s.options.length === 1 ? '' : 's'} offered</div>}
                    {s.mode === 'discussion' && s.options.length === 0 && <div style={{ fontSize: '0.8125rem', color: '#6b7280', marginTop: '0.125rem' }}>In discussion with the client</div>}
                    <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.25rem' }}>
                      {s.allowance_description ? `Against allowance: ${s.allowance_description}` : s.client_supplied ? 'No allowance' : 'Not linked to an allowance'}
                      {s.due_date ? ` · due ${s.due_date}` : ''}
                      {show[0]?.link_url ? ' · link' : ''}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
