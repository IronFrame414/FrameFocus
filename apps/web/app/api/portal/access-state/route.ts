import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { setClientAccessState } from '@/lib/services/client-portal';
import {
  CLIENT_ACCESS_STATES,
  type ClientAccessState,
} from '@/lib/services/client-portal-shared';

/**
 * M9 R17 — change a client's portal access state.
 *
 * ⚠️ NO ROLE CHECK HERE, AND THAT IS DELIBERATE. Unlike the invite route, the
 * gate for this write is `profiles_update_owner` / `profiles_update_admin` —
 * `profiles` has **no self-update arm**, so a client cannot change her own
 * state and neither can a PM. `setClientAccessState()` writes through the
 * caller's client and returns `DISCARDED` when RLS refuses the row, which is a
 * refusal with the same shape as a 403 and one the service already words.
 *
 * Adding a TypeScript role list on top would create a second definition of who
 * may do this, and the two would eventually disagree — with the TypeScript one
 * winning on the screen and the SQL one winning everywhere else.
 *
 * What IS checked here is the state string, because an unknown value would
 * otherwise reach a CHECK constraint and come back as a Postgres error rather
 * than a sentence.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  let body: { profileId?: string; state?: string; reason?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const profileId = (body.profileId ?? '').trim();
  const state = (body.state ?? '').trim();
  if (!profileId || !state) {
    return NextResponse.json({ error: 'A portal account and a state are required.' }, { status: 400 });
  }
  if (!(CLIENT_ACCESS_STATES as readonly string[]).includes(state)) {
    return NextResponse.json({ error: `Unknown access state: ${state}` }, { status: 400 });
  }

  const result = await setClientAccessState(supabase, {
    profileId,
    state: state as ClientAccessState,
    reason: body.reason?.trim() || undefined,
  });

  if (!result.success) {
    console.error('portal access state refused', {
      route: 'POST /api/portal/access-state',
      profileId,
      state,
      message: result.error,
    });
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true, state });
}
