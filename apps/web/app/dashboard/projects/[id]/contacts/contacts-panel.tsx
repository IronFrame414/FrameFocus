'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CONTACT_TYPES, CONTACT_TYPE_LABELS } from '@framefocus/shared/constants';
import type { ContactType } from '@framefocus/shared/constants';
import type { ProjectContact } from '@/lib/services/project-contacts-client';
import {
  attachContact,
  createAndAttachContact,
  detachContact,
} from '@/lib/services/project-contacts-client';

interface ContactsPanelProps {
  projectId: string;
  projectContacts: ProjectContact[];
  allContacts: { id: string; name: string; contact_type: string }[];
  canManage: boolean;
}

// External stakeholder types offered when creating a contact from a project
const EXTERNAL_TYPES = CONTACT_TYPES.filter((t) => t.value !== 'lead' && t.value !== 'client');

export function ContactsPanel({
  projectId,
  projectContacts,
  allContacts,
  canManage,
}: ContactsPanelProps) {
  const router = useRouter();
  const [mode, setMode] = useState<'existing' | 'new'>('existing');
  const [contactId, setContactId] = useState('');
  const [role, setRole] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [contactType, setContactType] = useState<ContactType>('architect');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const attachedIds = new Set(projectContacts.map((pc) => pc.contact_id));
  const available = allContacts.filter((c) => !attachedIds.has(c.id));

  async function handleAttach() {
    setBusy(true);
    setError(null);

    let result: { success: boolean; error?: string };
    if (mode === 'existing') {
      if (!contactId) {
        setError('Select a contact.');
        setBusy(false);
        return;
      }
      result = await attachContact(projectId, contactId, role.trim() || null);
    } else {
      if (!firstName.trim() || !lastName.trim()) {
        setError('First and last name are required.');
        setBusy(false);
        return;
      }
      // Write-through: creates a normal Module 2 contact (typed external) and
      // links it — reusable on future projects.
      result = await createAndAttachContact(
        projectId,
        {
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          contact_type: contactType,
          company_name: companyName.trim() || null,
          email: email.trim() || null,
          phone: phone.trim() || null,
        },
        role.trim() || null
      );
    }

    if (result.success) {
      setContactId('');
      setRole('');
      setFirstName('');
      setLastName('');
      setCompanyName('');
      setEmail('');
      setPhone('');
      router.refresh();
    } else {
      setError(result.error || 'Attach failed');
    }
    setBusy(false);
  }

  async function handleDetach(pcId: string, name: string) {
    if (!confirm(`Remove ${name} from this project?`)) return;
    setBusy(true);
    const result = await detachContact(pcId);
    if (result.success) {
      router.refresh();
    } else {
      setError(result.error || 'Remove failed');
    }
    setBusy(false);
  }

  const cardStyle: React.CSSProperties = {
    backgroundColor: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: '0.5rem',
    padding: '1.25rem',
    marginBottom: '1rem',
  };
  const titleStyle: React.CSSProperties = {
    fontSize: '0.8125rem',
    fontWeight: 600,
    color: '#6b7280',
    textTransform: 'uppercase',
    marginBottom: '0.75rem',
  };
  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '0.5rem',
    border: '1px solid #d1d5db',
    borderRadius: '0.375rem',
    fontSize: '0.875rem',
  };

  return (
    <div style={{ maxWidth: '720px' }}>
      {canManage && (
        <div style={cardStyle}>
          <div style={titleStyle}>Add a Project Contact</div>
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
            <button
              onClick={() => setMode('existing')}
              style={{
                padding: '0.375rem 0.75rem',
                fontSize: '0.8125rem',
                borderRadius: '0.375rem',
                border: '1px solid #d1d5db',
                backgroundColor: mode === 'existing' ? '#2563eb' : '#fff',
                color: mode === 'existing' ? '#fff' : '#374151',
                cursor: 'pointer',
              }}
            >
              Existing Contact
            </button>
            <button
              onClick={() => setMode('new')}
              style={{
                padding: '0.375rem 0.75rem',
                fontSize: '0.8125rem',
                borderRadius: '0.375rem',
                border: '1px solid #d1d5db',
                backgroundColor: mode === 'new' ? '#2563eb' : '#fff',
                color: mode === 'new' ? '#fff' : '#374151',
                cursor: 'pointer',
              }}
            >
              New Contact
            </button>
          </div>

          {mode === 'existing' ? (
            <div style={{ marginBottom: '0.75rem' }}>
              <select
                value={contactId}
                onChange={(e) => setContactId(e.target.value)}
                style={inputStyle}
              >
                <option value="">Select a contact…</option>
                {available.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} — {CONTACT_TYPE_LABELS[c.contact_type as ContactType] ?? c.contact_type}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
              <input
                placeholder="First name *"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                style={inputStyle}
              />
              <input
                placeholder="Last name *"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                style={inputStyle}
              />
              <input
                placeholder="Company / organization"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                style={inputStyle}
              />
              <select
                value={contactType}
                onChange={(e) => setContactType(e.target.value as ContactType)}
                style={inputStyle}
              >
                {EXTERNAL_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
              <input
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={inputStyle}
              />
              <input
                placeholder="Phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                style={inputStyle}
              />
            </div>
          )}

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              placeholder="Role on this project (e.g. Architect of record)"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              style={{ ...inputStyle, flex: 1 }}
            />
            <button
              onClick={handleAttach}
              disabled={busy}
              style={{
                padding: '0.5rem 1rem',
                fontSize: '0.875rem',
                fontWeight: 600,
                color: '#fff',
                backgroundColor: busy ? '#93c5fd' : '#2563eb',
                border: 'none',
                borderRadius: '0.375rem',
                cursor: busy ? 'default' : 'pointer',
              }}
            >
              Add
            </button>
          </div>
          {error && (
            <div
              style={{
                padding: '0.5rem',
                marginTop: '0.5rem',
                backgroundColor: '#fee2e2',
                color: '#991b1b',
                borderRadius: '0.375rem',
                fontSize: '0.8125rem',
              }}
            >
              {error}
            </div>
          )}
        </div>
      )}

      <div style={cardStyle}>
        <div style={titleStyle}>Project Contacts ({projectContacts.length})</div>
        {projectContacts.length === 0 ? (
          <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>
            No external stakeholders attached yet (architect, inspector, building department…).
          </p>
        ) : (
          projectContacts.map((pc) => (
            <div
              key={pc.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '0.5rem 0',
                borderBottom: '1px solid #f3f4f6',
                fontSize: '0.875rem',
              }}
            >
              <div>
                <span style={{ fontWeight: 500 }}>
                  {pc.contact ? `${pc.contact.first_name} ${pc.contact.last_name}` : 'Unknown'}
                </span>
                {pc.contact?.company_name && (
                  <span style={{ color: '#6b7280' }}> · {pc.contact.company_name}</span>
                )}
                <span style={{ color: '#6b7280' }}>
                  {' '}
                  · {pc.role || CONTACT_TYPE_LABELS[pc.contact?.contact_type as ContactType] || ''}
                </span>
                {pc.contact?.phone && <span style={{ color: '#6b7280' }}> · {pc.contact.phone}</span>}
              </div>
              {canManage && (
                <button
                  onClick={() =>
                    handleDetach(
                      pc.id,
                      pc.contact ? `${pc.contact.first_name} ${pc.contact.last_name}` : 'contact'
                    )
                  }
                  disabled={busy}
                  style={{
                    padding: '0.25rem 0.625rem',
                    fontSize: '0.75rem',
                    color: '#991b1b',
                    backgroundColor: '#fff',
                    border: '1px solid #fecaca',
                    borderRadius: '0.375rem',
                    cursor: busy ? 'default' : 'pointer',
                  }}
                >
                  Remove
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
