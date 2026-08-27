'use client';

import { useState } from 'react';
import { useAlert } from '@/components/confirm/confirm-provider';

export function ManageSubscriptionButton() {
  const alert = useAlert();
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    try {
      const res = await fetch('/api/stripe/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const data = await res.json();

      if (!res.ok) {
        void alert(data.error || 'Something went wrong');
        setLoading(false);
        return;
      }

      window.location.href = data.url;
    } catch (err) {
      void alert('Failed to open billing portal. Please try again.');
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="w-full text-center border border-gray-300 text-gray-700 py-2 px-4 rounded-lg font-medium text-sm hover:bg-gray-50 transition disabled:opacity-50"
    >
      {loading ? 'Opening...' : 'Manage Subscription & Payment Method'}
    </button>
  );
}
