import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import type { CompanyRole } from '@framefocus/shared';
import { createClient } from '@/lib/supabase-server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { chatSendSchema, chatPollSchema } from '@framefocus/shared/validation/chat';
import { resolveThread, postableSet } from '@/lib/chat/threads';
import {
  insertMessage,
  insertMentions,
  messagesSince,
  messagesBefore,
  PAGE_SIZE,
} from '@/lib/chat/messages';
import { chatSession } from '../_session';
import { parseMentions } from '@/lib/chat/mentions';
import { notifyMentions } from '@/lib/chat/mention-notify';
import { sendMentionEmails } from '@/lib/chat/mention-email';
import { attachPhotos, eligiblePhotoIds, withPhotos } from '@/lib/chat/photos';

// Chat send. ND-18's shape, unchanged:
//
//   WRITE   `createClient()` — the caller's own JWT. The thread insert, the
//           message insert and the mention rows all run under RLS, so
//           chat_messages_insert_authorized decides who may post where. A
//           reader who "simplifies" this to getSupabaseAdmin() removes the
//           entire access model and every test still passes.
//
//   NOTIFY  the service role, and it must be: `notifications` has NO INSERT
//           policy for any authenticated role, which is what stops one member
//           forging a mention notification addressed to another.
//
// The audience resolution (postableSet) also uses the service role: working out
// WHO may be mentioned is not the same act as writing the message, and the
// caller is not necessarily entitled to read every profile it considers.

/**
 * ⚠️ THE POLL'S TRANSPORT — A-C40, A-C41.
 *
 * This is the ONLY way the browser learns about new messages. No component
 * subscribes to anything; the client holds a `since` and asks for what is newer
 * (§9.1c — which is what keeps the Realtime swap at one file plus a migration).
 *
 * `since` is ALWAYS a `created_at` the database stamped and the client echoed
 * back. It is never `new Date()` in the browser: `chat_messages.created_at` is
 * on the database clock, and a browser running fast would ask for messages
 * newer than a moment that has not happened yet — silently receiving nothing,
 * forever, with no error to see. Same defect class as the markThreadRead bug
 * (20260908000000). A client with nothing yet sends no `since` at all and gets
 * the recent page instead.
 */
/**
 * ND-22 — attach photo references to a page of messages.
 *
 * `project_id` is required to resolve `displayUrl` through getProjectPhotos()
 * (D-31 — chat never resolves a path itself). A caller that omits it gets
 * messages with no photos rather than an error: the text is the message, and a
 * missing thumbnail must not blank the thread.
 */
async function decorate(
  supabase: Parameters<typeof withPhotos>[0],
  projectId: string | null,
  messages: Awaited<ReturnType<typeof messagesSince>>
) {
  if (!projectId) return messages.map((m) => ({ ...m, photos: [] }));
  const { getProjectPhotos } = await import('@/lib/services/photos');
  return withPhotos(supabase, messages, () => getProjectPhotos(projectId));
}

