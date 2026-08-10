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
  // ⚠️ EMPTY IS ALLOWED WHEN PHOTOS ARE ATTACHED — CORRECTED [S126 slice 6].
  //
  // _Superseded, quoted not rewritten:
  // `body: z.string().trim().min(1, 'A message cannot be empty').max(4000)`._
  //
  // §5.4: "the message can carry text, photos, or both". Slice 6 relaxed the
  // COMPOSER to allow a photo-only send and left this untouched, so every one
  // of them was rejected with a 400 the composer surfaced as a failed message.
  // Found by the browser test, not by review — the unit and live suites never
  // send an empty body because until slice 6 there was no reason to.
  //
  // The 4000 cap is a sanity bound rather than a product rule: R2 makes the log
  // permanent, so an unbounded body is a permanent unbounded body.
  body: z.string().trim().max(4000),
  /**
   * ND-22 — references to EXISTING `files` rows. Never an upload.
   *
   * The cap is a sanity bound, not a product rule. Eligibility — that each id
   * is a `category='photos'` file on THIS project that the caller can read —
   * is checked server-side by `eligiblePhotoIds()`, because an FK cannot
   * enforce category (§4.3) and a schema cannot know the project.
   */
  file_ids: z.array(z.string().uuid()).max(10).optional(),
})
  // The rule the `min(1)` above used to carry, restated where it can see BOTH
  // fields: a message must be SOMETHING. Text, photos, or both — never neither.
  .refine((v) => v.body.length > 0 || (v.file_ids?.length ?? 0) > 0, {
    message: 'A message needs text or a photo',
    path: ['body'],
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
