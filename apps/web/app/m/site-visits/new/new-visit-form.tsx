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
import { useT } from '@/components/i18n/language-provider';

// S108 Spec A — the create form. Online-only: the visit needs its id before
// photos and voice can attach (those two are then held offline if signal
// drops). Everything is validated again in create_site_visit().

type ContactMode = 'existing' | 'new';
type AddressMode = 'existing' | 'new' | 'none';

const selectClass =
  'h-[48px] w-full rounded-[12px] border border-m6m-border bg-m6m-card px-[12px] text-[15px] text-m6m-navy';

export function NewSiteVisitForm({ contacts }: { contacts: ContactOption[] }) {
  const router = useRouter();
  const t = useT();
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
      setError(r.error ?? t('photos.sv.recordFailed'));
      return;
    }
    router.replace(`/m/site-visits/${r.id}`);
  }

  return (
    <div data-testid="m-site-visit-form">
      {!online ? <OfflineNotice what={t('photos.sv.offlineWhat')} testId="m-sv-offline" /> : null}
      {error ? <ErrorNotice message={error} testId="m-sv-error" /> : null}

      <TextField
        label={t('photos.sv.visitName')}
        value={title}
        onChange={setTitle}
        testId="m-sv-title"
        placeholder={t('photos.sv.visitNamePlaceholder')}
        required
      />

      <div className="mt-[14px]">
        <FieldLabel required>{t('photos.sv.contact')}</FieldLabel>
        <OptionStack
          options={[
            { value: 'existing' as const, label: t('photos.sv.existingContact') },
            { value: 'new' as const, label: t('photos.sv.newContact') },
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
            <option value="">{t('photos.sv.chooseContact')}</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <>
          <TextField label={t('photos.sv.firstName')} value={first} onChange={setFirst} testId="m-sv-first" required />
          <TextField label={t('photos.sv.lastName')} value={last} onChange={setLast} testId="m-sv-last" required />
          <TextField label={t('photos.sv.phone')} value={phone} onChange={setPhone} testId="m-sv-phone" />
          <TextField label={t('photos.sv.email')} value={email} onChange={setEmail} testId="m-sv-email" />
        </>
      )}

      <div className="mt-[14px]">
        <FieldLabel>{t('photos.sv.jobSiteAddress')}</FieldLabel>
        <OptionStack
          options={[
            ...(contactMode === 'existing' && addressOptions.length > 0
              ? [{ value: 'existing' as const, label: t('photos.sv.savedAddress') }]
              : []),
            { value: 'new' as const, label: t('photos.sv.newAddress') },
            { value: 'none' as const, label: t('photos.sv.addLater') },
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
            <option value="">{t('photos.sv.chooseAddress')}</option>
            {addressOptions.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </div>
      ) : addressMode === 'new' ? (
        <>
          <TextField label={t('photos.sv.street')} value={line1} onChange={setLine1} testId="m-sv-line1" required />
          <TextField label={t('photos.sv.city')} value={city} onChange={setCity} testId="m-sv-city" required />
          <TextField label={t('photos.sv.state')} value={state} onChange={setState} testId="m-sv-state" required />
          <TextField label={t('photos.sv.zip')} value={zip} onChange={setZip} testId="m-sv-zip" inputMode="numeric" required />
        </>
      ) : null}

      <PrimaryButton
        label={t('photos.sv.start')}
        busyLabel={t('photos.sv.starting')}
        onClick={submit}
        disabled={!ready || !online}
        busy={busy}
        testId="m-sv-submit"
      />
    </div>
  );
}
