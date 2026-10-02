// S122 Parts 6 + 7 — THE CLIENT DISCLAIMER, ONE STRING [ruling 8, 6-A].
//
// The client's finish-date email (Part 6) and the portal's Critical Path view
// (Part 7) carry the SAME sentence, so it lives here, alone.
//
// ⚠️ THIS FILE IMPORTS NOTHING. The portal mounts it, and the portal's import
// graph must never reach the Critical Path engine (stop rule 8; the transitive
// check is test/s122-cp-portal-imports.test.ts). ./notify-text re-exports it,
// but notify-text itself reaches the engine through critical-path-writes, so
// the portal must import THIS file, never notify-text.

export const CLIENT_DISCLAIMER =
  'The construction industry is fluid and dynamic; these dates are for planning purposes and cannot be guaranteed.';
