'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Estimate,
  cloneEstimate,
  createEstimate,
  listEstimates,
} from '@/lib/services/estimates-client';
import { createEstimateSchema } from '@framefocus/shared/validation/estimate';
import { ContactAddressPicker } from '../contact-address-picker';

// 4D entry form. "Clone from existing" routes through cloneEstimate
// (4K) instead of createEstimate — same redirect either way.

export function NewEstimateForm() {
  const router = useRouter();
  const [contactId, setContactId] = useState<string | null>(null);
  const [addressId, setAddressId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [cloneSourceId, setCloneSourceId] = useState('');
  const [pastEstimates, setPastEstimates] = useState<Estimate[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listEstimates().then(setPastEstimates);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const parsed = createEstimateSchema.safeParse({
      name: name.trim(),
      contact_id: contactId,
      contact_address_id: addressId,
    });
    if (!parsed.success) {
      setError(parsed.error.errors[0].message);
      return;
    }

    setSubmitting(true);
    const result = cloneSourceId
      ? await cloneEstimate(cloneSourceId, {
          contact_id: parsed.data.contact_id,
          contact_address_id: parsed.data.contact_address_id,
          name: parsed.data.name,
        })
      : await createEstimate(parsed.data);
    setSubmitting(false);

    if (result.success && result.id) {
      router.push(`/dashboard/estimates/${result.id}`);
    } else {
      setError(result.error || 'Could not create the estimate');
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '0.5rem 0.75rem',
    border: '1px solid #d1d5db',
    borderRadius: '0.375rem',
    fontSize: '0.875rem',
  };
  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '0.875rem',
    fontWeight: 500,
    marginBottom: '0.25rem',
    color: '#374151',
  };

  return (
    <form onSubmit={handleSubmit}>
      <ContactAddressPicker
        contactId={contactId}
        addressId={addressId}
        onChange={(c, a) => {
          setContactId(c);
          setAddressId(a);
        }}
      />

      <div style={{ marginBottom: '1rem' }}>
        <label style={labelStyle}>Estimate name *</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Bishop Kitchen & Flooring Reno"
          style={inputStyle}
        />
      </div>

      <div style={{ marginBottom: '1.5rem' }}>
        <label style={labelStyle}>Clone from existing? (optional)</label>
        <select
          value={cloneSourceId}
          onChange={(e) => setCloneSourceId(e.target.value)}
          style={inputStyle}
        >
          <option value="">Start from scratch</option>
          {pastEstimates.map((est) => (
            <option key={est.id} value={est.id}>
              {est.estimate_number} — {est.name}
            </option>
          ))}
        </select>
        {cloneSourceId && (
          <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
            Items, terms, scope, and pricing copy over. Sub bids and notes do not.
          </p>
        )}
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

      <button
        type="submit"
        disabled={submitting}
        style={{
          padding: '0.625rem 1.5rem',
          fontSize: '0.875rem',
          fontWeight: 600,
          color: '#fff',
          backgroundColor: submitting ? '#9ca3af' : '#2563eb',
          border: 'none',
          borderRadius: '0.375rem',
          cursor: submitting ? 'not-allowed' : 'pointer',
        }}
      >
        {submitting ? 'Creating…' : 'Create Estimate'}
      </button>
    </form>
  );
}
