'use client';

import { useState, useRef, useEffect } from 'react';
import {
  CompanyData,
  updateCompany,
  uploadCompanyLogo,
  uploadContractorSignature,
  clearContractorSignature,
  getContractorSignatureUrl,
} from '@/lib/services/company-client';

import { TRADE_TYPES, US_STATES } from '@framefocus/shared/constants';

interface SettingsFormProps {
  company: CompanyData;
}

export function SettingsForm({ company }: SettingsFormProps) {
  const [form, setForm] = useState({
    name: company.name || '',
    address_line1: company.address_line1 || '',
    address_line2: company.address_line2 || '',
    city: company.city || '',
    state: company.state || '',
    zip: company.zip || '',
    phone: company.phone || '',
    email: company.email || '',
    website: company.website || '',
    trade_type: company.trade_type || '',
    license_number: company.license_number || '',
  });

  const [logoUrl, setLogoUrl] = useState(company.logo_url || '');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Signed-artifact spec §4.2 — saved contractor signature image. The column is
  // new (this spec's migration), so it is read off CompanyData with a cast
  // until database.ts is regenerated.
  const [signaturePath, setSignaturePath] = useState<string | null>(
    (company as { contractor_signature_path?: string | null }).contractor_signature_path ?? null
  );
  const [signatureUrl, setSignatureUrl] = useState<string | null>(null);
  const [sigUploading, setSigUploading] = useState(false);
  const [typedName, setTypedName] = useState('');
  const sigInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    if (signaturePath) {
      getContractorSignatureUrl(signaturePath).then((url) => {
        if (active) setSignatureUrl(url);
      });
    } else {
      setSignatureUrl(null);
    }
    return () => {
      active = false;
    };
  }, [signaturePath]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSave() {
    setSaving(true);
    setMessage(null);

    const result = await updateCompany(company.id, {
      name: form.name.trim(),
      address_line1: form.address_line1.trim() || null,
      address_line2: form.address_line2.trim() || null,
      city: form.city.trim() || null,
      state: form.state || null,
      zip: form.zip.trim() || null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      website: form.website.trim() || null,
      trade_type: form.trade_type || null,
      license_number: form.license_number.trim() || null,
    });

    setSaving(false);

    if (result.success) {
      setMessage({ type: 'success', text: 'Settings saved successfully.' });
    } else {
      setMessage({ type: 'error', text: result.error || 'Failed to save settings.' });
    }
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // PNG/JPEG only [S97] — the company-logos bucket enforces the same
    // allowlist server-side, so accepting anything wider here only produces a
    // confusing storage error instead of a clear one. No SVG this pass.
    if (file.type !== 'image/png' && file.type !== 'image/jpeg') {
      setMessage({ type: 'error', text: 'Please select a PNG or JPEG image.' });
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setMessage({ type: 'error', text: 'Logo must be under 2 MB.' });
      return;
    }

    setUploading(true);
    setMessage(null);

    const result = await uploadCompanyLogo(company.id, file);

    setUploading(false);

    if (result.success && result.url) {
      setLogoUrl(result.url + '?t=' + Date.now());
      setMessage({ type: 'success', text: 'Logo uploaded successfully.' });
    } else {
      setMessage({ type: 'error', text: result.error || 'Failed to upload logo.' });
    }

    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handleSignatureUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setMessage({ type: 'error', text: 'Please select an image file (PNG or JPG).' });
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setMessage({ type: 'error', text: 'Signature image must be under 2 MB.' });
      return;
    }

    setSigUploading(true);
    setMessage(null);

    const result = await uploadContractorSignature(company.id, file);

    setSigUploading(false);

    if (result.success && result.path) {
      setSignaturePath(result.path);
      setMessage({ type: 'success', text: 'Signature uploaded successfully.' });
    } else {
      setMessage({ type: 'error', text: result.error || 'Failed to upload signature.' });
    }

    if (sigInputRef.current) sigInputRef.current.value = '';
  }

  async function handleSignatureClear() {
    setSigUploading(true);
    setMessage(null);

    const result = await clearContractorSignature(company.id);

    setSigUploading(false);

    if (result.success) {
      setSignaturePath(null);
      setSignatureUrl(null);
      setMessage({ type: 'success', text: 'Saved signature removed.' });
    } else {
      setMessage({ type: 'error', text: result.error || 'Failed to remove signature.' });
    }
  }

  // Typed-name signature (signed-artifact spec §4.2 alt): render the name to a
  // transparent PNG in a script font and save it through the SAME path as an
  // uploaded image (uploadContractorSignature). PNG-only by design.
  async function handleTypedSignatureSave() {
    const name = typedName.trim();
    if (!name) {
      setMessage({ type: 'error', text: 'Enter a name to render as your signature.' });
      return;
    }

    setSigUploading(true);
    setMessage(null);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 600;
      canvas.height = 200;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        setMessage({ type: 'error', text: 'Could not render the signature.' });
        return;
      }
      // Transparent background (no fillRect); black script text, shrunk to fit.
      ctx.fillStyle = '#111827';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      let fontSize = 72;
      const scriptStack = "'Segoe Script', 'Brush Script MT', cursive";
      ctx.font = `${fontSize}px ${scriptStack}`;
      while (ctx.measureText(name).width > canvas.width - 40 && fontSize > 24) {
        fontSize -= 4;
        ctx.font = `${fontSize}px ${scriptStack}`;
      }
      ctx.fillText(name, canvas.width / 2, canvas.height / 2);

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), 'image/png')
      );
      if (!blob) {
        setMessage({ type: 'error', text: 'Could not render the signature image.' });
        return;
      }

      const file = new File([blob], 'signature.png', { type: 'image/png' });
      const result = await uploadContractorSignature(company.id, file);
      if (result.success && result.path) {
        setSignaturePath(result.path);
        setTypedName('');
        setMessage({ type: 'success', text: 'Signature saved.' });
      } else {
        setMessage({ type: 'error', text: result.error || 'Failed to save signature.' });
      }
    } finally {
      setSigUploading(false);
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

  const sectionStyle: React.CSSProperties = {
    marginBottom: '2rem',
  };

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
      {/* Logo section */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>Company Logo</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          <div
            style={{
              width: '80px',
              height: '80px',
              borderRadius: '0.5rem',
              border: '2px dashed #d1d5db',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              backgroundColor: '#f9fafb',
              flexShrink: 0,
            }}
          >
            {logoUrl ? (
              <img
                src={logoUrl}
                alt="Company logo"
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              />
            ) : (
              <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>No logo</span>
            )}
          </div>
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg"
              onChange={handleLogoUpload}
              style={{ display: 'none' }}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              style={{
                padding: '0.5rem 1rem',
                fontSize: '0.875rem',
                backgroundColor: '#f3f4f6',
                border: '1px solid #d1d5db',
                borderRadius: '0.375rem',
                cursor: uploading ? 'not-allowed' : 'pointer',
              }}
            >
              {uploading ? 'Uploading...' : 'Upload Logo'}
            </button>
            <p style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.25rem' }}>
              PNG or JPG, max 2 MB. Prints on your invoice, change-order and estimate PDFs.
            </p>
          </div>
        </div>
      </div>

      {/* Contractor signature (signed-artifact spec §4.2) */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>Contractor Signature</div>
        <p style={{ fontSize: '0.8125rem', color: '#6b7280', marginBottom: '0.75rem' }}>
          A saved signature image applied to change orders you send. You can also choose to type a
          printed name at send time instead of using this image.
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          <div
            style={{
              width: '160px',
              height: '64px',
              borderRadius: '0.5rem',
              border: '2px dashed #d1d5db',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              backgroundColor: '#f9fafb',
              flexShrink: 0,
            }}
          >
            {signatureUrl ? (
              <img
                src={signatureUrl}
                alt="Contractor signature"
                style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
              />
            ) : (
              <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
                {signaturePath ? 'Signature on file' : 'No signature'}
              </span>
            )}
          </div>
          <div>
            <input
              ref={sigInputRef}
              type="file"
              accept="image/*"
              onChange={handleSignatureUpload}
              style={{ display: 'none' }}
            />
            <button
              onClick={() => sigInputRef.current?.click()}
              disabled={sigUploading}
              style={{
                padding: '0.5rem 1rem',
                fontSize: '0.875rem',
                backgroundColor: '#f3f4f6',
                border: '1px solid #d1d5db',
                borderRadius: '0.375rem',
                cursor: sigUploading ? 'not-allowed' : 'pointer',
              }}
            >
              {sigUploading ? 'Working...' : signaturePath ? 'Replace' : 'Upload Signature'}
            </button>
            {signaturePath && (
              <button
                onClick={handleSignatureClear}
                disabled={sigUploading}
                style={{
                  marginLeft: '0.5rem',
                  padding: '0.5rem 1rem',
                  fontSize: '0.875rem',
                  backgroundColor: '#ffffff',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.375rem',
                  color: '#b91c1c',
                  cursor: sigUploading ? 'not-allowed' : 'pointer',
                }}
              >
                Remove
              </button>
            )}
            <p style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.25rem' }}>
              PNG or JPG, max 2 MB. Transparent PNG recommended.
            </p>
          </div>
        </div>

        <div style={{ marginTop: '1rem' }}>
          <label style={{ ...labelStyle, marginBottom: '0.375rem' }}>Or type your name</label>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <input
              value={typedName}
              onChange={(e) => setTypedName(e.target.value)}
              placeholder="Full name as it should appear"
              style={{ ...inputStyle, maxWidth: '320px' }}
            />
            <button
              onClick={handleTypedSignatureSave}
              disabled={sigUploading || !typedName.trim()}
              style={{
                padding: '0.5rem 1rem',
                fontSize: '0.875rem',
                whiteSpace: 'nowrap',
                backgroundColor: '#f3f4f6',
                border: '1px solid #d1d5db',
                borderRadius: '0.375rem',
                cursor: sigUploading || !typedName.trim() ? 'not-allowed' : 'pointer',
              }}
            >
              {sigUploading ? 'Working...' : 'Save typed signature'}
            </button>
          </div>
          <p style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.25rem' }}>
            Rendered in a script font as a transparent PNG and saved as your signature image.
          </p>
        </div>
      </div>

      {/* Company info */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>Company Information</div>
        <div style={{ marginBottom: '1rem' }}>
          <label style={labelStyle}>Company Name *</label>
          <input
            name="name"
            value={form.name}
            onChange={handleChange}
            style={inputStyle}
            required
          />
        </div>
        <div style={gridTwoCol}>
          <div>
            <label style={labelStyle}>Trade Type</label>
            <select
              name="trade_type"
              value={form.trade_type}
              onChange={handleChange}
              style={inputStyle}
            >
              <option value="">Select a trade...</option>
              {TRADE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle}>License Number</label>
            <input
              name="license_number"
              value={form.license_number}
              onChange={handleChange}
              style={inputStyle}
              placeholder="e.g. CGC1234567"
            />
          </div>
        </div>
      </div>

      {/* Contact info */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>Contact Information</div>
        <div style={{ marginBottom: '1rem' }}>
          {/* [S97] The company email. Two shipped behaviors already read this
              column and it had no control anywhere, so it was always empty —
              which is why client replies were landing in the owner's personal
              inbox instead of the company's. */}
          <label style={labelStyle}>Company Email</label>
          <input
            name="email"
            type="email"
            value={form.email}
            onChange={handleChange}
            style={inputStyle}
            placeholder="office@yourcompany.com"
          />
          <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
            Where clients reach you. Replies to estimates, change orders and invoices you send go
            here, and it prints on your PDF letterhead. Leave it blank and replies fall back to the
            owner&rsquo;s personal address.
          </p>
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
            <label style={labelStyle}>Website</label>
            <input
              name="website"
              value={form.website}
              onChange={handleChange}
              style={inputStyle}
              placeholder="https://yourcompany.com"
            />
          </div>
        </div>
      </div>

      {/* Address */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>Business Address</div>
        <div style={{ marginBottom: '1rem' }}>
          <label style={labelStyle}>Address Line 1</label>
          <input
            name="address_line1"
            value={form.address_line1}
            onChange={handleChange}
            style={inputStyle}
            placeholder="123 Main Street"
          />
        </div>
        <div style={{ marginBottom: '1rem' }}>
          <label style={labelStyle}>Address Line 2</label>
          <input
            name="address_line2"
            value={form.address_line2}
            onChange={handleChange}
            style={inputStyle}
            placeholder="Suite 200"
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
            <input
              name="zip"
              value={form.zip}
              onChange={handleChange}
              style={inputStyle}
              placeholder="33426"
            />
          </div>
        </div>
      </div>

      {/* Status message */}
      {message && (
        <div
          style={{
            padding: '0.75rem 1rem',
            borderRadius: '0.375rem',
            marginBottom: '1rem',
            backgroundColor: message.type === 'success' ? '#f0fdf4' : '#fef2f2',
            color: message.type === 'success' ? '#166534' : '#991b1b',
            fontSize: '0.875rem',
          }}
        >
          {message.text}
        </div>
      )}

      {/* Save button */}
      <button
        onClick={handleSave}
        disabled={saving || !form.name.trim()}
        style={{
          padding: '0.625rem 1.5rem',
          fontSize: '0.875rem',
          fontWeight: 600,
          color: '#fff',
          backgroundColor: saving || !form.name.trim() ? '#9ca3af' : '#2563eb',
          border: 'none',
          borderRadius: '0.375rem',
          cursor: saving || !form.name.trim() ? 'not-allowed' : 'pointer',
        }}
      >
        {saving ? 'Saving...' : 'Save Settings'}
      </button>
    </div>
  );
}
