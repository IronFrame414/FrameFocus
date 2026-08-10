import { z } from 'zod';

/**
 * Chat request bodies. Slice 2.
 *
 * The message insert moved server-side (ND-18) so `notify()` has a server path,
 * which means the body now arrives as JSON from the network. RLS still decides
 * whether the write is ALLOWED; this decides whether it is well-formed.
 */

export const chatSendSchema = z.object({
  project_id: z.string().uuid(),
  kind: z.enum(['crew', 'sub']),
  // A message is text. Empty is not a message, and the 4000 cap is a sanity
  // bound rather than a product rule — R2 makes the log permanent, so an
  // unbounded body is a permanent unbounded body.
  body: z.string().trim().min(1, 'A message cannot be empty').max(4000),
});

export type ChatSendInput = z.infer<typeof chatSendSchema>;

export const chatPollSchema = z.object({
  thread_id: z.string().uuid(),
  /**
   * ISO timestamp of the newest message the client holds. Null on first load.
   *
   * ⚠️ `{ offset: true }` IS LOAD-BEARING — CORRECTED [S126 slice 3].
   * _Superseded, quoted not rewritten: `z.string().datetime().nullable().optional()`._
   * Plain `.datetime()` accepts only a `Z` suffix. PostgREST returns
   * `2026-07-11T22:13:07.184263+00:00` — a numeric offset — so the original
   * form rejected **every real timestamp this field will ever carry**, and the
   * poll would have 400'd on its second request forever.
   *
   * It was invisible because slice 2 wrote this schema and built no route that
   * used it. The value here is always a `created_at` the DATABASE stamped and
   * the client merely echoes back; it is never produced by a browser clock.
   */
  since: z.string().datetime({ offset: true }).nullable().optional(),
});

/**
 * Opening a thread: resolve-or-create, mark read, return the first page.
 *
 * `surface` picks ND-38's page size — 50 in the tab, 25 in a panel. It is a
 * request field rather than two routes because the two surfaces differ in one
 * number and nothing else (A-C28).
 */
export const chatOpenSchema = z.object({
  project_id: z.string().uuid(),
  kind: z.enum(['crew', 'sub']),
  surface: z.enum(['tab', 'panel']).default('panel'),
});

export type ChatOpenInput = z.infer<typeof chatOpenSchema>;
