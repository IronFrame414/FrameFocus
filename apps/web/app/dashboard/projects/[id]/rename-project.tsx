'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { renameProject } from '@/lib/services/projects-client';
import { color, primaryButtonStyle } from '@/lib/theme';

// S118 item 14 — rename a project (Owner/Admin; the database refuses anyone
// else). The new name shows everywhere the app reads it live; documents already
// SENT keep the name they were sent under (lib/projects/name-at.ts).
//
// Desktop only, deliberately: /m has no project-settings surface for Owner/Admin
// to rename from, and the rule lives in the database either way (PARITY: the
// rule below the UI; the surfaces differ only in where the control is).

export function RenameProject({ projectId, name }: { projectId: string; name: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!editing) {
    return (
      <button
        type="button"
        data-testid="project-rename"
        onClick={() => {
          setValue(name);
          setError(null);
          setEditing(true);
        }}
        style={{
          fontSize: '12.5px',
          fontWeight: 600,
          color: color.primary,
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: 0,
        }}
      >
        Rename
      </button>
    );
  }

  async function save() {
    setBusy(true);
    setError(null);
    const res = await renameProject(projectId, value);
    setBusy(false);
    if (!res.success) {
      setError(res.error ?? 'The project was not renamed.');
      return;
    }
    setEditing(false);
    router.refresh();
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          data-testid="project-rename-input"
          aria-label="Project name"
          style={{
            fontSize: '16px',
            padding: '6px 10px',
            borderRadius: '8px',
            border: `1px solid ${color.inputBorder}`,
            minWidth: '280px',
          }}
        />
        <button
          type="button"
          data-testid="project-rename-save"
          disabled={busy || value.trim() === '' || value.trim() === name}
          onClick={() => void save()}
          style={primaryButtonStyle}
        >
          {busy ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: color.muted }}
        >
          Cancel
        </button>
      </div>
      <p style={{ fontSize: '12px', color: color.muted, margin: 0 }}>
        Invoices and change orders already sent keep the name they were sent under.
      </p>
      {error ? (
        <p data-testid="project-rename-error" style={{ fontSize: '12.5px', color: color.danger, margin: 0 }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
