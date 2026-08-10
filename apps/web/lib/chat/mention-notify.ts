import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import type { CompanyRole } from '@framefocus/shared';
import { notify, type NotifyRecipient } from '@/lib/notify/notify';
import type { ThreadKind } from '@/lib/chat/threads';

/**
 * §3a-2 / §6 — the mention notification.
 *
 * ---------------------------------------------------------------------------
 * BOUND TO THE SHIPPED notify(), NOT TO PARENT §4.6
 * ---------------------------------------------------------------------------
 * The S125 audit found parent §4.6 wrong on FIVE counts against the live code.
 * What is true of the shipped function, and relied on here:
 *
 *   · `recipients` are ALREADY RESOLVED — notify() does not look them up, it
 *     de-duplicates by profileId and writes.
 *   · `render` is a REQUIRED per-recipient FUNCTION, not a text field.
 *   · `linkKey` and `linkParams` are TWO parameters, not one `link`.
 *   · there is NO `override` parameter.
 *   · it SENDS NO EMAIL — see the seam at the bottom of this file.
 *   · `admin` and `companyId` are required, and `admin` must be the SERVICE
 *     ROLE: `notifications` has no INSERT policy for any authenticated role,
 *     which is what stops one member forging a notification to another.
 */

/** §6.1 — the thread is named, so two threads on one project are not ambiguous. */
export function mentionTitle(
  authorName: string,
  projectName: string,
  kind: ThreadKind,
  body: string
): string {
  const where = kind === 'sub' ? `${projectName} — subs` : projectName;
  return `${authorName} (${where}): ${truncateBody(body)}`;
}

/**
 * ND-31 — 140 characters of body, cut at a word boundary, ellipsis appended.
 *
 * ⚠️ TRUNCATION HAPPENS HERE, IN CHAT'S RENDER, AND NOT IN `push.ts`. The shared
 * push path does no truncation at all and must keep doing none, so that no
 * existing notification type changes behaviour. The prefix — author and project
 * — is never cut: ND-23's thread token is the part that tells the reader
 * whether to tap at all.
 */
export function truncateBody(body: string, max = 140): string {
  const clean = body.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

export interface MentionNotifyParams {
  admin: SupabaseClient<Database>;
  companyId: string;
  projectId: string;
  projectName: string;
  threadId: string;
  kind: ThreadKind;
  messageId: string;
  authorName: string;
  body: string;
  /** Already parsed, de-duplicated and self-excluded by `parseMentions`. */
  mentioned: Array<{ profileId: string; role: CompanyRole; email: string | null }>;
}

export async function notifyMentions(params: MentionNotifyParams): Promise<{ written: number }> {
  if (params.mentioned.length === 0) return { written: 0 };

  const recipients: NotifyRecipient[] = params.mentioned.map((m) => ({
    profileId: m.profileId,
    role: m.role,
    email: m.email,
  }));

  const title = mentionTitle(params.authorName, params.projectName, params.kind, params.body);

  const outcome = await notify({
    admin: params.admin,
    companyId: params.companyId,
    type: 'mention',
    recipients,
    // R7's enforcement point. Chat text is user-authored and identical for every
    // recipient, so every render returns the same bytes — but it is still a
    // function, because that is what makes a per-recipient split the default
    // shape rather than a change of call. §6.4: the floor is accepted-not-solved
    // here, and the email is NOT safer than the row.
    render: () => ({ title }),
    linkKey: 'chat',
    // ND-40: the mobile arm of this key resolves to `/m/p/{id}?chat=1`, a param
    // rather than a route. `threadId` is carried so a sub-thread mention opens
    // the SUB thread (A-C13) instead of the crew one.
    linkParams: {
      projectId: params.projectId,
      threadId: params.threadId,
      id: params.messageId,
    },
    projectId: params.projectId,
    source: { table: 'chat_messages', id: params.messageId },
    // Collapses OS-level repeats of the same message, not of the same thread —
    // two mentions in one conversation are two things worth knowing about.
    tag: `chat-mention-${params.messageId}`,
  });

  return { written: outcome.written };
}

// ---------------------------------------------------------------------------
// ⚠️ SEAM — THE SUB MENTION EMAIL (ND-42) IS SLICE 4, NOT THIS SLICE
// ---------------------------------------------------------------------------
// §12 places the send path in slice 4, "with the audience that needs it", and
// the `email_types` row for `mention` already landed with slice 1's schema.
//
// When it is built it goes HERE, in the chat send path, ALONGSIDE notify() —
// never inside it. `notify()` sends no email and four existing consumers
// (incident-notify, co-signing, delivery check-in) each drive their own; moving
// it inside would double-send for all of them.
//
// Scope when built: SUBS ONLY (ND-42). A mentioned crew member, foreman, PM,
// Admin or Owner gets in-app and push and no email. That is an explicit,
// recorded exception to parent R3 (§5.6a-i), not an oversight to tidy up.
//
// This comment is the seam. There is deliberately no stub function, because an
// empty `sendMentionEmail()` would read as "built" to a later grep.
