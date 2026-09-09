/**
 * Vitest `setupFiles` entry for the LIVE runner (`test/live.vitest.config.ts`).
 *
 * ⚠️ THIS IS THE ONLY GUARD THAT REACHES EVERY HARNESS. A setup file is
 * executed in the worker BEFORE the test module is imported, so the throw here
 * lands before any `.live.ts` runs a single line — including the five that
 * build their own Supabase client straight from `process.env` and import
 * nothing from `live-session.ts`:
 *
 *   s104-cdc-backstop, s104c-cdc-recovery, s104-qb-discovery,
 *   s104-queue-dependency-propagation, s104-vendor-map
 *
 * Guarding inside `live-session.ts` alone would never have covered them, which
 * is the whole reason this file exists rather than a single module-load check.
 *
 * The top-level await is deliberate: it makes the verification a precondition
 * of the module graph loading at all, not something a harness has to remember
 * to call. See `test/live-guard.ts` for what is actually checked and why.
 */
import { guardLiveTarget } from '../live-guard';

const verified = await guardLiveTarget();

// One line, on the way past, so a green run still SHOWS which project it hit
// and how that was established. A guard whose output is silence is a guard
// nobody can tell apart from a guard that was quietly removed.
console.log(`[live-guard] target ${verified.ref} — ${verified.how}`);
