import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';

/**
 * Message read and write. Both run as the CALLER (ND-18).
 *
 * Spec: chat-spec.md §5, §7.2a, ND-26.
 *
 * ---------------------------------------------------------------------------
 * THE TRANSPORT LIVES BEHIND THIS FILE AND NOWHERE ELSE — A-C41
 * ---------------------------------------------------------------------------
 * ND-26 rules 12-second polling and §9.1c records that swapping to Realtime is
 * "one file plus a migration" — but ONLY while nothing above the service
 * function knows how messages arrive. The moment a component subscribes
 * directly, that property is gone and the swap becomes a refactor. Everything
 * above this module sees "give me messages since X" and nothing else.
 */

export interface ChatMessageRow {
  id: string;
  thread_id: string;
  author_profile_id: string;
  body: string;
  created_at: string;
  author: { first_name: string; last_name: string } | null;
}

const SELECT = 'id, thread_id, author_profile_id, body, created_at, author:profiles(first_name, last_name)';

/** ND-38: 50 in the tab, 25 in a panel. The caller says which surface it is. */
export const PAGE_SIZE = { tab: 50, panel: 25 } as const;

/**
 * The most recent page of a thread, oldest-first for rendering.
 *
 * Fetched newest-first (so the LIMIT takes the newest N, not the oldest N) and
 * reversed in memory. Ordering the query oldest-first with a LIMIT would return
 * the START of the thread, which on a long-running job is a wall of history
 * from months ago.
 */
export async function recentMessages(
  supabase: SupabaseClient<Database>,
  threadId: string,
  limit: number = PAGE_SIZE.tab
): Promise<ChatMessageRow[]> {
  const { data } = await supabase
    .from('chat_messages')
    .select(SELECT)
    .eq('thread_id', threadId)
    .order('created_at', { ascending: false })
    .limit(limit);

  return ((data ?? []) as unknown as ChatMessageRow[]).reverse();
}

/**
 * ⚠️ THE POLL — A-C40. Messages STRICTLY NEWER than the one the client holds.
 *
 * This is not a refetch and must never become one. A refetch grows with
 * history, so a thread on a long-running job would cost more to keep open than
 * a new one — and it would make ND-38's page size meaningless, since every
 * 12-second poll would re-transmit the whole page.
 *
 * `since` is the `created_at` of the newest message the client already has.
 * A caller with no messages yet passes `null` and gets the recent page instead,
 * so an empty thread does not poll the whole table.
 */
export async function messagesSince(
  supabase: SupabaseClient<Database>,
  threadId: string,
  since: string | null,
  limit: number = PAGE_SIZE.tab
): Promise<ChatMessageRow[]> {
  if (!since) return recentMessages(supabase, threadId, limit);

  const { data } = await supabase
    .from('chat_messages')
    .select(SELECT)
    .eq('thread_id', threadId)
    .gt('created_at', since)
    .order('created_at', { ascending: true })
    .limit(limit);

  return (data ?? []) as unknown as ChatMessageRow[];
}

export interface SendResult {
  success: boolean;
  id?: string;
  error?: string;
  /** RLS refused, as distinct from a malformed row — the route maps this to 403. */
  denied?: boolean;
}

/**
 * Insert a message AS THE CALLER.
 *
 * `author_profile_id` is passed rather than defaulted because the INSERT policy
 * checks `author_profile_id = get_my_profile_id()`; sending the wrong one is
 * refused by the database rather than silently attributed.
 */
export async function insertMessage(
  supabase: SupabaseClient<Database>,
  input: { threadId: string; authorProfileId: string; body: string }
): Promise<SendResult> {
  const { data, error } = await supabase
    .from('chat_messages')
    .insert({
      thread_id: input.threadId,
      author_profile_id: input.authorProfileId,
      body: input.body,
    })
    .select('id')
    .single();

  if (error) {
    // 42501 is what an RLS WITH CHECK refusal surfaces as.
    return { success: false, error: error.message, denied: error.code === '42501' };
  }
  return { success: true, id: data.id };
}

/**
 * Store the resolved mentions (ND-39).
 *
 * Written as the caller: `chat_message_mentions_insert_author` requires the
 * message to be the caller's own, which is what stops a third party attaching a
 * mention to somebody else's message to make it notify.
 *
 * `UNIQUE (message_id, mentioned_profile_id)` is the A-C14 guarantee; the
 * parser de-duplicates first so this never has to rely on a conflict.
 */
export async function insertMentions(
  supabase: SupabaseClient<Database>,
  messageId: string,
  profileIds: string[]
): Promise<{ inserted: number; error?: string }> {
  if (profileIds.length === 0) return { inserted: 0 };

  const { error } = await supabase
    .from('chat_message_mentions')
    .insert(profileIds.map((id) => ({ message_id: messageId, mentioned_profile_id: id })));

  if (error) return { inserted: 0, error: error.message };
  return { inserted: profileIds.length };
}

/**
 * Mark a thread read for the caller (§4.4).
 *
 * Upsert on the (profile_id, thread_id) unique pair — the row is created on
 * first open and UPDATEd every time after, which is exactly why `chat_reads` is
 * the one chat table that is not append-only.
 */
export async function markThreadRead(
  supabase: SupabaseClient<Database>,
  threadId: string
): Promise<void> {
  // ⚠️ THE SERVER STAMPS THIS. NEVER THE CLIENT.
  //
  // _Superseded implementation, quoted not rewritten: an upsert with
  // `last_read_at: new Date().toISOString()`._ That is the CLIENT clock, and
  // every value it is compared against — `chat_messages.created_at` — is the
  // DATABASE clock. Unread is `created_at > last_read_at`, so the two clocks
  // were being subtracted from each other on every read.
  //
  // When the client runs fast, `last_read_at` lands in the database's future,
  // every later message compares as already-read, and the unread badge silently
  // never lights again. There is nothing to see: the thread simply stops
  // reporting anything new, which is precisely the failure chat exists to
  // prevent. The S126 live harness caught it; the switcher RPC was returning the
  // right count for the same rows all along.
  //
  // A PostgREST upsert cannot express `SET last_read_at = now()`, so this is an
  // RPC (20260908000000). SECURITY INVOKER — chat_reads RLS still decides, and
  // the profile comes from the session rather than from the caller, so one
  // member cannot mark another's thread read.
  const rpc = supabase.rpc.bind(supabase) as unknown as (
    fn: string,
    args?: Record<string, unknown>
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
  await rpc('chat_mark_read', { p_thread_id: threadId });
}
