'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { updateTeamMemberAction, deleteTeamMemberAction, resetPasswordAction } from './actions';

type Props = {
  target: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string;
    phone: string | null;
    role: string;
    notes: string | null;
    created_at: string | null;
  };
  callerRole: 'owner' | 'admin';
};

const OWNER_ROLE_OPTIONS = [
  { value: 'admin', label: 'Admin' },
  { value: 'project_manager', label: 'Project Manager' },
  { value: 'foreman', label: 'Foreman' },
  { value: 'crew_member', label: 'Crew Member' },
];

const ADMIN_ROLE_OPTIONS = [
  { value: 'project_manager', label: 'Project Manager' },
  { value: 'foreman', label: 'Foreman' },
  { value: 'crew_member', label: 'Crew Member' },
];

export default function EditForm({ target, callerRole }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [firstName, setFirstName] = useState(target.first_name ?? '');
  const [lastName, setLastName] = useState(target.last_name ?? '');
  const [phone, setPhone] = useState(target.phone ?? '');
  const [role, setRole] = useState(target.role);
  const [notes, setNotes] = useState(target.notes ?? '');

  const [saveMessage, setSaveMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [resetMessage, setResetMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [deleteMessage, setDeleteMessage] = useState<{ type: 'error'; text: string } | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // Preserve target role in the dropdown even if it's not in the caller's allowed set
  // (e.g., target is Admin, current role stays Admin; the role is disabled via RLS anyway
  // for that case, but page.tsx already blocks that path for admin callers).
  const baseOptions = callerRole === 'owner' ? OWNER_ROLE_OPTIONS : ADMIN_ROLE_OPTIONS;
  const roleOptions = baseOptions.find((o) => o.value === target.role)
    ? baseOptions
    : [{ value: target.role, label: target.role }, ...baseOptions];

  async function handleSave() {
    setSaveMessage(null);
    startTransition(async () => {
      try {
        await updateTeamMemberAction(target.id, {
          first_name: firstName,
          last_name: lastName,
          phone: phone.trim() === '' ? null : phone.trim(),
          role,
          notes: notes.trim() === '' ? null : notes.trim(),
        });
        setSaveMessage({ type: 'success', text: 'Saved.' });
        setTimeout(() => router.push('/dashboard/team'), 1000);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Save failed.';
        setSaveMessage({ type: 'error', text: msg });
      }
    });
  }

  async function handleReset() {
    setResetMessage(null);
    startTransition(async () => {
      try {
        await resetPasswordAction(target.id);
        setResetMessage({ type: 'success', text: `Password reset email sent to ${target.email}.` });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Reset failed.';
        setResetMessage({ type: 'error', text: msg });
      }
    });
  }

  async function handleDelete() {
    setDeleteMessage(null);
    startTransition(async () => {
      try {
        await deleteTeamMemberAction(target.id);
        // Server action redirects on success, so this typically won't run.
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Delete failed.';
        setDeleteMessage({ type: 'error', text: msg });
        setConfirmingDelete(false);
      }
    });
  }

  const addedDate = target.created_at ? new Date(target.created_at).toLocaleDateString() : '—';

  return (
    <div style={{ maxWidth: 640 }}>
      <a
        href="/dashboard/team"
        style={{
          display: 'inline-block',
          marginBottom: 16,
          color: '#2563eb',
          textDecoration: 'none',
          fontSize: 14,
        }}
      >
        ← Back to team
      </a>
      <div style={{ marginBottom: 16 }}>
        <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 4 }}>
          Email
        </label>
        <div style={{ padding: 8, background: '#f3f4f6', borderRadius: 4, color: '#6b7280' }}>
          {target.email}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
        <div>
          <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 4 }}>
            First name
          </label>
          <input
            type="text"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            style={{ width: '100%', padding: 8, border: '1px solid #d1d5db', borderRadius: 4 }}
          />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 4 }}>
            Last name
          </label>
          <input
            type="text"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            style={{ width: '100%', padding: 8, border: '1px solid #d1d5db', borderRadius: 4 }}
          />
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 4 }}>
          Phone
        </label>
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          style={{ width: '100%', padding: 8, border: '1px solid #d1d5db', borderRadius: 4 }}
        />
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 4 }}>
          Role
        </label>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value)}
          style={{
            width: '100%',
            padding: 8,
            border: '1px solid #d1d5db',
            borderRadius: 4,
            background: 'white',
          }}
        >
          {roleOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 4 }}>
          Notes
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={4}
          style={{
            width: '100%',
            padding: 8,
            border: '1px solid #d1d5db',
            borderRadius: 4,
            fontFamily: 'inherit',
          }}
        />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button
          type="button"
          onClick={handleSave}
          disabled={isPending}
          style={{
            padding: '8px 16px',
            background: '#2563eb',
            color: 'white',
            border: 'none',
            borderRadius: 4,
            cursor: isPending ? 'not-allowed' : 'pointer',
            opacity: isPending ? 0.6 : 1,
          }}
        >
          Save changes
        </button>
        {saveMessage && (
          <span
            style={{ color: saveMessage.type === 'success' ? '#059669' : '#dc2626', fontSize: 14 }}
          >
            {saveMessage.text}
          </span>
        )}
      </div>

      <hr style={{ border: 0, borderTop: '1px solid #e5e7eb', margin: '24px 0' }} />

      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Password</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            type="button"
            onClick={handleReset}
            disabled={isPending}
            style={{
              padding: '8px 16px',
              background: 'white',
              color: '#374151',
              border: '1px solid #d1d5db',
              borderRadius: 4,
              cursor: isPending ? 'not-allowed' : 'pointer',
              opacity: isPending ? 0.6 : 1,
            }}
          >
            Send password reset email
          </button>
          {resetMessage && (
            <span
              style={{
                color: resetMessage.type === 'success' ? '#059669' : '#dc2626',
                fontSize: 14,
              }}
            >
              {resetMessage.text}
            </span>
          )}
        </div>
      </div>

      <hr style={{ border: 0, borderTop: '1px solid #e5e7eb', margin: '24px 0' }} />

      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8, color: '#991b1b' }}>
          Danger zone
        </h2>
        {!confirmingDelete ? (
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            disabled={isPending}
            style={{
              padding: '8px 16px',
              background: 'white',
              color: '#991b1b',
              border: '1px solid #991b1b',
              borderRadius: 4,
              cursor: isPending ? 'not-allowed' : 'pointer',
            }}
          >
            Delete team member
          </button>
        ) : (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              type="button"
              onClick={handleDelete}
              disabled={isPending}
              style={{
                padding: '8px 16px',
                background: '#991b1b',
                color: 'white',
                border: 'none',
                borderRadius: 4,
                cursor: isPending ? 'not-allowed' : 'pointer',
              }}
            >
              Confirm delete
            </button>
            <button
              type="button"
              onClick={() => setConfirmingDelete(false)}
              disabled={isPending}
              style={{
                padding: '8px 16px',
                background: 'white',
                color: '#374151',
                border: '1px solid #d1d5db',
                borderRadius: 4,
                cursor: isPending ? 'not-allowed' : 'pointer',
              }}
            >
              Cancel
            </button>
          </div>
        )}
        {deleteMessage && (
          <div style={{ color: '#dc2626', fontSize: 14, marginTop: 8 }}>{deleteMessage.text}</div>
        )}
      </div>

      <p style={{ fontSize: 12, color: '#9ca3af' }}>Added {addedDate}</p>
    </div>
  );
}
