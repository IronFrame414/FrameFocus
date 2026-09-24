'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { updateMyLanguage } from '@/lib/services/profile-self';
import { LANG_SELF_NAME, type Lang } from '@/lib/i18n/lang';
import { useT } from '@/components/i18n/language-provider';

// S110 H [RULED Josh, ruling 1] — the language toggle, ONE form on both account
// pages (parity S122). Its own labels follow the surface (uiLang): Spanish on
// /m for a Spanish user, English on /dashboard. The two choices are always
// named in THEMSELVES, so either reader can find theirs.
export function LanguageForm({ initial }: { initial: Lang }) {
  const t = useT();
  const router = useRouter();
  const [value, setValue] = useState<Lang>(initial);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  async function choose(next: Lang) {
    if (next === value) return;
    setValue(next);
    setStatus('saving');
    const r = await updateMyLanguage(next);
    if (!r.ok) {
      setValue(value);
      setStatus('error');
      return;
    }
    setStatus('saved');
    // The layouts read the language; re-render the shell in it.
    router.refresh();
  }

  return (
    <fieldset data-testid="language-form">
      <legend className="mb-2 text-[15px] font-semibold text-gray-900">
        {t('account.language')}
      </legend>
      <div className="flex gap-2" role="radiogroup" aria-label={t('account.language')}>
        {(['en', 'es'] as const).map((l) => (
          <button
            key={l}
            type="button"
            role="radio"
            aria-checked={value === l}
            data-testid={`language-${l}`}
            disabled={status === 'saving'}
            onClick={() => void choose(l)}
            lang={l}
            className={`min-h-[44px] flex-1 rounded-lg border px-3 py-2 text-sm font-semibold ${
              value === l
                ? 'border-brand-600 bg-brand-50 text-brand-700'
                : 'border-gray-300 bg-white text-gray-700'
            }`}
          >
            {LANG_SELF_NAME[l]}
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs text-gray-500">{t('account.language.help')}</p>
      {status === 'saved' && (
        <p role="status" className="mt-1 text-xs text-green-700">
          {t('account.language.saved')}
        </p>
      )}
      {status === 'error' && (
        <p role="alert" className="mt-1 text-xs text-red-700">
          {t('account.language.error')}
        </p>
      )}
    </fieldset>
  );
}
