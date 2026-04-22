'use client';

import { useState, useTransition } from 'react';
import { transferOwnershipAction } from './actions';

type Admin = {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
};

type Props = { admins: Admin[] };

function adminLabel(a: Admin): string {
  const name = `${a.first_name ?? ''} ${a.last_name ?? ''}`.trim();
  return name ? `${name} (${a.email})` : a.email;
}

export default function TransferForm({ admins }: Props) {
  const [isPending, startTransition] = useTransition();
  const [selectedId, setSelectedId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const canSubmit = selectedId !== '' && password !== '' && !isPending;

  if (admins.length === 0) {
    return (
      <div style={{ maxWidth: 640 }}>
        <div
          style={{
            padding: 16,
            background: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: 4,
            marginBottom: 16,
          }}
        >
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8, color: '#991b1b' }}>
            Transfer ownership
          </h2>
          <p style={{ fontSize: 14, color: '#7f1d1d', marginBottom: 12 }}>
            Transferring ownership is permanent. You will be demoted to Admin immediately. Only the
            new Owner can reverse it.
          </p>
        </div>
        <p style={{ fontSize: 14, color: '#374151' }}>
          Promote a team member to Admin before transferring ownership.{' '}
          <a
            href="/dashboard/team"
            style={{ color: '#2563eb', textDecoration: 'none' }}
          >
            Go to Team
          </a>
        </p>
      </div>
    );
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData();
    formData.set('new_owner_id', selectedId);
    formData.set('password', password);
    startTransition(async () => {
      const result = await transferOwnershipAction(formData);
      if (result && result.ok === false) {
        setError(result.error);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} style={{ maxWidth: 640 }}>
      <div
        style={{
          padding: 16,
          background: '#fef2f2',
          border: '1px solid #fecaca',
          borderRadius: 4,
          marginBottom: 16,
        }}
      >
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8, color: '#991b1b' }}>
          Transfer ownership
        </h2>
        <p style={{ fontSize: 14, color: '#7f1d1d' }}>
          Transferring ownership is permanent. You will be demoted to Admin immediately. Only the
          new Owner can reverse it.
        </p>
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 4 }}>
          New Owner
        </label>
        <select
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          disabled={isPending}
          style={{
            width: '100%',
            padding: 8,
            border: '1px solid #d1d5db',
            borderRadius: 4,
            background: 'white',
          }}
        >
          <option value="">Select an Admin...</option>
          {admins.map((a) => (
            <option key={a.id} value={a.id}>
              {adminLabel(a)}
            </option>
          ))}
        </select>
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 4 }}>
          Confirm your password
        </label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={isPending}
          autoComplete="current-password"
          style={{ width: '100%', padding: 8, border: '1px solid #d1d5db', borderRadius: 4 }}
        />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button
          type="submit"
          disabled={!canSubmit}
          style={{
            padding: '8px 16px',
            background: '#dc2626',
            color: 'white',
            border: 'none',
            borderRadius: 4,
            cursor: canSubmit ? 'pointer' : 'not-allowed',
            opacity: canSubmit ? 1 : 0.6,
          }}
        >
          {isPending ? 'Transferring...' : 'Transfer ownership'}
        </button>
        {error && (
          <span style={{ color: '#dc2626', fontSize: 14 }}>{error}</span>
        )}
      </div>

      <a
        href="/dashboard/team"
        style={{ color: '#2563eb', textDecoration: 'none', fontSize: 14 }}
      >
        ← Back to team
      </a>
    </form>
  );
}