export async function GET(request: NextRequest) {
  const session = await chatSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const params = request.nextUrl.searchParams;

  // §7.2's load-more. Distinct parameter from `since` rather than a mode flag,
  // so a request can never accidentally mean both directions at once.
  const before = params.get('before');
  if (before) {
    const parsedBefore = chatPollSchema.safeParse({
      thread_id: params.get('thread_id') ?? undefined,
      since: before,
    });
    if (!parsedBefore.success) {
      return NextResponse.json({ error: parsedBefore.error.errors[0].message }, { status: 400 });
    }
    const older = await messagesBefore(
      session.supabase,
      parsedBefore.data.thread_id,
      before,
      PAGE_SIZE[params.get('surface') === 'tab' ? 'tab' : 'panel']
    );
    return NextResponse.json({
      messages: await decorate(session.supabase, params.get('project_id'), older),
    });
  }

  const parsed = chatPollSchema.safeParse({
    thread_id: params.get('thread_id') ?? undefined,
    since: params.get('since'),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  }

  // No thread check of its own: `chat_messages_select_visible` already returns
  // nothing for a thread the caller cannot read, so an unauthorised thread id
  // yields an empty page rather than a leak. Answering 403 here would require a
  // second membership test — a second answer to a question RLS has answered.
  const messages = await messagesSince(
    session.supabase,
    parsed.data.thread_id,
    parsed.data.since ?? null
  );

  return NextResponse.json({
    messages: await decorate(session.supabase, params.get('project_id'), messages),
  });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, first_name, last_name, company_id')
    .eq('user_id', user.id)
    .eq('is_deleted', false)
    .single();
  if (!profile) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  let parsed;
  try {
    parsed = chatSendSchema.safeParse(await request.json());
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  }
  const input = parsed.data;

  // Thread resolution runs as the caller, so a subcontractor asking for a crew
  // thread gets null here rather than a thread they cannot post in.
  const thread = await resolveThread(supabase, input.project_id, input.kind);
  if (!thread) {
    console.error(
      `[chat] thread resolve refused for user ${user.id} on ${input.project_id}/${input.kind}`
    );
    return NextResponse.json({ error: 'You do not have access to this thread.' }, { status: 403 });
  }

  const sent = await insertMessage(supabase, {
    threadId: thread.id,
    authorProfileId: profile.id,
    body: input.body,
  });
  if (!sent.success) {
    if (sent.denied) {
      console.error(`[chat] RLS refused message insert for ${user.id} on thread ${thread.id}`);
      return NextResponse.json({ error: 'You cannot post in this thread.' }, { status: 403 });
    }
    console.error(`[chat] message insert failed: ${sent.error}`);
    return NextResponse.json({ error: sent.error }, { status: 400 });
  }

  // ── ND-22 — the photo references, attached as the CALLER.
  //
  // ⚠️ ELIGIBILITY IS RE-CHECKED HERE, not trusted from the picker. An FK
  // cannot enforce `category = 'photos'` (§4.3), so a crafted request could
  // otherwise attach a contract PDF or a receipt — or a photo from another
  // project — and it would render as a chat thumbnail. A-C17c is the only
  // backstop and this is it.
  //
  // Ineligible ids are DROPPED rather than failing the send: the message is the
  // business event and it already exists. `attachedPhotos` travels back so the
  // composer can say fewer went than were picked.
  let attachedPhotos = 0;
  if (input.file_ids && input.file_ids.length > 0) {
    const eligible = await eligiblePhotoIds(supabase, input.project_id, input.file_ids);
    if (eligible.length !== input.file_ids.length) {
      console.error(
        `[chat] ${input.file_ids.length - eligible.length} ineligible file id(s) dropped from message ${sent.id}`
      );
    }
    // Order preserved from the caller's selection, not from the eligibility query.
    const ordered = input.file_ids.filter((id) => eligible.includes(id));
    const outcome = await attachPhotos(supabase, sent.id!, ordered);
    if (outcome.error) console.error(`[chat] photo attach failed: ${outcome.error}`);
    attachedPhotos = outcome.attached;
  }

  // ── Everything below is best-effort. The message exists and is the business
  // event; failing to announce it must not undo it (parent's rule, applied).
  const admin = getSupabaseAdmin() as SupabaseClient<Database>;
  let mentioned = 0;
  let emailed = 0;
  let unresolved: string[] = [];

  try {
    const candidates = await postableSet(admin, thread, profile.company_id);
    const parse = parseMentions(input.body, candidates, profile.id);
    unresolved = parse.unresolved;

    if (parse.profileIds.length > 0) {
      await insertMentions(supabase, sent.id!, parse.profileIds);

      const { data: rows } = await admin
        .from('profiles')
        .select('id, role, email')
        .in('id', parse.profileIds);

      const { data: project } = await supabase
        .from('projects').select('name').eq('id', input.project_id).maybeSingle();

      const mentionedRows = (rows ?? []).map((r) => ({
        profileId: r.id,
        role: r.role as CompanyRole,
        email: r.email,
      }));

      const outcome = await notifyMentions({
        admin,
        companyId: profile.company_id,
        projectId: input.project_id,
        projectName: project?.name ?? 'a project',
        threadId: thread.id,
        kind: thread.kind,
        messageId: sent.id!,
        authorName: `${profile.first_name} ${profile.last_name}`.trim(),
        body: input.body,
        mentioned: mentionedRows,
      });
      mentioned = outcome.written;

      // ND-30 / ND-42 — the mention email, SUBS ONLY.
      //
      // ⚠️ ALONGSIDE notify(), NOT INSIDE IT. notify() sends no email and four
      // existing consumers each drive their own; moving this inward would
      // double-send for every one of them.
      //
      // Best-effort like everything else below the message insert: the message
      // is the business event, and failing to announce it must not undo it.
      const emailOutcome = await sendMentionEmails({
        admin,
        companyId: profile.company_id,
        projectId: input.project_id,
        projectName: project?.name ?? 'a project',
        kind: thread.kind,
        messageId: sent.id!,
        authorName: `${profile.first_name} ${profile.last_name}`.trim(),
        body: input.body,
        recipients: mentionedRows,
        origin: request.nextUrl.origin,
      });
      if (emailOutcome.errors.length > 0) {
        console.error(`[chat] mention email errors: ${emailOutcome.errors.join('; ')}`);
      }
      emailed = emailOutcome.sent;
    }
  } catch (err) {
    console.error(
      `[chat] mention pipeline failed for message ${sent.id}:`,
      err instanceof Error ? err.message : 'unknown'
    );
  }

  // `unresolved` travels back so the composer can say "@chris matched two
  // people" rather than silently sending a message that notified nobody.
  return NextResponse.json({
    id: sent.id,
    threadId: thread.id,
    mentioned,
    emailed,
    photos: attachedPhotos,
    unresolved,
  });
}
