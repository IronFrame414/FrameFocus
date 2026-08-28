'use client';

// Step 8 (desktop redesign §8.11.1) — the tab strip IS the redesign: seven
// stacked forms become seven tabs. Single bottom-border row per the README's
// tab hierarchy (raised segments are project detail only).
//
// ⚠️ EVERY PANEL STAYS MOUNTED; inactive ones hide with display:none. Not a
// styling choice: the forms autosave on a 1s debounce and the Company tab can
// have an upload in flight. Unmounting on switch would cancel a pending
// debounce (edit → switch inside 1s → the write never fires) and orphan
// upload feedback. Hidden-not-unmounted makes a tab switch unable to lose a
// write.
//
// The active tab mirrors into `?tab=` via history.replaceState so Documents
// (file categories, release forms) is linkable from the screens that point
// here — no navigation happens, because nothing needs the server.

import { useState, type ReactNode } from 'react';
import { color } from '@/lib/theme';

export interface SettingsTabDef {
  key: string;
  label: string;
  content: ReactNode;
}

export function SettingsTabs({ tabs, initialTab }: { tabs: SettingsTabDef[]; initialTab?: string }) {
  const validInitial = tabs.some((t) => t.key === initialTab) ? (initialTab as string) : tabs[0].key;
  const [active, setActive] = useState(validInitial);

  function select(key: string) {
    setActive(key);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('tab', key);
      window.history.replaceState(null, '', url.toString());
    }
  }

  return (
    <div>
      <div
        role="tablist"
        style={{
          display: 'flex',
          gap: '0.25rem',
          borderBottom: `1px solid ${color.cardBorder}`,
          marginBottom: '1.5rem',
          flexWrap: 'wrap',
        }}
      >
        {tabs.map((t) => {
          const isActive = t.key === active;
          return (
            <button
              key={t.key}
              role="tab"
              aria-selected={isActive}
              data-testid={`settings-tab-${t.key}`}
              onClick={() => select(t.key)}
              style={{
                padding: '10px 14px',
                fontSize: '13.5px',
                fontWeight: isActive ? 700 : 600,
                color: isActive ? color.primary : color.mutedAlt,
                background: 'none',
                border: 'none',
                borderRadius: 0,
                boxShadow: isActive ? `inset 0 -2.5px 0 ${color.primary}` : 'none',
                cursor: 'pointer',
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      {tabs.map((t) => (
        <div
          key={t.key}
          role="tabpanel"
          data-testid={`settings-panel-${t.key}`}
          style={{ display: t.key === active ? 'block' : 'none' }}
        >
          {t.content}
        </div>
      ))}
    </div>
  );
}
