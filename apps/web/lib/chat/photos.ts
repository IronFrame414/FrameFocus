import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import type { ChatMessageRow } from '@/lib/chat/messages';

/**
 * ND-22 / ND-28 — the photo REFERENCE. Slice 6.
 *
 * Spec: chat-spec.md §4.3, §5.4.
 *
 * ===========================================================================
 * REFERENCE, NOT UPLOAD. CHAT INGESTS NO FILE.
 * ===========================================================================
 * Everything here reads or points at `files` rows the gallery already owns.
 * There is no upload path, no storage write, no `FormData` — **A-C18 asserts
 * that absence**, and it is the criterion a build that adds an upload "because
 * it's easier" fails at and nowhere else.
 *
 * ⚠️ CHAT NEVER RESOLVES A FILE PATH ITSELF (M6M D-31). Both the picker and the
 * thumbnails go through `getProjectPhotos()`, which already produces
 * `displayUrl` — the derivative when a photo is annotated, the original
 * otherwise. A build that signed its own URL would show the UNMARKED original
 * for an annotated photo, which is #129's failure exactly.
 */

export interface ChatPhoto {
  fileId: string;
  fileName: string;
  /** D-31's resolution. Null when the URL could not be signed. */
  displayUrl: string | null;
  sortOrder: number;
}

/** A message row with its photo references attached. */
export type ChatMessageWithPhotos = ChatMessageRow & { photos: ChatPhoto[] };

/**
 * ⚠️ THE CATEGORY CHECK — A-C17c, AND THE ONLY BACKSTOP THERE IS.
 *
 * `file_id → files(id)` permits a chat message to reference a receipt, a
 * contract, an invoice or a change-order PDF, because `files` holds all of
 * them and **an FK cannot enforce `category`** (§4.3). This function is the
 * rule. It runs on the SEND path, not only in the picker's query, because a
 * picker filter is a UI convenience and this is the thing a crafted request
 * has to get past.
 *
 * Scoped to the project as well as the category: a photo from another project
 * is as wrong as a contract from this one.
 */
export async function eligiblePhotoIds(
  supabase: SupabaseClient<Database>,
  projectId: string,
  fileIds: string[]
): Promise<string[]> {
  if (fileIds.length === 0) return [];

  const { data } = await supabase
    .from('files')
    .select('id')
    .in('id', fileIds)
    .eq('project_id', projectId)
    .eq('category', 'photos')
    .eq('is_deleted', false);

  // Runs as the CALLER, so a file they cannot read is not eligible either —
  // the same RLS that governs the gallery governs what chat can point at.
  return ((data ?? []) as Array<{ id: string }>).map((r) => r.id);
}

/**
 * Attach references to a message the caller has just written.
 *
 * Written as the caller: `chat_message_photos_insert_author` requires the
 * message to be their own, which is what stops a third party bolting a photo
 * onto somebody else's message.
 */
export async function attachPhotos(
  supabase: SupabaseClient<Database>,
  messageId: string,
  fileIds: string[]
): Promise<{ attached: number; error?: string }> {
  if (fileIds.length === 0) return { attached: 0 };

  const rows = fileIds.map((fileId, i) => ({
    message_id: messageId,
    file_id: fileId,
    sort_order: i,
  }));

  const { error } = await supabase.from('chat_message_photos').insert(rows);
  if (error) return { attached: 0, error: error.message };
  return { attached: rows.length };
}

/**
 * Decorate a page of messages with their photos — ONE query, not one per
 * message.
 *
 * The naive shape is an N+1 across a 50-message page, and it would run again on
 * every 12-second poll.
 */
export async function withPhotos(
  supabase: SupabaseClient<Database>,
  messages: ChatMessageRow[],
  /**
   * ⚠️ INJECTED, AND THE REASON IS A DEFECT THIS SIGNATURE ONCE HAD.
   *
   * _Superseded, quoted not rewritten: `withPhotos(supabase, projectId,
   * messages)`, which called `getProjectPhotos(projectId)` internally._ That
   * function builds its OWN request-scoped client via `cookies()`, so the
   * parameter above was only half-used: the join query ran as the caller and
   * the gallery read ran as something else. It worked in a route and threw
   * `cookies was called outside a request scope` everywhere else — which is
   * how it was found, by the live harness rather than by review.
   *
   * Injecting it is the same shape `createChatPoll` already uses in this
   * module: the expensive dependency is a parameter, so the function is
   * testable without a request and the route stays the only thing that knows
   * how a gallery is fetched.
   */
  resolveGallery: () => Promise<Array<{ id: string; file_name: string; displayUrl: string | null }>>
): Promise<ChatMessageWithPhotos[]> {
  if (messages.length === 0) return [];

  const { data } = await supabase
    .from('chat_message_photos')
    .select('message_id, file_id, sort_order')
    .in(
      'message_id',
      messages.map((m) => m.id)
    )
    .order('sort_order', { ascending: true });

  const refs = (data ?? []) as Array<{ message_id: string; file_id: string; sort_order: number }>;

  // ⚠️ SHORT-CIRCUIT, AND IT IS THE POINT. Signing URLs means calling
  // getProjectPhotos(), which resolves EVERY photo on the project. A thread
  // polls every 12 seconds and the overwhelmingly common poll returns no new
  // messages at all — so the expensive half must not run unless a reference
  // actually exists on this page.
  if (refs.length === 0) return messages.map((m) => ({ ...m, photos: [] }));

  const gallery = await resolveGallery();
  const urlFor = new Map(
    gallery.map((p) => [p.id, { fileName: p.file_name, displayUrl: p.displayUrl }])
  );

  const byMessage = new Map<string, ChatPhoto[]>();
  for (const row of refs) {
    const resolved = urlFor.get(row.file_id);
    const list = byMessage.get(row.message_id) ?? [];
    list.push({
      fileId: row.file_id,
      fileName: resolved?.fileName ?? 'Photo',
      // Null when the file is gone (ND-28's CASCADE has not yet been observed
      // by this request) or could not be signed. The renderer skips it rather
      // than showing a broken image.
      displayUrl: resolved?.displayUrl ?? null,
      sortOrder: row.sort_order,
    });
    byMessage.set(row.message_id, list);
  }

  return messages.map((m) => ({ ...m, photos: byMessage.get(m.id) ?? [] }));
}
