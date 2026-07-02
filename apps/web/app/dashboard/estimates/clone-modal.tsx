'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { cloneEstimate } from '@/lib/services/estimates-client';
import { cloneEstimateSchema } from '@framefocus/shared/validation/estimate';
import { ContactAddressPicker } from './contact-address-picker';

// 4K clone modal — entered from the estimates list row action and
// the builder's Details tab. New Draft from a source estimate with
// fresh number; source is never modified.

interface CloneModalProps {
  sourceId: string;
  sourceName: string;
  sourceNumber: string;
  onClose: () => void;
}

export function CloneModal({ sourceId, sourceName, sourceNumber, onClose }: CloneModalProps) {
  const router = useRouter();
  const [contactId, setContactId] = useState<string | null>(null);
  const [addressId, setAddressId] = useState<string | null>(null);
  const [name, setName] = useState(`Copy of ${sourceName}`);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setError(null);
    const parsed = cloneEstimateSchema.safeParse({
      source_estimate_id: sourceId,
      contact_id: contactId,
      contact_address_id: addressId,
      name: name.trim(),
    });
    if (!parsed.success) {
      setError(parsed.error.errors[0].message);
      return;
    }

    setSubmitting(true);
    const result = await cloneEstimate(sourceId, {
      contact_id: parsed.data.contact_id,
      contact_address_id: parsed.data.contact_address_id,
      name: parsed.data.name,
    });
    setSubmitting(false);

    if (result.success && result.id) {
      router.push(`/dashboard/estimates/${result.id}`);
    } else {
      setError(result.error || 'Clone failed');
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 50,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: '#fff',
          borderRadius: '0.5rem',
          padding: '1.5rem',
          width: '100%',
          maxWidth: '480px',
          maxHeight: '90vh',
          overflowY: 'auto',
        }}
      >
        <h2 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '0.25rem' }}>
          Clone &ldquo;{sourceName}&rdquo;
        </h2>
        <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '1.5rem' }}>
          Source estimate: {sourceName} ({sourceNumber})
        </p>

        <ContactAddressPicker
          contactId={contactId}
          addressId={addressId}
          onChange={(c, a) => {
            setContactId(c);
            setAddressId(a);
          }}
        />

        <div style={{ marginBottom: '1.5rem' }}>
          <label
            style={{
              display: 'block',
              fontSize: '0.875rem',
              fontWeight: 500,
              marginBottom: '0.25rem',
              color: '#374151',
            }}
          >
            New estimate name *
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{
              width: '100%',
              padding: '0.5rem 0.75rem',
              border: '1px solid #d1d5db',
              borderRadius: '0.375rem',
              fontSize: '0.875rem',
            }}
          />
        </div>

        {error && (
          <div
            style={{
              padding: '0.75rem 1rem',
              borderRadius: '0.375rem',
              marginBottom: '1rem',
              backgroundColor: '#fef2f2',
              color: '#991b1b',
              fontSize: '0.875rem',
            }}
          >
            {error}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            style={{
              padding: '0.5rem 1rem',
              fontSize: '0.875rem',
              backgroundColor: '#f3f4f6',
              border: '1px solid #d1d5db',
              borderRadius: '0.375rem',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            style={{
              padding: '0.5rem 1rem',
              fontSize: '0.875rem',
              fontWeight: 600,
              color: '#fff',
              backgroundColor: submitting ? '#9ca3af' : '#2563eb',
              border: 'none',
              borderRadius: '0.375rem',
              cursor: submitting ? 'not-allowed' : 'pointer',
            }}
          >
            {submitting ? 'Cloning…' : 'Create Clone'}
          </button>
        </div>
      </div>
    </div>
  );
}
