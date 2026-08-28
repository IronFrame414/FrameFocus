'use client';

// Step 8 (desktop redesign §8.11.1) — the Company tab.
//
// RULED [Josh]: everything autosaves. This form moves to the same 1s-debounce
// per-field pattern as estimating/proposals/time-tracking. ⚠️ The one real
// obstacle the ruling names: this tab bundles identity fields with TWO
// independent async file uploads (logo, signature). THE UPLOADS STAY THEIR OWN
// EXPLICIT ACTIONS — autosave surrounds them, never drives them. A debounced
// writer racing an in-flight upload is the failure the split prevents.
//
// The company `name` is required: an empty name blocks that field's save (the
// field errors in place) and never reaches updateCompany.
//
// `contractor_signature_path` is the COMPANY image. The per-CO
// `contractor_signature_mode/name/ref` triple lives on change_orders, written
// by the send route at send time — nothing here touches it (Entry 25).

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
import { color, cardStyle } from '@/lib/theme';

interface SettingsFormProps {
  company: CompanyData;
}

type TextField =
  | 'name'
  | 'address_line1'
  | 'address_line2'
  | 'city'
  | 'state'
  | 'zip'
  | 'phone'
  | 'email'
  | 'website'
  | 'trade_type'
  | 'license_number';

const SAVE_DEBOUNCE_MS = 1000;

