import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { getPortalIdentity } from '@/lib/services/portal';
import { declineSelection } from '@/lib/services/selection-lifecycle-service';

/** S171 stage 4 — the client DECLINES: the selection returns to draft (Q9). */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const identity = await getPortalIdentity(supabase);
  if (!identity) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (identity.accessLevel !== 'full') {
    return NextResponse.json({ error: 'Your portal access does not allow this.' }, { status: 403 });
  }
  let selectionId = '';
  let notes: string | null = null;
  try {
    const raw = await request.json();
    selectionId = String(raw?.selectionId ?? '').trim();
    notes = typeof raw?.notes === 'string' && raw.notes.trim() ? String(raw.notes).slice(0, 2000) : null;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!selectionId) return NextResponse.json({ error: 'A selection is required.' }, { status: 400 });
  const result = await declineSelection(supabase, selectionId, {
    caller: { kind: 'portal_session', profileId: identity.profileId },
    notes,
  });
  if (!result.success) {
    console.error('[portal/decline-selection] refused', selectionId, result.error);
    return NextResponse.json({ error: result.error }, { status: 409 });
  }
  return NextResponse.json({ success: true, selectionId });
}
