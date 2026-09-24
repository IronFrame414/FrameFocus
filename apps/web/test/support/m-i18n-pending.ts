// S110 H — /m files NOT YET MIGRATED to t('…'), with the number of hard-coded
// user-facing strings each still holds. GENERATED from the scan at the start of
// the migration; ⚠️ A RATCHET: a number may only go DOWN, and a file reaches
// zero by being removed from this list. Nothing may be ADDED here — a new /m
// screen starts at zero (test/s110-m-i18n-guard.test.ts).
//
// Deferred on purpose until Section A lands, because A rewrites them [S110
// prompt: "translating its strings before A has rewritten them means doing the
// work twice"]: components/site-visits/site-visit-record.tsx, voice-notes.tsx.
export const PENDING: Record<string, number> = {
  // EMPTY [S110 H]: every file /m can render is migrated. The ratchet started at
  // 1011 strings in 80 files; the two site-visit components followed Section A.
};
