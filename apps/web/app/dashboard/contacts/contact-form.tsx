'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createContact, updateContact } from '@/lib/services/contacts-client';
import {
  createAddress,
  updatePrimaryAddress,
} from '@/lib/services/contact-addresses-client';
import type { PrimaryAddress } from '@/lib/services/contact-addresses-client';
import type { Contact } from '@/lib/services/contacts';
import { contactAddressSchema } from '@framefocus/shared/validation/contact-address';

import { CONTACT_TYPES, LEAD_SOURCES, US_STATES } from '@framefocus/shared/constants';

interface ContactFormProps {
  existing?: Contact;
  existingAddress?: PrimaryAddress | null;
}

export function ContactForm({ existing, existingAddress }: ContactFormProps) {
  const router = useRouter();
  const isEdit = !!existing;

  const [form, setForm] = useState({
    contact_type: existing?.contact_type || 'lead',
    status: existing?.status || 'active',
    first_name: existing?.first_name || '',
    last_name: existing?.last_name || '',
    company_name: existing?.company_name || '',
    email: existing?.email || '',
    phone: existing?.phone || '',
    mobile: existing?.mobile || '',
    label: existingAddress?.label || '',
    address_line1: existingAddress?.address_line1 || '',
    address_line2: existingAddress?.address_line2 || '',
    city: existingAddress?.city || '',
    state: existingAddress?.state || '',
    zip: existingAddress?.zip || '',
    source: existing?.source || '',
    notes: existing?.notes || '',
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSubmit() {
    if (!form.first_name.trim() || !form.last_name.trim()) {
      setError('First name and last name are required.');
      return;
    }

    setSaving(true);
    setError('');

    const contactPayload = {
      contact_type: form.contact_type,
      status: form.status,
      first_name: form.first_name.trim(),
      last_name: form.last_name.trim(),
      company_name: form.company_name.trim() || null,
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      mobile: form.mobile.trim() || null,
      source: form.source || null,
      notes: form.notes.trim() || null,
    };

    let parsedAddress: ReturnType<typeof contactAddressSchema.safeParse> | null = null;
    if (form.address_line1.trim()) {
      parsedAddress = contactAddressSchema.safeParse({
        label: form.label.trim() || undefined,
        address_line1: form.address_line1.trim(),
        address_line2: form.address_line2.trim() || undefined,
        city: form.city.trim(),
        state: form.state,
        zip: form.zip.trim(),
        is_primary: true,
      });
      if (!parsedAddress.success) {
        setError(parsedAddress.error.issues[0]?.message ?? 'Address is invalid.');
        setSaving(false);
        return;
      }
    }

    if (isEdit && existing) {
      const contactResult = await updateContact(existing.id, contactPayload);
      if (!contactResult.success) {
        setError(contactResult.error || 'Failed to save contact.');
        setSaving(false);
        return;
      }

      if (parsedAddress?.success) {
        const { is_primary: _is_primary, ...addressFields } = parsedAddress.data;
        const addressResult = await updatePrimaryAddress(existing.id, addressFields);
        if (!addressResult.success) {
          setError(addressResult.error || 'Failed to save address.');
          setSaving(false);
          return;
        }
      }
    } else {
      const contactResult = await createContact(contactPayload);
      if (!contactResult.success || !contactResult.id) {
        setError(contactResult.error || 'Failed to save contact.');
        setSaving(false);
        return;
      }

      if (parsedAddress?.success) {
        const addressResult = await createAddress({
          ...parsedAddress.data,
          contact_id: contactResult.id,
        });
        if (!addressResult.success) {
          setError(
            `Contact created, but address failed: ${addressResult.error ?? 'unknown error'}. Edit the contact to retry the address.`
          );
          setSaving(false);
          return;
        }
      }
    }

    setSaving(false);
    router.push('/dashboard/contacts');
    router.refresh();
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

  const sectionStyle: React.CSSProperties = { marginBottom: '2rem' };

  const sectionTitleStyle: React.CSSProperties = {
    fontSize: '1.1rem',
    fontWeight: 600,
    marginBottom: '1rem',
    paddingBottom: '0.5rem',
    borderBottom: '1px solid #e5e7eb',
  };

  const gridTwoCol: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '1rem',
  };

  return (
    <div style={{ maxWidth: '640px' }}>
      {/* Type & Status */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>Contact Type</div>
        <div style={gridTwoCol}>
          <div>
            <label style={labelStyle}>Type *</label>
            <select
              name="contact_type"
              value={form.contact_type}
              onChange={handleChange}
              style={inputStyle}
            >
              {CONTACT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Status</label>
            <select name="status" value={form.status} onChange={handleChange} style={inputStyle}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="archived">Archived</option>
            </select>
          </div>
        </div>
      </div>

      {/* Name & Company */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>Basic Information</div>
        <div style={{ ...gridTwoCol, marginBottom: '1rem' }}>
          <div>
            <label style={labelStyle}>First Name *</label>
            <input
              name="first_name"
              value={form.first_name}
              onChange={handleChange}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Last Name *</label>
            <input
              name="last_name"
              value={form.last_name}
              onChange={handleChange}
              style={inputStyle}
            />
          </div>
        </div>
        <div style={{ marginBottom: '1rem' }}>
          <label style={labelStyle}>Company Name</label>
          <input
            name="company_name"
            value={form.company_name}
            onChange={handleChange}
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>Source</label>
          <select name="source" value={form.source} onChange={handleChange} style={inputStyle}>
            <option value="">Select source...</option>
            {LEAD_SOURCES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Contact Info */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>Contact Information</div>
        <div style={{ marginBottom: '1rem' }}>
          <label style={labelStyle}>Email</label>
          <input
            name="email"
            type="email"
            value={form.email}
            onChange={handleChange}
            style={inputStyle}
          />
        </div>
        <div style={gridTwoCol}>
          <div>
            <label style={labelStyle}>Phone</label>
            <input
              name="phone"
              value={form.phone}
              onChange={handleChange}
              style={inputStyle}
              placeholder="(555) 123-4567"
            />
          </div>
          <div>
            <label style={labelStyle}>Mobile</label>
            <input
              name="mobile"
              value={form.mobile}
              onChange={handleChange}
              style={inputStyle}
              placeholder="(555) 987-6543"
            />
          </div>
        </div>
      </div>

      {/* Address */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>Address</div>
        <div style={{ marginBottom: '1rem' }}>
          <label style={labelStyle}>Label</label>
          <input
            name="label"
            value={form.label}
            onChange={handleChange}
            style={inputStyle}
            placeholder="e.g., Main Residence"
          />
        </div>
        <div style={{ marginBottom: '1rem' }}>
          <label style={labelStyle}>Address Line 1</label>
          <input
            name="address_line1"
            value={form.address_line1}
            onChange={handleChange}
            style={inputStyle}
          />
        </div>
        <div style={{ marginBottom: '1rem' }}>
          <label style={labelStyle}>Address Line 2</label>
          <input
            name="address_line2"
            value={form.address_line2}
            onChange={handleChange}
            style={inputStyle}
          />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '1rem' }}>
          <div>
            <label style={labelStyle}>City</label>
            <input name="city" value={form.city} onChange={handleChange} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>State</label>
            <select name="state" value={form.state} onChange={handleChange} style={inputStyle}>
              <option value="">--</option>
              {US_STATES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle}>ZIP</label>
            <input name="zip" value={form.zip} onChange={handleChange} style={inputStyle} />
          </div>
        </div>
      </div>

      {/* Notes */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>Notes</div>
        <textarea
          name="notes"
          value={form.notes}
          onChange={handleChange}
          rows={4}
          style={{ ...inputStyle, resize: 'vertical' }}
          placeholder="Any notes about this contact..."
        />
      </div>

      {/* Error */}
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

      {/* Buttons */}
      <div style={{ display: 'flex', gap: '0.75rem' }}>
        <button
          onClick={handleSubmit}
          disabled={saving}
          style={{
            padding: '0.625rem 1.5rem',
            fontSize: '0.875rem',
            fontWeight: 600,
            color: '#fff',
            backgroundColor: saving ? '#9ca3af' : '#2563eb',
            border: 'none',
            borderRadius: '0.375rem',
            cursor: saving ? 'not-allowed' : 'pointer',
          }}
        >
          {saving ? 'Saving...' : isEdit ? 'Update Contact' : 'Create Contact'}
        </button>
        <a
          href="/dashboard/contacts"
          style={{
            padding: '0.625rem 1.5rem',
            fontSize: '0.875rem',
            color: '#374151',
            backgroundColor: '#f3f4f6',
            border: '1px solid #d1d5db',
            borderRadius: '0.375rem',
            textDecoration: 'none',
          }}
        >
          Cancel
        </a>
      </div>
    </div>
  );
}
