import { NextRequest, NextResponse } from 'next/server';
import { chatOpenSchema } from '@framefocus/shared/validation/chat';
import { chatSession } from '../_session';
import { switcherThreads, groupByProject, type SwitcherProject } from '@/lib/chat/switcher';
import { resolveThread } from '@/lib/chat/threads';
import { recentMessages, markThreadRead, PAGE_SIZE } from '@/lib/chat/messages';

/**
 * The switcher list (GET) and opening a thread (POST).
 *
 * Spec: chat-spec.md §7.1a-i (ND-34), §7.2, §7.2a (ND-38).
 */

// ---------------------------------------------------------------------------
// SLICE 3 RENDERS THE CREW THREAD ONLY — AND THIS IS THE ONE PLACE THAT SAYS SO
// ---------------------------------------------------------------------------
// The switcher RPC returns BOTH kinds, because RLS is what decides visibility
// and the RPC is not slice-aware. Slice 3 has no sub-thread UI (§5.2's
// divergence, the banner and the composer suppression are all slice 4), so a
// sub thread reaching the panel would open a crew-shaped view over a sub-shaped
// thread: a composer that every non-postable role would watch 403. That is
// M6M D-54 inverted — a visible button that is not a permission — and it is
// worse than either alternative the spec weighs.
//
// Rendering it dead was rejected on the spec's own precedent: §7.1e refuses "a
// disabled second segment" for exactly the analogous case.
//
// ⚠️ AND IT HIDES NOTHING THAT EXISTS. Threads are created lazily, on first
// open or first message (§4.1). Slice 3 asks for `kind: 'crew'` and nothing
// else in the app asks at all, so no sub thread can come into being before
// slice 4 creates one. The filter is therefore a no-op against real data today
// and a guard against a half-built surface tomorrow.
//
// SLICE 4 DELETES THIS CONSTANT AND THE `.filter()` BELOW. Nothing else.
const SLICE_3_KINDS = ['crew'] as const;

export async function GET() {
  const session = await chatSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const threads = (await switcherThreads(session.supabase)).filter((t) =>
    (SLICE_3_KINDS as readonly string[]).includes(t.kind)
  );
  const withThreads = groupByProject(threads);

  // -------------------------------------------------------------------------
  // PROJECTS THAT HAVE NO THREAD ROW YET — WITHOUT THEM THE PANEL IS UNUSABLE
  // -------------------------------------------------------------------------
  // `chat_switcher_threads()` starts `FROM chat_threads`, so it can only return
  // a project that already has one. Threads are lazily created, so on a company
  // that has never used chat the RPC returns zero rows and the switcher opens
  // onto an empty list with no way to start a conversation anywhere.
  //
  // §7.1a-i describes the switcher as a list of ACTIVE PROJECTS, ordered by
  // most recent message, in which "a project with no messages sorts last — it
  // has nothing to return to". A project with no thread is that case, one step
  // earlier.
  //
  // ⚠️ MEMBERSHIP IS NOT RE-DERIVED HERE, WHICH §7.1a-i EXPLICITLY FORBIDS.
  // This is a plain `projects` select under the CALLER'S OWN RLS, and
  // `projects_select_visible` is
  //   company_id = get_my_company_id()
  //   AND (get_my_role() = ANY(ARRAY['owner','admin']) OR is_assigned_to_project(id))
  // — the same predicate as `can_view_project()`'s body, verified against the
  // live policy. So the set comes from the helper, not from a second answer to
  // the question of who can read a thread.
  const seen = new Set(withThreads.map((p) => p.projectId));
  const extra: SwitcherProject[] = [];

  // A subcontractor is excluded from the crew thread absolutely (ND-19), so
  // offering them a "start a conversation" row on every project they are
  // assigned to would offer a thread the database will refuse to create. Their
  // surface is the sub thread, and that is slice 4. Same clause the crew
  // thread's own policy uses: `get_my_role() IS DISTINCT FROM 'subcontractor'`.
  if (session.role !== 'subcontractor') {
    const { data: projects } = await session.supabase
      .from('projects')
      .select('id, name')
      .eq('status', 'active')
      .eq('is_deleted', false);

    for (const p of projects ?? []) {
      if (seen.has(p.id)) continue;
      extra.push({
        projectId: p.id,
        projectName: p.name,
        threads: [],
        unreadCount: 0,
        lastMessageAt: null,
      });
    }
  }

  // The RPC already ordered by the project's most recent activity. Everything
  // with no activity — an empty thread or no thread at all — sorts after it, by
  // name, so the two flavours of "nothing here yet" interleave sensibly instead
  // of the threadless ones being stranded below empty threads.
  const active = withThreads.filter((p) => p.lastMessageAt !== null);
  const quiet = [...withThreads.filter((p) => p.lastMessageAt === null), ...extra].sort((a, b) =>
    a.projectName.localeCompare(b.projectName)
  );

  return NextResponse.json({ projects: [...active, ...quiet] });
}

/**
 * Open a thread: resolve-or-create, mark it read, hand back the first page.
 *
 * One round trip because all three happen together every single time a thread
 * is opened, and splitting them would let a build open a thread without marking
 * it read — which reads as "the unread badge is broken" and is very hard to
 * spot.
 */
export async function POST(request: NextRequest) {
  const session = await chatSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  let parsed;
  try {
    parsed = chatOpenSchema.safeParse(await request.json());
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  }
  const input = parsed.data;

  // Runs as the caller, so RLS answers. A subcontractor asking for a crew
  // thread gets null — ND-19 working, not a fault (threads.ts's own note).
  const thread = await resolveThread(session.supabase, input.project_id, input.kind);
  if (!thread) {
    console.error(
      `[chat] thread open refused for user ${session.userId} on ${input.project_id}/${input.kind}`
    );
    return NextResponse.json({ error: 'You do not have access to this thread.' }, { status: 403 });
  }

  const limit = PAGE_SIZE[input.surface];
  const messages = await recentMessages(session.supabase, thread.id, limit);

  // §7.2 — "Opening a thread writes chat_reads.last_read_at for that thread."
  // Server-stamped by the RPC; see markThreadRead's note on the two clocks.
  await markThreadRead(session.supabase, thread.id);

  return NextResponse.json({ thread, messages, pageSize: limit });
}
