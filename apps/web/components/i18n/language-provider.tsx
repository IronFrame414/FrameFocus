'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { Lang } from '@/lib/i18n/lang';
import { makeT, type T } from '@/lib/i18n/messages';

/**
 * S110 H — WHICH LANGUAGE, FOR WHOM. Two values, because the rulings split them:
 *
 *   uiLang     — SYSTEM text. The /m layout passes the user's language; the
 *                dashboard layout passes 'en' (ruling 2: /dashboard chrome stays
 *                English, for now).
 *   readerLang — USER-ENTERED text is translated into this, on BOTH surfaces
 *                (ruling 3: "a crew member types Spanish; Josh opens the same
 *                record on a desktop and reads English").
 *
 * ⚠️ A SHARED COMPONENT NEVER INSPECTS ITS ROUTE. SiteVisitRecord, the chat
 * thread and the account forms are mounted by /m AND /dashboard; they read
 * these two values and the layout decides. Outside any provider (a client
 * portal page, a public page) both are 'en' — and ruling 5 keeps it that way:
 * the portal layout never mounts this provider.
 */
const LanguageContext = createContext<{ uiLang: Lang; readerLang: Lang }>({
  uiLang: 'en',
  readerLang: 'en',
});

export function LanguageProvider({
  uiLang,
  readerLang,
  children,
}: {
  uiLang: Lang;
  readerLang: Lang;
  children: ReactNode;
}) {
  const value = useMemo(() => ({ uiLang, readerLang }), [uiLang, readerLang]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useUiLang(): Lang {
  return useContext(LanguageContext).uiLang;
}

export function useReaderLang(): Lang {
  return useContext(LanguageContext).readerLang;
}

/** System text in the surface's language. */
export function useT(): T {
  const lang = useUiLang();
  return useMemo(() => makeT(lang), [lang]);
}
