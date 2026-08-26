import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { getPortalIdentity } from '@/lib/services/portal';
import { setClientSelectionPicks } from '@/lib/services/selection-lifecycle-service';

/**
 * S175 stage 7 — the client PICKS. The third and last of the portal's write
 * surfaces, alongside `sign-selection` and `decline-selection`, and shaped like
 * both of them on purpose: resolve the portal identity, require full access,
 * hand the work to the service, relay the service's own sentence on refusal.
 *
 * ⚠️ A ROUTE AND NOT A DIRECT `supabase.rpc()` FROM THE BROWSER. The RPC is
 * granted to `authenticated` and would work either way. The portal's other two
 * writes are routes, and the reason is `accessLevel`: `getPortalIdentity()` is
 * the one place that resolves it, the "your portal access does not allow this"
 * sentence is written once, and a documents-only client gets that sentence
 * rather than a bare policy refusal she cannot act on.
 *
 * The picks REPLACE the selection's set. The body carries the full list, not a
 * delta, for `selection_client_pick()`'s reason: moving a single-choice pick
 * from A to B is one statement, not two that can half-fail.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const identity = await getPortalIdentity(supabase);
  if (!identity) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (identity.accessLevel !== 'full') {
    return NextResponse.json({ error: 'Your portal access does not allow this.' }, { status: 403 });
  }

  let selectionId = '';
  let optionIds: string[] = [];
  try {
    const raw = await request.json();
    selectionId = String(raw?.selectionId ?? '').trim();
    const list = Array.isArray(raw?.optionIds) ? raw.optionIds : [];
    optionIds = list.map((v: unknown) => String(v ?? '').trim()).filter(Boolean);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!selectionId) return NextResponse.json({ error: 'A selection is required.' }, { status: 400 });

  const result = await setClientSelectionPicks(supabase, selectionId, optionIds);
  if (!result.success) {
    console.error('[portal/pick-selection] refused', selectionId, result.error);
    return NextResponse.json({ error: result.error }, { status: 409 });
  }
  return NextResponse.json({ success: true, selectionId, chosen: result.chosen });
}
