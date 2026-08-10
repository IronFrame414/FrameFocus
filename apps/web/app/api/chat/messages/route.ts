import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import type { CompanyRole } from '@framefocus/shared';
import { createClient } from '@/lib/supabase-server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { chatSendSchema } from '@framefocus/shared/validation/chat';
import { resolveThread, postableSet } from '@/lib/chat/threads';
import { insertMessage, insertMentions } from '@/lib/chat/messages';
import { parseMentions } from '@/lib/chat/mentions';
import { notifyMentions } from '@/lib/chat/mention-notify';

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

  // ── Everything below is best-effort. The message exists and is the business
  // event; failing to announce it must not undo it (parent's rule, applied).
  const admin = getSupabaseAdmin() as SupabaseClient<Database>;
  let mentioned = 0;
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
        mentioned: (rows ?? []).map((r) => ({
          profileId: r.id,
          role: r.role as CompanyRole,
          email: r.email,
        })),
      });
      mentioned = outcome.written;
    }
  } catch (err) {
    console.error(
      `[chat] mention pipeline failed for message ${sent.id}:`,
      err instanceof Error ? err.message : 'unknown'
    );
  }

  // `unresolved` travels back so the composer can say "@chris matched two
  // people" rather than silently sending a message that notified nobody.
  return NextResponse.json({ id: sent.id, threadId: thread.id, mentioned, unresolved });
}
