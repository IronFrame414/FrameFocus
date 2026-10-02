'use client';

// S122 Part 8 — SCHEDULE TEMPLATES, inside the Critical Path tab [ruling 6].
//
//   · STAMP (a schedule editor): pick a template and ONE start date; the engine
//     computes the rest. ⚠️ A project that already has tasks is REFUSED [Josh,
//     RULED]: said here with the count, and refused again by the server.
//   · SAVE AS TEMPLATE (Owner/Admin): this project's phases, tasks, durations and
//     links — never dates, assignees or percent.
//   · DELETE (Owner/Admin).
// The mechanism (who may, what is written) is lib/critical-path/templates.ts and
// RLS; this card only asks.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useConfirm } from '@/components/confirm/confirm-provider';
import { alreadyHasTasks } from '@/lib/critical-path/template-words';
import type { ScheduleTemplateSummary } from '@/lib/critical-path/templates';

const card: React.CSSProperties = {
  backgroundColor: 'white',
  border: '1px solid #e5e7eb',
  borderRadius: '0.5rem',
  padding: '1rem',
  marginBottom: '1rem',
};
const h2: React.CSSProperties = { fontSize: '0.8125rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', margin: '0 0 0.5rem' };
const input: React.CSSProperties = { padding: '0.4rem 0.5rem', border: '1px solid #d1d5db', borderRadius: '0.375rem', fontSize: '0.875rem' };
const btn: React.CSSProperties = { padding: '0.4rem 0.75rem', borderRadius: '0.375rem', border: '1px solid #1d4ed8', backgroundColor: '#1d4ed8', color: 'white', fontSize: '0.875rem', cursor: 'pointer' };

async function post(url: string, method: 'POST' | 'DELETE', body?: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch(url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.ok) return { ok: true };
    const j = (await res.json().catch(() => ({}))) as { error?: unknown };
    return { ok: false, error: typeof j.error === 'string' ? j.error : `That did not work (${res.status}).` };
  } catch {
    return { ok: false, error: 'The request did not reach the server. Check the connection and try again.' };
  }
}

export function TemplatesCard({
  projectId,
  role,
  canEdit,
  taskCount,
  templates,
}: {
  projectId: string;
  role: string;
  canEdit: boolean;
  taskCount: number;
  templates: ScheduleTemplateSummary[];
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const ownerAdmin = role === 'owner' || role === 'admin';
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? '');
  const [startDate, setStartDate] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  if (!canEdit && !ownerAdmin) return null;

  async function stamp() {
    setBusy(true);
    setError(null);
    const r = await post(`/api/projects/${projectId}/critical-path/stamp`, 'POST', { templateId, startDate });
    setBusy(false);
    if (!r.ok) setError(r.error);
    else router.refresh();
  }
  async function save() {
    setBusy(true);
    setError(null);
    setNotice(null);
    const r = await post('/api/schedule-templates', 'POST', { projectId, name });
    setBusy(false);
    if (!r.ok) setError(r.error);
    else {
      setNotice(`Saved "${name.trim()}" as a template: phases, tasks, durations and links (no dates, no people).`);
      setName('');
      router.refresh();
    }
  }
  async function remove(t: ScheduleTemplateSummary) {
    const ok = await confirm({ title: 'Delete template', message: `Delete the template "${t.name}"? Projects already stamped from it keep their tasks.`, confirmLabel: 'Delete' });
    if (!ok) return;
    setError(null);
    const r = await post(`/api/schedule-templates/${t.id}`, 'DELETE');
    if (!r.ok) setError(r.error);
    else router.refresh();
  }

  return (
    <div style={card} data-testid="cp-templates">
      <h2 style={h2}>Templates</h2>
      {error && (
        <div data-testid="tpl-error" role="alert" style={{ marginBottom: '0.5rem', color: '#991b1b', fontSize: '0.875rem' }}>
          {error}
        </div>
      )}
      {notice && (
        <div data-testid="tpl-notice" role="status" style={{ marginBottom: '0.5rem', color: '#15803d', fontSize: '0.875rem' }}>
          {notice}
        </div>
      )}

      {canEdit && (
        <div style={{ marginBottom: '0.75rem' }}>
          <div style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.25rem' }}>Start from a template</div>
          {taskCount > 0 ? (
            <p data-testid="tpl-has-tasks" style={{ fontSize: '0.8125rem', color: '#92400e', margin: 0 }}>
              {alreadyHasTasks(taskCount)}
            </p>
          ) : templates.length === 0 ? (
            <p style={{ fontSize: '0.8125rem', color: '#6b7280', margin: 0 }}>No templates yet. An Owner or Admin saves one from a finished project.</p>
          ) : (
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <select data-testid="tpl-select" value={templateId} onChange={(e) => setTemplateId(e.target.value)} style={input}>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.tasks} {t.tasks === 1 ? 'task' : 'tasks'})
                  </option>
                ))}
              </select>
              <label style={{ fontSize: '0.8125rem' }}>
                Start{' '}
                <input data-testid="tpl-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={input} />
              </label>
              <button data-testid="tpl-stamp" type="button" disabled={busy || !templateId || !startDate} onClick={stamp} style={btn}>
                Stamp
              </button>
            </div>
          )}
        </div>
      )}

      {ownerAdmin && taskCount > 0 && (
        <div style={{ marginBottom: '0.75rem' }}>
          <div style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.25rem' }}>Save this network as a template</div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <input data-testid="tpl-name" placeholder="Template name" value={name} onChange={(e) => setName(e.target.value)} style={input} maxLength={200} />
            <button data-testid="tpl-save" type="button" disabled={busy || !name.trim()} onClick={save} style={btn}>
              Save as template
            </button>
          </div>
        </div>
      )}

      {ownerAdmin && templates.length > 0 && (
        <ul style={{ margin: 0, paddingLeft: '1.1rem', fontSize: '0.8125rem' }}>
          {templates.map((t) => (
            <li key={t.id} data-testid={`tpl-row-${t.id}`}>
              {t.name} ({t.tasks} {t.tasks === 1 ? 'task' : 'tasks'}){' '}
              <button data-testid={`tpl-delete-${t.id}`} type="button" onClick={() => remove(t)} style={{ border: 'none', background: 'none', color: '#991b1b', cursor: 'pointer', fontSize: '0.8125rem' }}>
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