export function SettingsForm({ company }: SettingsFormProps) {
  const [form, setForm] = useState<Record<TextField, string>>({
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
  const [uploading, setUploading] = useState(false);
  // Upload feedback only — field saves report per field, uploads report here.
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [errors, setErrors] = useState<Partial<Record<TextField, string>>>({});
  const [savedField, setSavedField] = useState<TextField | null>(null);
  const timersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Signed-artifact spec §4.2 — saved contractor signature image.
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

  function setFieldError(field: TextField, msg: string | null) {
    setErrors((prev) => {
      const next = { ...prev };
      if (msg) next[field] = msg;
      else delete next[field];
      return next;
    });
  }

  function showSaved(field: TextField) {
    setSavedField(field);
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    savedTimerRef.current = setTimeout(() => setSavedField(null), 2000);
  }

  // Per-field autosave, mirroring estimating-settings-form. Writes ONE column
  // per save so a failing field never blocks its neighbours.
  function scheduleSave(field: TextField, value: string | null) {
    if (timersRef.current[field]) clearTimeout(timersRef.current[field]);
    timersRef.current[field] = setTimeout(async () => {
      const result = await updateCompany(company.id, { [field]: value });
      if (result.success) {
        showSaved(field);
      } else {
        setFieldError(field, result.error || 'Save failed — try again.');
      }
    }, SAVE_DEBOUNCE_MS);
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  function handleBlur(field: TextField) {
    const trimmed = form[field].trim();
    if (trimmed !== form[field]) setForm((prev) => ({ ...prev, [field]: trimmed }));
    if (field === 'name') {
      if (!trimmed) {
        setFieldError('name', 'Company name is required.');
        return;
      }
      setFieldError('name', null);
      scheduleSave('name', trimmed);
      return;
    }
    setFieldError(field, null);
    scheduleSave(field, trimmed || null);
  }

  // Selects save on change — there is no blur moment worth waiting for.
  function handleSelect(field: TextField, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setFieldError(field, null);
    scheduleSave(field, value || null);
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
    border: `1px solid ${color.inputBorder}`,
    borderRadius: '8px',
    fontSize: '0.875rem',
    minHeight: '42px',
    color: color.navy,
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '12.5px',
    fontWeight: 600,
    marginBottom: '0.25rem',
    color: color.body,
  };

  const cardSectionStyle: React.CSSProperties = {
    ...cardStyle,
    padding: '18px 20px',
  };

  const sectionTitleStyle: React.CSSProperties = {
    fontSize: '15.5px',
    fontWeight: 700,
    marginBottom: '1rem',
    color: color.navy,
  };

  const gridTwoCol: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)',
    gap: '1rem',
  };

  const secondaryButtonStyle: React.CSSProperties = {
    padding: '0.5rem 1rem',
    fontSize: '0.875rem',
    fontWeight: 600,
    backgroundColor: '#fff',
    color: color.body,
    border: `1px solid ${color.inputBorder}`,
    borderRadius: '8px',
  };

  const errorStyle: React.CSSProperties = {
    color: color.danger,
    fontSize: '0.75rem',
    marginTop: '0.25rem',
  };
  const savedStyle: React.CSSProperties = {
    color: color.success,
    fontSize: '0.75rem',
    marginTop: '0.25rem',
  };

  function fieldFeedback(field: TextField) {
    if (errors[field]) return <div style={errorStyle}>{errors[field]}</div>;
    if (savedField === field) return <div style={savedStyle}>Saved</div>;
    return null;
  }

  return (
    <div style={{ maxWidth: '860px', display: 'grid', gap: '1rem' }}>
      <p style={{ color: color.muted, fontSize: '0.8125rem', margin: 0 }}>
        Changes save automatically. Logo and signature upload when you choose a file.
      </p>

      {/* Upload feedback (uploads are explicit actions with a shared status line) */}
      {message && (
        <div
          style={{
            padding: '0.75rem 1rem',
            borderRadius: '8px',
            backgroundColor: message.type === 'success' ? color.successBg : '#fdf1f0',
            color: message.type === 'success' ? color.success : color.danger,
            fontSize: '0.875rem',
          }}
        >
          {message.text}
        </div>
      )}

      {/* Logo + Signature side by side (mockup 8a) */}
      <div style={gridTwoCol}>
        <div style={cardSectionStyle}>
          <div style={sectionTitleStyle}>Company Logo</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
            <div
              style={{
                width: '80px',
                height: '80px',
                borderRadius: '8px',
                border: `2px dashed ${color.inputBorder}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                backgroundColor: color.tableHeadBg,
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
                <span style={{ fontSize: '0.75rem', color: color.faint }}>No logo</span>
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
                  ...secondaryButtonStyle,
                  cursor: uploading ? 'not-allowed' : 'pointer',
                }}
              >
                {uploading ? 'Uploading...' : 'Upload Logo'}
              </button>
              <p style={{ fontSize: '0.75rem', color: color.faint, marginTop: '0.25rem' }}>
                PNG or JPG, max 2 MB. Prints on your invoice, change-order and estimate PDFs.
              </p>
            </div>
          </div>
        </div>

        {/* Contractor signature (signed-artifact spec §4.2) */}
        <div style={cardSectionStyle}>
          <div style={sectionTitleStyle}>Contractor Signature</div>
          <p style={{ fontSize: '0.8125rem', color: color.muted, marginBottom: '0.75rem' }}>
            Applied to change orders and lien releases you send. You can also type a printed name
            at send time instead of using this image.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
            <div
              style={{
                width: '160px',
                height: '64px',
                borderRadius: '8px',
                border: `2px dashed ${color.inputBorder}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                backgroundColor: color.tableHeadBg,
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
                <span style={{ fontSize: '0.75rem', color: color.faint }}>
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
                  ...secondaryButtonStyle,
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
                    ...secondaryButtonStyle,
                    marginLeft: '0.5rem',
                    color: color.danger,
                    cursor: sigUploading ? 'not-allowed' : 'pointer',
                  }}
                >
                  Remove
                </button>
              )}
              <p style={{ fontSize: '0.75rem', color: color.faint, marginTop: '0.25rem' }}>
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
                  ...secondaryButtonStyle,
                  whiteSpace: 'nowrap',
                  cursor: sigUploading || !typedName.trim() ? 'not-allowed' : 'pointer',
                }}
              >
                {sigUploading ? 'Working...' : 'Save typed signature'}
              </button>
            </div>
            <p style={{ fontSize: '0.75rem', color: color.faint, marginTop: '0.25rem' }}>
              Rendered in a script font as a transparent PNG and saved as your signature image.
            </p>
          </div>
        </div>
      </div>

      {/* Company info */}
      <div style={cardSectionStyle}>
        <div style={sectionTitleStyle}>Company Information</div>
        <div style={{ marginBottom: '1rem' }}>
          <label style={labelStyle}>Company Name *</label>
          <input
            name="name"
            value={form.name}
            onChange={handleChange}
            onBlur={() => handleBlur('name')}
            style={inputStyle}
            required
          />
          {fieldFeedback('name')}
        </div>
        <div style={gridTwoCol}>
          <div>
            <label style={labelStyle}>Trade Type</label>
            <select
              name="trade_type"
              value={form.trade_type}
              onChange={(e) => handleSelect('trade_type', e.target.value)}
              style={inputStyle}
            >
              <option value="">Select a trade...</option>
              {TRADE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            {fieldFeedback('trade_type')}
          </div>
          <div>
            <label style={labelStyle}>License Number</label>
            <input
              name="license_number"
              value={form.license_number}
              onChange={handleChange}
              onBlur={() => handleBlur('license_number')}
              style={inputStyle}
              placeholder="e.g. CGC1234567"
            />
            {fieldFeedback('license_number')}
          </div>
        </div>
      </div>

      {/* Contact + Address side by side (mockup 8a) */}
      <div style={gridTwoCol}>
        <div style={cardSectionStyle}>
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
              onBlur={() => handleBlur('email')}
              style={inputStyle}
              placeholder="office@yourcompany.com"
            />
            {fieldFeedback('email')}
            <p style={{ fontSize: '0.75rem', color: color.muted, marginTop: '0.25rem' }}>
              Where clients reach you. Replies to estimates, change orders and invoices you send go
              here, and it prints on your PDF letterhead. Leave it blank and replies fall back to
              the owner&rsquo;s personal address.
            </p>
          </div>
          <div style={{ marginBottom: '1rem' }}>
            <label style={labelStyle}>Phone</label>
            <input
              name="phone"
              value={form.phone}
              onChange={handleChange}
              onBlur={() => handleBlur('phone')}
              style={inputStyle}
              placeholder="(555) 123-4567"
            />
            {fieldFeedback('phone')}
          </div>
          <div>
            <label style={labelStyle}>Website</label>
            <input
              name="website"
              value={form.website}
              onChange={handleChange}
              onBlur={() => handleBlur('website')}
              style={inputStyle}
              placeholder="https://yourcompany.com"
            />
            {fieldFeedback('website')}
          </div>
        </div>

        <div style={cardSectionStyle}>
          <div style={sectionTitleStyle}>Business Address</div>
          <div style={{ marginBottom: '1rem' }}>
            <label style={labelStyle}>Address Line 1</label>
            <input
              name="address_line1"
              value={form.address_line1}
              onChange={handleChange}
              onBlur={() => handleBlur('address_line1')}
              style={inputStyle}
              placeholder="123 Main Street"
            />
            {fieldFeedback('address_line1')}
          </div>
          <div style={{ marginBottom: '1rem' }}>
            <label style={labelStyle}>Address Line 2</label>
            <input
              name="address_line2"
              value={form.address_line2}
              onChange={handleChange}
              onBlur={() => handleBlur('address_line2')}
              style={inputStyle}
              placeholder="Suite 200"
            />
            {fieldFeedback('address_line2')}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '1rem' }}>
            <div>
              <label style={labelStyle}>City</label>
              <input
                name="city"
                value={form.city}
                onChange={handleChange}
                onBlur={() => handleBlur('city')}
                style={inputStyle}
              />
              {fieldFeedback('city')}
            </div>
            <div>
              <label style={labelStyle}>State</label>
              <select
                name="state"
                value={form.state}
                onChange={(e) => handleSelect('state', e.target.value)}
                style={inputStyle}
              >
                <option value="">--</option>
                {US_STATES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              {fieldFeedback('state')}
            </div>
            <div>
              <label style={labelStyle}>ZIP</label>
              <input
                name="zip"
                value={form.zip}
                onChange={handleChange}
                onBlur={() => handleBlur('zip')}
                style={inputStyle}
                placeholder="33426"
              />
              {fieldFeedback('zip')}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
