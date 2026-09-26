'use client';

import { accountClasses } from './account-styles';
import { useState } from 'react';
import { changeMyPassword } from '@/lib/auth/change-my-password';
import { PASSWORD_MIN_LENGTH, passwordTooShortMessage } from '@/lib/auth/password-policy';
import { useT } from '@/components/i18n/language-provider';

// S109 #162 — change your own password, no email. Shared by /dashboard/account
// and /m/account (parity: one form, one server action, both surfaces), beside
// NameForm. The CURRENT password is required [RULED Josh, ASK-162.A]; the
// server action re-checks everything this form checks.


export function PasswordForm({
  compact = false,
}: {
  /** [S112 audit F17] /m presentation — see account-styles.ts. */
  compact?: boolean;
} = {}) {
  const cls = accountClasses(compact);
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
        <label htmlFor="currentPassword" className={cls.label}>
          {t('shell.account.currentPassword')}
        </label>
        <input
          id="currentPassword"
          type="password"
          autoComplete="current-password"
          required
          value={current}
          onChange={edit(setCurrent)}
          className={cls.input}
        />
      </div>
      <div>
        <label htmlFor="newPassword" className={cls.label}>
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
          className={cls.input}
        />
      </div>
      <div>
        <label htmlFor="confirmPassword" className={cls.label}>
          {t('shell.account.confirmNewPassword')}
        </label>
        <input
          id="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={edit(setConfirm)}
          className={cls.input}
        />
      </div>

      {status === 'error' && (
        <div className={cls.error}>{error}</div>
      )}
      {status === 'saved' && (
        <div className={cls.success}>
          {t('shell.account.passwordChanged')}
        </div>
      )}

      <button
        type="submit"
        disabled={status === 'saving' || !current || !next || !confirm}
        className={cls.button}
      >
        {status === 'saving' ? t('shell.account.changing') : t('shell.account.changePassword')}
      </button>
    </form>
  );
}
