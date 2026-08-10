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
  /** ISO timestamp of the newest message the client holds. Null on first load. */
  since: z.string().datetime().nullable().optional(),
});
