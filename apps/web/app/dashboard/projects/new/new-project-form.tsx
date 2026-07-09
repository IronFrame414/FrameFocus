'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createProject } from '@/lib/services/projects-client';
import type { ProjectType } from '@/lib/services/projects-client';

interface NewProjectFormProps {
  contacts: { id: string; name: string }[];
}

export function NewProjectForm({ contacts }: NewProjectFormProps) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [contactId, setContactId] = useState('');
  const [projectType, setProjectType] = useState<ProjectType>('fixed_price');
  const [startDate, setStartDate] = useState('');
  const [targetEndDate, setTargetEndDate] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !contactId) {
      setError('Project name and client are required.');
      return;
    }
    setSaving(true);
    setError(null);

    const result = await createProject({
      name: name.trim(),
      contact_id: contactId,
      project_type: projectType,
      start_date: startDate || null,
      target_end_date: targetEndDate || null,
      internal_notes: notes.trim() || null,
    });

    if (result.success && result.id) {
      router.push(`/dashboard/projects/${result.id}`);
      router.refresh();
    } else {
      setError(result.error || 'Failed to create project');
      setSaving(false);
    }
  }

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '0.875rem',
    fontWeight: 500,
    marginBottom: '0.25rem',
  };
  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '0.5rem',
    border: '1px solid #d1d5db',
    borderRadius: '0.375rem',
    fontSize: '0.875rem',
  };
  const fieldStyle: React.CSSProperties = { marginBottom: '1rem' };

  return (
    <form onSubmit={handleSubmit} style={{ maxWidth: '640px' }}>
      <div
        style={{
          backgroundColor: '#fff',
          border: '1px solid #e5e7eb',
          borderRadius: '0.5rem',
          padding: '1.5rem',
        }}
      >
        <div style={fieldStyle}>
          <label style={labelStyle}>Project Name *</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={inputStyle}
            placeholder="Johnson kitchen remodel"
          />
        </div>

        <div style={fieldStyle}>
          <label style={labelStyle}>Client *</label>
          <select value={contactId} onChange={(e) => setContactId(e.target.value)} style={inputStyle}>
            <option value="">Select a contact…</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div style={fieldStyle}>
          <label style={labelStyle}>Project Type</label>
          <select
            value={projectType}
            onChange={(e) => setProjectType(e.target.value as ProjectType)}
            style={inputStyle}
          >
            <option value="fixed_price">Fixed Price</option>
            <option value="time_and_materials">Time &amp; Materials</option>
            <option value="cost_plus">Cost Plus</option>
          </select>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
          <div>
            <label style={labelStyle}>Start Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Target End Date</label>
            <input
              type="date"
              value={targetEndDate}
              onChange={(e) => setTargetEndDate(e.target.value)}
              style={inputStyle}
            />
          </div>
        </div>

        <div style={fieldStyle}>
          <label style={labelStyle}>Internal Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            style={{ ...inputStyle, minHeight: '80px' }}
          />
        </div>

        {error && (
          <div
            style={{
              padding: '0.75rem',
              marginBottom: '1rem',
              backgroundColor: '#fee2e2',
              color: '#991b1b',
              borderRadius: '0.375rem',
              fontSize: '0.875rem',
            }}
          >
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button
            type="submit"
            disabled={saving}
            style={{
              padding: '0.5rem 1.25rem',
              fontSize: '0.875rem',
              fontWeight: 600,
              color: '#fff',
              backgroundColor: saving ? '#93c5fd' : '#2563eb',
              border: 'none',
              borderRadius: '0.375rem',
              cursor: saving ? 'default' : 'pointer',
            }}
          >
            {saving ? 'Creating…' : 'Create Project'}
          </button>
          <button
            type="button"
            onClick={() => router.push('/dashboard/projects')}
            style={{
              padding: '0.5rem 1.25rem',
              fontSize: '0.875rem',
              color: '#374151',
              backgroundColor: '#fff',
              border: '1px solid #d1d5db',
              borderRadius: '0.375rem',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </form>
  );
}
