'use client';

import { useState } from 'react';
import { setAiTaggingEnabled } from '@/lib/services/add-ons-client';

interface AddOnsSectionProps {
  initialEnabled: boolean;
}

export function AddOnsSection({ initialEnabled }: AddOnsSectionProps) {
  const [enabled, setEnabled] = useState(initialEnabled);

  async function handleToggle() {
    const newValue = !enabled;
    setEnabled(newValue);
    try {
      await setAiTaggingEnabled(newValue);
    } catch (err) {
      setEnabled(!newValue);
      console.error('Failed to update AI Photo Auto-Tagging setting', err);
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Add-Ons</h2>

      <div className="flex items-center justify-between">
        <div className="pr-4">
          <p className="text-sm font-medium text-gray-900">AI Photo Auto-Tagging</p>
          <p className="text-sm text-gray-500">
            Automatically tag uploaded photos using AI. Billed as an add-on.
          </p>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="Toggle AI Photo Auto-Tagging"
          onClick={handleToggle}
          className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
            enabled ? 'bg-blue-600' : 'bg-gray-200'
          }`}
        >
          <span
            className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
              enabled ? 'translate-x-5' : 'translate-x-0.5'
            }`}
          />
        </button>
      </div>
    </div>
  );
}
