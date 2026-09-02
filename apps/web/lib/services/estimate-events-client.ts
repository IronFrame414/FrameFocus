'use client';

// Estimates redesign — the estimate_events writers (client side).
// Spec: docs/specs/estimates-redesign-spec.md §3.5 row 3; R3.
//
// One append-only log feeds 16d's history rail and 19b's client activity. Kinds:
// reprice, send, award, convert (clone EXCLUDED, R3).
//
// BUILD DECISION [S103, §0 autonomy]: events are emitted from the TS layer,
// BEST-EFFORT and NON-BLOCKING — a failed event write NEVER fails the user
// action that produced it. The log is advisory (a history rail), not a security
// or financial boundary. company_id (DEFAULT get_my_company_id()) and actor_id
// (DEFAULT auth.uid(), migration 20261180000000) are auto-stamped by the DB, so
// a writer supplies only estimate_id, kind and an optional payload.
//
// The three client writers here cover reprice / award / convert; the 'send'
// event is emitted server-side in app/api/proposals/send/route.ts (service-role,
// explicit actor).

import { createClient } from '@/lib/supabase-browser';

export type EstimateEventKind = 'reprice' | 'send' | 'award' | 'convert';

/** Fire-and-forget estimate event. Swallows its own errors on purpose — the
 *  history rail must never be the reason a save or an award fails. */
export async function logEstimateEvent(
  estimateId: string,
  kind: EstimateEventKind,
  payload?: Record<string, unknown>
): Promise<void> {
  try {
    const supabase = createClient();
    await supabase
      .from('estimate_events')
      .insert({ estimate_id: estimateId, kind, payload: payload ?? null });
  } catch {
    // Advisory log — never block or surface. (Deliberate empty catch.)
  }
}
