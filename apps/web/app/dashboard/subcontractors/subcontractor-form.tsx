'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSubcontractor, updateSubcontractor } from '@/lib/services/subcontractors-client';
import { Subcontractor } from '@/lib/services/subcontractors';

const TRADE_TYPES = [
  'General Contractor',
  'Electrical',
  'Plumbing',
  'HVAC',
  'Roofing',
  'Painting',
  'Concrete / Masonry',
  'Framing / Carpentry',
  'Flooring',
  'Landscaping',
  'Glazing / Aluminum',
  'Fire Protection',
  'Insulation',
  'Drywall',
  'Demolition',
  'Excavation / Site Work',
  'Steel / Structural',
  'Waterproofing',
  'Other',
];

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA',
  'HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC',
];

interface SubcontractorFormProps {
  existing?: Subcontractor;
}

export function SubcontractorForm({ existing }: SubcontractorFormProps) {
  const router = useRouter();
  const isEdit = !!existing;

  const [form, setForm] = useState({
    sub_type: existing?.sub_type || 'subcontractor',
    status: existing?.status || 'active',
    company_name: existing?.company_name || '',
    contact_first_name: existing?.contact_first_name || '',
    contact_last_name: existing?.contact_last_name || '',
    email: existing?.email || '',
    phone: existing?.phone || '',
    mobile: existing?.mobile || '',
    address_line1: existing?.address_line1 || '',
    address_line2: existing?.address_line2 || '',
    city: existing?.city || '',
    state: existing?.state || '',
    zip: existing?.zip || '',
    trade_type: existing?.trade_type || '',
    license_number: existing?.license_number || '',
    insurance_expiry: existing?.insurance_expiry || '',
    rating: existing?.rating ?? 0,
    rating_notes: existing?.rating_notes || '',
    notes: existing?.notes || '',
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    const { name, value } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: name === 'rating' ? parseInt(value) || 0 : value,
    }));
  }

  async function handleSubmit() {
    if (!form.company_name.trim()) {
      setError('Company name is required.');
      return;
    }

    setSaving(true);
    setError('');

    const payload = {
      sub_type: form.sub_type,
      status: form.status,
      company_name: form.company_name.trim(),
      contact_first_name: form.contact_first_name.trim() || null,
      contact_last_name: form.contact_last_name.trim() || null,
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      mobile: form.mobile.trim() || null,
      address_line1: form.address_line1.trim() || null,
      address_line2: form.address_line2.trim() || null,
      city: form.city.trim() || null,
      state: form.state || null,
      zip: form.zip.trim() || null,
      trade_type: form.trade_type || null,
      license_number: form.license_number.trim() || null,
      insurance_expiry: form.insurance_expiry || null,
      rating: form.rating > 0 ? form.rating : null,
      rating_notes: form.rating_notes.trim() || null,
      notes: form.notes.trim() || null,
    };

    let result;
    if (isEdit && existing) {
      result = await updateSubcontractor(existing.id, payload);
    } else {
      result = await createSubcontractor(payload);
    }

    setSaving(false);

    if (result.success) {
      router.push('/dashboard/subcontractors');
      router.refresh();
    } else {
      setError(result.error || 'Failed to save.');
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
        <div style={sectionTitleStyle}>Type</div>
        <div style={gridTwoCol}>
          <div>
            <label style={labelStyle}>Type *</label>
            <select name="sub_type" value={form.sub_type} onChange={handleChange} style={inputStyle}>
              <option value="subcontractor">Subcontractor</option>
              <option value="vendor">Vendor</option>
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

      {/* Company & Contact */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>Company Information</div>
        <div style={{ marginBottom: '1rem' }}>
          <label style={labelStyle}>Company Name *</label>
          <input name="company_name" value={form.company_name} onChange={handleChange} style={inputStyle} />
        </div>
        <div style={gridTwoCol}>
          <div>
            <label style={labelStyle}>Contact First Name</label>
            <input name="contact_first_name" value={form.contact_first_name} onChange={handleChange} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Contact Last Name</label>
            <input name="contact_last_name" value={form.contact_last_name} onChange={handleChange} style={inputStyle} />
          </div>
        </div>
      </div>

      {/* Trade & License */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>Trade Details</div>
        <div style={{ ...gridTwoCol, marginBottom: '1rem' }}>
          <div>
            <label style={labelStyle}>Trade Type</label>
            <select name="trade_type" value={form.trade_type} onChange={handleChange} style={inputStyle}>
              <option value="">Select a trade...</option>
              {TRADE_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle}>License Number</label>
            <input name="license_number" value={form.license_number} onChange={handleChange} style={inputStyle} />
          </div>
        </div>
        <div>
          <label style={labelStyle}>Insurance Expiry Date</label>
          <input name="insurance_expiry" type="date" value={form.insurance_expiry} onChange={handleChange} style={inputStyle} />
        </div>
      </div>

      {/* Rating */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>Rating</div>
        <div style={{ marginBottom: '1rem' }}>
          <label style={labelStyle}>Rating (1–5 stars)</label>
          <div style={{ display: 'flex', gap: '0.25rem', marginTop: '0.25rem' }}>
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                onClick={() => setForm((prev) => ({ ...prev, rating: prev.rating === star ? 0 : star }))}
                style={{
                  fontSize: '1.5rem',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: star <= form.rating ? '#f59e0b' : '#d1d5db',
                  padding: '0 0.125rem',
                }}
              >
                ★
              </button>
            ))}
            {form.rating > 0 && (
              <span style={{ fontSize: '0.875rem', color: '#6b7280', marginLeft: '0.5rem', alignSelf: 'center' }}>
                {form.rating}/5
              </span>
            )}
          </div>
        </div>
        <div>
          <label style={labelStyle}>Rating Notes</label>
          <textarea
            name="rating_notes"
            value={form.rating_notes}
            onChange={handleChange}
            rows={2}
            style={{ ...inputStyle, resize: 'vertical' }}
            placeholder="Quality, reliability, pricing notes..."
          />
        </div>
      </div>

      {/* Contact Info */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>Contact Information</div>
        <div style={{ marginBottom: '1rem' }}>
          <label style={labelStyle}>Email</label>
          <input name="email" type="email" value={form.email} onChange={handleChange} style={inputStyle} />
        </div>
        <div style={gridTwoCol}>
          <div>
            <label style={labelStyle}>Phone</label>
            <input name="phone" value={form.phone} onChange={handleChange} style={inputStyle} placeholder="(555) 123-4567" />
          </div>
          <div>
            <label style={labelStyle}>Mobile</label>
            <input name="mobile" value={form.mobile} onChange={handleChange} style={inputStyle} />
          </div>
        </div>
      </div>

      {/* Address */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>Address</div>
        <div style={{ marginBottom: '1rem' }}>
          <label style={labelStyle}>Address Line 1</label>
          <input name="address_line1" value={form.address_line1} onChange={handleChange} style={inputStyle} />
        </div>
        <div style={{ marginBottom: '1rem' }}>
          <label style={labelStyle}>Address Line 2</label>
          <input name="address_line2" value={form.address_line2} onChange={handleChange} style={inputStyle} />
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
                <option key={s} value={s}>{s}</option>
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
          placeholder="Any notes about this sub or vendor..."
        />
      </div>

      {/* Error */}
      {error && (
        <div style={{
          padding: '0.75rem 1rem',
          borderRadius: '0.375rem',
          marginBottom: '1rem',
          backgroundColor: '#fef2f2',
          color: '#991b1b',
          fontSize: '0.875rem',
        }}>
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
          {saving ? 'Saving...' : isEdit ? 'Update' : 'Create'}
        </button>
        
          <a
            href="/dashboard/subcontractors"
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
