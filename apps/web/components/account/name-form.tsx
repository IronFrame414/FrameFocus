'use client';

import { accountClasses } from './account-styles';
import { useState } from 'react';
import { updateMyName } from '@/lib/services/profile-self';
import { useT } from '@/components/i18n/language-provider';

// Shared by /dashboard/account and /m/account (parity: one form, both surfaces).
// Presentation can differ by wrapper; the mechanism (updateMyName + the DB guard)
// is the same. Name only — first and last — by ruling; the page grows later.

export function NameForm({
  initialFirstName,
  initialLastName,
  compact = false,
}: {
  initialFirstName: string;
  initialLastName: string;
  /** [S112 audit F17] /m presentation — see account-styles.ts. */
  compact?: boolean;
}) {
  const cls = accountClasses(compact);
  const [firstName, setFirstName] = useState(initialFirstName);
  const [lastName, setLastName] = useState(initialLastName);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [error, setError] = useState('');
  const t = useT();

  const dirty = firstName !== initialFirstName || lastName !== initialLastName;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('saving');
    setError('');
    const result = await updateMyName({ first_name: firstName, last_name: lastName });
    if (result.ok) {
      setStatus('saved');
    } else {
      setStatus('error');
      setError(result.error);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="firstName" className={cls.labelClass}>
          {t('shell.account.firstName')}
        </label>
        <input
          id="firstName"
          type="text"
          required
          value={firstName}
          onChange={(e) => {
            setFirstName(e.target.value);
            setStatus('idle');
          }}
          className={cls.input}
        />
      </div>
      <div>
        <label htmlFor="lastName" className={cls.labelClass}>
          {t('shell.account.lastName')}
        </label>
        <input
          id="lastName"
          type="text"
          required
          value={lastName}
          onChange={(e) => {
            setLastName(e.target.value);
            setStatus('idle');
          }}
          className={cls.input}
        />
      </div>

      {status === 'error' && (
        <div className={cls.error}>{error}</div>
      )}
      {status === 'saved' && (
        <div className={cls.success}>
          {t('shell.account.nameUpdated')}
        </div>
      )}

      <button
        type="submit"
        disabled={status === 'saving' || !dirty || !firstName.trim() || !lastName.trim()}
        className={cls.button}
      >
        {status === 'saving' ? t('account.saving') : t('account.save')}
      </button>
    </form>
  );
}
