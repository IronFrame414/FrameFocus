'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSiteVisit } from '@/lib/services/site-visits-client';
import type { ContactOption } from '@/lib/services/site-visits';
import {
  ErrorNotice,
  FieldLabel,
  OfflineNotice,
  OptionStack,
  PrimaryButton,
  TextField,
  useOnline,
} from '../../write-ui';

// S108 Spec A — the create form. Online-only: the visit needs its id before
// photos and voice can attach (those two are then held offline if signal
// drops). Everything is validated again in create_site_visit().

type ContactMode = 'existing' | 'new';
type AddressMode = 'existing' | 'new' | 'none';

const selectClass =
  'h-[48px] w-full rounded-[12px] border border-m6m-border bg-m6m-card px-[12px] text-[15px] text-m6m-navy';

export function NewSiteVisitForm({ contacts }: { contacts: ContactOption[] }) {
  const router = useRouter();
  const online = useOnline();
  const [title, setTitle] = useState('');
  const [contactMode, setContactMode] = useState<ContactMode>(contacts.length > 0 ? 'existing' : 'new');
  const [contactId, setContactId] = useState('');
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [addressMode, setAddressMode] = useState<AddressMode>('new');
  const [addressId, setAddressId] = useState('');
  const [line1, setLine1] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zip, setZip] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chosen = contacts.find((c) => c.id === contactId) ?? null;
  const addressOptions = contactMode === 'existing' ? chosen?.addresses ?? [] : [];

  const contactOk =
    contactMode === 'existing' ? !!contactId : first.trim() !== '' && last.trim() !== '';
  const addressOk =
    addressMode === 'none' ||
    (addressMode === 'existing' ? !!addressId : [line1, city, state, zip].every((v) => v.trim() !== ''));
  const ready = title.trim() !== '' && contactOk && addressOk;

  async function submit() {
    setBusy(true);
    setError(null);
    const r = await createSiteVisit({
      title,
      contact_id: contactMode === 'existing' ? contactId : null,
      new_contact: contactMode === 'new' ? { first_name: first, last_name: last, phone, email } : null,
      contact_address_id: addressMode === 'existing' ? addressId : null,
      new_address:
        addressMode === 'new' ? { address_line1: line1, city, state, zip } : null,
    });
    setBusy(false);
    if (!r.success || !r.id) {
      setError(r.error ?? 'Could not record the visit.');
      return;
    }
    router.replace(`/m/site-visits/${r.id}`);
  }

  return (
    <div data-testid="m-site-visit-form">
      {!online ? <OfflineNotice what="Starting a site visit" testId="m-sv-offline" /> : null}
      {error ? <ErrorNotice message={error} testId="m-sv-error" /> : null}

      <TextField label="Visit name" value={title} onChange={setTitle} testId="m-sv-title" placeholder="e.g. Smith kitchen" required />

      <div className="mt-[14px]">
        <FieldLabel required>Contact</FieldLabel>
        <OptionStack
          options={[
            { value: 'existing' as const, label: 'Existing contact' },
            { value: 'new' as const, label: 'New contact' },
          ]}
          value={contactMode}
          onChange={(v) => {
            setContactMode(v);
            setAddressMode(v === 'existing' ? 'existing' : 'new');
            setAddressId('');
          }}
          testIdPrefix="m-sv-contact-mode"
        />
      </div>

      {contactMode === 'existing' ? (
        <div className="mt-[10px]">
          <select
            data-testid="m-sv-contact"
            value={contactId}
            onChange={(e) => {
              setContactId(e.target.value);
              setAddressId('');
            }}
            className={selectClass}
          >
            <option value="">Choose a contact…</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <>
          <TextField label="First name" value={first} onChange={setFirst} testId="m-sv-first" required />
          <TextField label="Last name" value={last} onChange={setLast} testId="m-sv-last" required />
          <TextField label="Phone" value={phone} onChange={setPhone} testId="m-sv-phone" />
          <TextField label="Email" value={email} onChange={setEmail} testId="m-sv-email" />
        </>
      )}

      <div className="mt-[14px]">
        <FieldLabel>Job site address</FieldLabel>
        <OptionStack
          options={[
            ...(contactMode === 'existing' && addressOptions.length > 0
              ? [{ value: 'existing' as const, label: 'A saved address' }]
              : []),
            { value: 'new' as const, label: 'New address' },
            { value: 'none' as const, label: 'Add it later' },
          ]}
          value={addressMode}
          onChange={setAddressMode}
          testIdPrefix="m-sv-address-mode"
        />
      </div>
      {addressMode === 'existing' ? (
        <div className="mt-[10px]">
          <select
            data-testid="m-sv-address"
            value={addressId}
            onChange={(e) => setAddressId(e.target.value)}
            className={selectClass}
          >
            <option value="">Choose an address…</option>
            {addressOptions.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </div>
      ) : addressMode === 'new' ? (
        <>
          <TextField label="Street" value={line1} onChange={setLine1} testId="m-sv-line1" required />
          <TextField label="City" value={city} onChange={setCity} testId="m-sv-city" required />
          <TextField label="State" value={state} onChange={setState} testId="m-sv-state" required />
          <TextField label="ZIP" value={zip} onChange={setZip} testId="m-sv-zip" inputMode="numeric" required />
        </>
      ) : null}

      <PrimaryButton
        label="Start the visit"
        busyLabel="Starting…"
        onClick={submit}
        disabled={!ready || !online}
        busy={busy}
        testId="m-sv-submit"
      />
    </div>
  );
}
