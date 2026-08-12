import { NextRequest, NextResponse } from 'next/server';
import { chatOpenSchema } from '@framefocus/shared/validation/chat';
import { chatSession } from '../_session';
import { switcherThreads, groupByProject, type SwitcherProject } from '@/lib/chat/switcher';
import { resolveThread, canPostInThread, subThreadProjects } from '@/lib/chat/threads';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { recentMessages, markThreadRead, withAuthors, PAGE_SIZE } from '@/lib/chat/messages';
import { withPhotos } from '@/lib/chat/photos';
import { adminAuthorResolver } from '@/lib/chat/authors';

/**
 * The switcher list (GET) and opening a thread (POST).
 *
 * Spec: chat-spec.md §7.1a-i (ND-34), §7.2, §7.2a (ND-38).
 */

// ---------------------------------------------------------------------------
// ✅ SLICE 4: BOTH THREADS. Slice 3's crew-only filter is DELETED.
// ---------------------------------------------------------------------------
// _Superseded, quoted not rewritten: `const SLICE_3_KINDS = ['crew'] as const;`
// and the `.filter()` that used it._ Slice 3 carried it because it had no
// sub-thread UI, so a sub thread reaching the panel would have opened a
// crew-shaped view over a sub-shaped thread — a composer that non-postable
// roles would watch 403, which is M6M D-54 inverted.
//
// Slice 4 builds the divergence, so the filter goes and the switcher tells the
// truth about what exists. What replaces it is NOT another filter: it is
// `kinds` below, which says which SEGMENTS a project offers this caller.

export async function GET() {
  const session = await chatSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const [threads, subEligible] = await Promise.all([
    switcherThreads(session.supabase),
    subThreadProjects(session.supabase),
  ]);
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

  // The RPC already ordered by the project's most recent activity. Everything
  // with no activity — an empty thread or no thread at all — sorts after it, by
  // name, so the two flavours of "nothing here yet" interleave sensibly instead
  // of the threadless ones being stranded below empty threads.
  const active = withThreads.filter((p) => p.lastMessageAt !== null);
  const quiet = [...withThreads.filter((p) => p.lastMessageAt === null), ...extra].sort((a, b) =>
    a.projectName.localeCompare(b.projectName)
  );

  // -------------------------------------------------------------------------
  // WHICH SEGMENTS A PROJECT OFFERS THIS CALLER — §7.1e, ND-25
  // -------------------------------------------------------------------------
  // Computed here rather than in the component, because both halves are role
  // rules and the component is not the place role rules live:
  //
  //   crew  — everyone EXCEPT a subcontractor. The same clause the crew
  //           thread's own policy opens with, `get_my_role() IS DISTINCT FROM
  //           'subcontractor'` (ND-19, the one absolute in §5.2's table).
  //   sub   — only where an assigned subcontractor WITH a profile exists
  //           (ND-25), which `chat_sub_thread_projects()` answers.
  //
  // §7.1e: two segments where both exist; where only one does, **no segmented
  // control at all — and not a disabled second segment**. A project offering an
  // empty list is dropped entirely, which is the case a SUBCONTRACTOR hits on a
  // project whose sub thread does not exist: they cannot read the crew thread
  // either, so there is nothing there for them.
  const withKinds = [...active, ...quiet]
    .map((p) => ({
      ...p,
      kinds: [
        ...(session.role !== 'subcontractor' ? (['crew'] as const) : []),
        ...(subEligible.has(p.projectId) ? (['sub'] as const) : []),
      ],
    }))
    .filter((p) => p.kinds.length > 0);

  return NextResponse.json({ projects: withKinds });
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
  const [rawMessages, canPost] = await Promise.all([
    recentMessages(session.supabase, thread.id, limit),
    // §7.4 / D-54 — the DATABASE decides whether a composer renders. A crew
    // member opening the sub thread gets `false` here and sees the banner
    // instead; the composer is not in the DOM at all (A-C7).
    canPostInThread(session.supabase, thread.id),
  ]);

  // §7.2 — "Opening a thread writes chat_reads.last_read_at for that thread."
  // Server-stamped by the RPC; see markThreadRead's note on the two clocks.
  await markThreadRead(session.supabase, thread.id);

  // ⚠️ AUTHOR NAMES FROM THE SERVICE ROLE — Ruling B [S131]. The first page
  // needs this as much as the poll does: opening a sub thread is precisely
  // where a subcontractor meets another sub's messages, and the embedded join
  // this replaces was filtered by the caller's own roster floor. Rationale and
  // the reason a decoration is not a hole: `lib/chat/authors.ts`.
  const messages = await withAuthors(
    rawMessages,
    adminAuthorResolver(getSupabaseAdmin() as SupabaseClient<Database>)
  );

  // ND-22 — the first page carries its photo references too, so a thread that
  // opens on a photo message does not render text-only and then pop thumbnails
  // in on the first poll.
  const { getProjectPhotos } = await import('@/lib/services/photos');
  const withRefs = await withPhotos(session.supabase, messages, () =>
    getProjectPhotos(input.project_id)
  );

  return NextResponse.json({ thread, messages: withRefs, pageSize: limit, canPost });
}
