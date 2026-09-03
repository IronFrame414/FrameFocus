'use client';

import { useEffect, useState } from 'react';
import {
  listContactOptions,
  createContact,
  type ContactOption,
} from '@/lib/services/contacts-client';
import type { AlsoSendToRecipient } from '@/lib/services/estimates-client';

// 19b "Also send to" (§1.4) — extra proposal recipients (spouse, architect,
// lender). Per-job; frozen on send. A recipient is chosen from existing
// contacts OR created inline via "add a new contact", which then adds it
// automatically. Each entry stores the contact_id AND a name/email SNAPSHOT so
// a sent estimate's recipient list resolves to where it was actually sent even
// if the contact is later edited.

function contactLabel(c: Pick<ContactOption, 'first_name' | 'last_name' | 'company_name'>): string {
  const name = `${c.first_name} ${c.last_name}`.trim();
  return c.company_name ? `${name} · ${c.company_name}` : name;
}

export function AlsoSendToField({
  value,
  canEdit,
  onChange,
}: {
  value: AlsoSendToRecipient[];
  canEdit: boolean;
  onChange: (next: AlsoSendToRecipient[]) => void;
}) {
  const [options, setOptions] = useState<ContactOption[]>([]);
  const [adding, setAdding] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listContactOptions().then((r) => setOptions(r.options));
  }, []);

  const chosenIds = new Set(value.map((r) => r.contact_id));
  const available = options.filter((o) => !chosenIds.has(o.id));

  function addExisting(contactId: string) {
    const c = options.find((o) => o.id === contactId);
    if (!c) return;
    onChange([
      ...value,
      { contact_id: c.id, name: `${c.first_name} ${c.last_name}`.trim(), email: c.email },
    ]);
  }

  function remove(contactId: string) {
    onChange(value.filter((r) => r.contact_id !== contactId));
  }

  async function saveNewContact() {
    setError(null);
    if (!firstName.trim() || !lastName.trim()) {
      setError('First and last name are required.');
      return;
    }
    setBusy(true);
    const result = await createContact({
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      email: email.trim() || null,
    });
    setBusy(false);
    if (!result.success || !result.id) {
      setError(result.error || 'Could not create the contact.');
      return;
    }
    const newOption: ContactOption = {
      id: result.id,
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      company_name: null,
      email: email.trim() || null,
    };
    setOptions((prev) => [...prev, newOption]);
    onChange([
      ...value,
      { contact_id: result.id, name: `${firstName.trim()} ${lastName.trim()}`, email: email.trim() || null },
    ]);
    setFirstName('');
    setLastName('');
    setEmail('');
    setAdding(false);
  }

  const chip: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.375rem',
    padding: '0.25rem 0.5rem',
    background: '#f2f4ff',
    border: '1px solid #dbe0fb',
    borderRadius: '9999px',
    fontSize: '0.75rem',
  };
  const input: React.CSSProperties = {
    width: '100%',
    padding: '0.4rem 0.6rem',
    border: '1px solid #d5dae4',
    borderRadius: '0.375rem',
    fontSize: '0.8125rem',
  };
  const smallBtn: React.CSSProperties = {
    padding: '0.35rem 0.7rem',
    fontSize: '0.8125rem',
    border: '1px solid #d5dae4',
    borderRadius: '0.375rem',
    background: '#f4f6fa',
    cursor: 'pointer',
  };

  return (
    <div style={{ marginTop: '0.75rem' }}>
      <label
        style={{
          display: 'block',
          fontSize: '0.75rem',
          fontWeight: 600,
          color: '#5b6472',
          marginBottom: '0.25rem',
        }}
      >
        Also send to{' '}
        <span style={{ color: '#9aa4b8', fontWeight: 400 }}>(spouse, architect, lender)</span>
      </label>

      {value.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem', marginBottom: '0.5rem' }}>
          {value.map((r) => (
            <span key={r.contact_id} style={chip}>
              <span>
                {r.name}
                {r.email ? ` · ${r.email}` : ''}
              </span>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => remove(r.contact_id)}
                  aria-label={`Remove ${r.name}`}
                  style={{ background: 'none', border: 'none', color: '#c0362c', cursor: 'pointer', padding: 0 }}
                >
                  ✕
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      {canEdit && !adding && (
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <select
            value=""
            onChange={(e) => e.target.value && addExisting(e.target.value)}
            style={{ ...input, maxWidth: '260px' }}
          >
            <option value="">Add an existing contact…</option>
            {available.map((o) => (
              <option key={o.id} value={o.id}>
                {contactLabel(o)}
              </option>
            ))}
          </select>
          <button type="button" onClick={() => setAdding(true)} style={smallBtn}>
            + Add a new contact
          </button>
        </div>
      )}

      {canEdit && adding && (
        <div
          style={{
            border: '1px solid #e4e8ef',
            borderRadius: '0.5rem',
            padding: '0.75rem',
            background: '#fbfcfe',
          }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <input
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="First name"
              style={input}
            />
            <input
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Last name"
              style={input}
            />
          </div>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email (optional)"
            style={{ ...input, marginBottom: '0.5rem' }}
          />
          {error && <div style={{ color: '#c0362c', fontSize: '0.75rem', marginBottom: '0.5rem' }}>{error}</div>}
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              type="button"
              disabled={busy}
              onClick={saveNewContact}
              style={{ ...smallBtn, background: '#3b4ae0', color: '#fff', border: '1px solid #3b4ae0' }}
            >
              {busy ? 'Saving…' : 'Add contact'}
            </button>
            <button
              type="button"
              onClick={() => {
                setAdding(false);
                setError(null);
              }}
              style={smallBtn}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
