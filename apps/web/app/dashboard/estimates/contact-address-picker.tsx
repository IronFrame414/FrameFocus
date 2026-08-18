'use client';

import { useEffect, useMemo, useState } from 'react';
import { ContactOption, listContactOptions } from '@/lib/services/contacts-client';
import {
  ContactAddressOption,
  listAddressesForContact,
} from '@/lib/services/contact-addresses-client';

// Contact typeahead + address picker (filtered by contact), shared
// by /dashboard/estimates/new, the clone modal, and the Details tab.

export function contactLabel(c: ContactOption): string {
  const name = `${c.first_name} ${c.last_name}`.trim();
  return c.company_name ? `${name} (${c.company_name})` : name;
}

export function addressLabel(a: ContactAddressOption): string {
  const line = [a.address_line1, a.city, a.state].filter(Boolean).join(', ');
  return a.label ? `${a.label} — ${line}` : line;
}

interface ContactAddressPickerProps {
  contactId: string | null;
  addressId: string | null;
  onChange: (contactId: string | null, addressId: string | null) => void;
  disabled?: boolean;
}

export function ContactAddressPicker({
  contactId,
  addressId,
  onChange,
  disabled,
}: ContactAddressPickerProps) {
  const [contacts, setContacts] = useState<ContactOption[]>([]);
  const [addresses, setAddresses] = useState<ContactAddressOption[]>([]);
  const [search, setSearch] = useState('');
  const [showResults, setShowResults] = useState(false);
  // M2-07 [S154] — a failed lookup used to render as "no contacts" / "no
  // addresses", which is indistinguishable from the truth. This picker chooses
  // the `contact_address_id` a proposal and a lien release later print, so an
  // empty list that is really a failure is how a document ends up with no
  // job-site address on it.
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    listContactOptions().then(({ options, error }) => {
      setContacts(options);
      setLoadError(error);
    });
  }, []);

  useEffect(() => {
    if (!contactId) {
      setAddresses([]);
      return;
    }
    listAddressesForContact(contactId).then(({ addresses: rows, error }) => {
      setAddresses(rows);
      setLoadError(error);
    });
  }, [contactId]);

  const selectedContact = contacts.find((c) => c.id === contactId) ?? null;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter((c) =>
      `${c.first_name} ${c.last_name} ${c.company_name ?? ''}`.toLowerCase().includes(q)
    );
  }, [contacts, search]);

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
    <div>
      {/* M2-07 [S154] — say that the lookup failed, rather than showing an
          empty list that looks like an answer. */}
      {loadError && (
        <div
          role="alert"
          style={{
            marginBottom: '0.75rem',
            padding: '0.5rem 0.75rem',
            border: '1px solid #fecaca',
            background: '#fef2f2',
            color: '#991b1b',
            borderRadius: '0.375rem',
            fontSize: '0.8125rem',
          }}
        >
          Contacts could not be loaded, so this list may be incomplete. Reload the page before
          choosing a client and job-site address.
        </div>
      )}
      <div style={{ marginBottom: '1rem', position: 'relative' }}>
        <label style={labelStyle}>Client *</label>
        {selectedContact ? (
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <div style={{ ...inputStyle, backgroundColor: '#f9fafb' }}>
              {contactLabel(selectedContact)}
            </div>
            {!disabled && (
              <button
                type="button"
                onClick={() => {
                  onChange(null, null);
                  setSearch('');
                }}
                style={{
                  padding: '0.5rem 0.75rem',
                  fontSize: '0.875rem',
                  backgroundColor: '#f3f4f6',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.375rem',
                  cursor: 'pointer',
                }}
              >
                Change
              </button>
            )}
          </div>
        ) : (
          <>
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setShowResults(true);
              }}
              onFocus={() => setShowResults(true)}
              onBlur={() => setTimeout(() => setShowResults(false), 200)}
              placeholder="Search contacts…"
              style={inputStyle}
              disabled={disabled}
            />
            {showResults && (
              <div
                style={{
                  position: 'absolute',
                  zIndex: 10,
                  left: 0,
                  right: 0,
                  maxHeight: '200px',
                  overflowY: 'auto',
                  backgroundColor: '#fff',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.375rem',
                  marginTop: '0.25rem',
                  boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                }}
              >
                {filtered.length === 0 && (
                  <div style={{ padding: '0.5rem 0.75rem', color: '#9ca3af', fontSize: '0.875rem' }}>
                    No contacts found
                  </div>
                )}
                {filtered.map((c) => (
                  <div
                    key={c.id}
                    onMouseDown={() => {
                      onChange(c.id, null);
                      setShowResults(false);
                    }}
                    style={{
                      padding: '0.5rem 0.75rem',
                      fontSize: '0.875rem',
                      cursor: 'pointer',
                      borderBottom: '1px solid #f3f4f6',
                    }}
                  >
                    {contactLabel(c)}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <div style={{ marginBottom: '1rem' }}>
        <label style={labelStyle}>Job-site address *</label>
        <select
          value={addressId ?? ''}
          onChange={(e) => onChange(contactId, e.target.value || null)}
          style={inputStyle}
          disabled={disabled || !contactId}
        >
          <option value="">
            {contactId
              ? addresses.length > 0
                ? 'Select an address…'
                : 'No addresses on file for this contact'
              : 'Pick a client first'}
          </option>
          {addresses.map((a) => (
            <option key={a.id} value={a.id}>
              {addressLabel(a)}
            </option>
          ))}
        </select>
        {contactId && addresses.length === 0 && (
          <p style={{ fontSize: '0.75rem', color: '#92400e', marginTop: '0.25rem' }}>
            Add an address to this contact on the Contacts page first.
          </p>
        )}
      </div>
    </div>
  );
}
