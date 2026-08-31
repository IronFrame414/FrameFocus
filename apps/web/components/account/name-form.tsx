'use client';

import { useState } from 'react';
import { updateMyName } from '@/lib/services/profile-self';

// Shared by /dashboard/account and /m/account (parity: one form, both surfaces).
// Presentation can differ by wrapper; the mechanism (updateMyName + the DB guard)
// is the same. Name only — first and last — by ruling; the page grows later.

export function NameForm({
  initialFirstName,
  initialLastName,
}: {
  initialFirstName: string;
  initialLastName: string;
}) {
  const [firstName, setFirstName] = useState(initialFirstName);
  const [lastName, setLastName] = useState(initialLastName);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [error, setError] = useState('');

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
        <label htmlFor="firstName" className="block text-sm font-medium text-gray-700 mb-1">
          First name
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
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
      </div>
      <div>
        <label htmlFor="lastName" className="block text-sm font-medium text-gray-700 mb-1">
          Last name
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
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
      </div>

      {status === 'error' && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}
      {status === 'saved' && (
        <div className="rounded-lg bg-green-50 p-3 text-sm text-green-700">Your name was updated.</div>
      )}

      <button
        type="submit"
        disabled={status === 'saving' || !dirty || !firstName.trim() || !lastName.trim()}
        className="rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {status === 'saving' ? 'Saving…' : 'Save'}
      </button>
    </form>
  );
}
