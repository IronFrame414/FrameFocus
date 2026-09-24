'use client';

import { useState } from 'react';
import { changeMyPassword } from '@/lib/auth/change-my-password';
import { PASSWORD_MIN_LENGTH, passwordTooShortMessage } from '@/lib/auth/password-policy';
import { useT } from '@/components/i18n/language-provider';

// S109 #162 — change your own password, no email. Shared by /dashboard/account
// and /m/account (parity: one form, one server action, both surfaces), beside
// NameForm. The CURRENT password is required [RULED Josh, ASK-162.A]; the
// server action re-checks everything this form checks.

const inputClass =
  'w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500';

export function PasswordForm() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [error, setError] = useState('');
  const t = useT();

  function edit(setter: (v: string) => void) {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      setter(e.target.value);
      setStatus('idle');
    };
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (next.length < PASSWORD_MIN_LENGTH) {
      setStatus('error');
      setError(passwordTooShortMessage());
      return;
    }
    if (next !== confirm) {
      setStatus('error');
      setError(t('shell.account.passwordsDontMatch'));
      return;
    }
    setStatus('saving');
    setError('');
    const result = await changeMyPassword({
      currentPassword: current,
      newPassword: next,
      confirmPassword: confirm,
    });
    if (result.ok) {
      setStatus('saved');
      setCurrent('');
      setNext('');
      setConfirm('');
    } else {
      setStatus('error');
      setError(result.error);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" data-testid="password-form">
      <div>
        <label htmlFor="currentPassword" className="block text-sm font-medium text-gray-700 mb-1">
          {t('shell.account.currentPassword')}
        </label>
        <input
          id="currentPassword"
          type="password"
          autoComplete="current-password"
          required
          value={current}
          onChange={edit(setCurrent)}
          className={inputClass}
        />
      </div>
      <div>
        <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700 mb-1">
          {t('shell.account.newPassword')}
        </label>
        <input
          id="newPassword"
          type="password"
          autoComplete="new-password"
          required
          value={next}
          onChange={edit(setNext)}
          placeholder={t('shell.account.atLeastChars', { n: PASSWORD_MIN_LENGTH })}
          className={inputClass}
        />
      </div>
      <div>
        <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">
          {t('shell.account.confirmNewPassword')}
        </label>
        <input
          id="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={edit(setConfirm)}
          className={inputClass}
        />
      </div>

      {status === 'error' && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}
      {status === 'saved' && (
        <div className="rounded-lg bg-green-50 p-3 text-sm text-green-700">
          {t('shell.account.passwordChanged')}
        </div>
      )}

      <button
        type="submit"
        disabled={status === 'saving' || !current || !next || !confirm}
        className="rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {status === 'saving' ? t('shell.account.changing') : t('shell.account.changePassword')}
      </button>
    </form>
  );
}
