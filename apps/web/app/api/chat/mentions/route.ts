import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import { ROLE_LABELS, type CompanyRole } from '@framefocus/shared';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { chatSession } from '../_session';
import { resolveThread, postableSet } from '@/lib/chat/threads';
import { insertTokenFor } from '@/lib/chat/mentions';

/**
 * The mention picker's list — §7.5.
 *
 * ---------------------------------------------------------------------------
 * THE SET COMES FROM `postableSet()`. IT IS NOT COMPUTED HERE.
 * ---------------------------------------------------------------------------
 * §7.5: "Lists the POSTABLE set for that thread (§5.2)" — postable, not
 * readable, and the difference is the feature. Crew can read a sub thread and
 * cannot post in it, so offering crew there would make them mentionable in a
 * thread they cannot answer in (§3d: "a dead end"). `postableSet()` already
 * encodes that, and re-deriving it in a component is precisely the #129 shape
 * this spec keeps warning about.
 *
 * This route adds exactly two things the picker needs and the parser does not:
 * a display NAME and ROLE, and the token to insert.
 */

export async function GET(request: NextRequest) {
  const session = await chatSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const projectId = request.nextUrl.searchParams.get('project_id');
  const kind = request.nextUrl.searchParams.get('kind');
  if (!projectId || (kind !== 'crew' && kind !== 'sub')) {
    return NextResponse.json({ error: 'project_id and kind are required' }, { status: 400 });
  }

  // Resolved as the CALLER so RLS gates the request before the service role is
  // used for anything. Without this, a client-supplied thread would let anyone
  // enumerate the postable roster of a project they cannot see — `postableSet`
  // runs as admin by design (working out who MAY be mentioned is not the same
  // act as reading the thread) and would answer happily.
  const thread = await resolveThread(session.supabase, projectId, kind);
  if (!thread) {
    console.error(
      `[chat] mention list refused for user ${session.userId} on ${projectId}/${kind}`
    );
    return NextResponse.json({ error: 'You do not have access to this thread.' }, { status: 403 });
  }

  const admin = getSupabaseAdmin() as SupabaseClient<Database>;
  const candidates = await postableSet(admin, thread, session.companyId);

  // Names for the ids the postable set returned — a decoration of that set,
  // never a second query that could return a different set.
  const { data: profiles } = await admin
    .from('profiles')
    .select('id, first_name, last_name, role')
    .in(
      'id',
      candidates.map((c) => c.profileId)
    );

  const byId = new Map((profiles ?? []).map((p) => [p.id, p]));

  const people = candidates
    // §5.1 — a self-mention notifies nobody, so offering yourself in the picker
    // would be offering a no-op. The parser drops it either way; this stops the
    // UI promising something the parser will discard.
    .filter((c) => c.profileId !== session.profileId)
    .map((c) => {
      const p = byId.get(c.profileId);
      const name = p ? `${p.first_name} ${p.last_name}`.trim() : 'Unknown';
      return {
        profileId: c.profileId,
        name,
        role: p ? (ROLE_LABELS[p.role as CompanyRole] ?? p.role) : '',
        // null when this person has no unambiguous token — the picker must say
        // so rather than insert a mention that resolves to nobody. See
        // insertTokenFor's note; §2.4 is why it matters this much.
        token: insertTokenFor(c, candidates),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return NextResponse.json({ people });
}
