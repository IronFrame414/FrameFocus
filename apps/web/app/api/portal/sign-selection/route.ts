import { NextRequest, NextResponse } from 'next/server';
import { completeSignatureSchema } from '@framefocus/shared/validation/signing';
import { createClient } from '@/lib/supabase-server';
import { getPortalIdentity } from '@/lib/services/portal';
import { completeSelectionSignature } from '@/lib/services/selection-lifecycle-service';

/**
 * S171 stage 4 — the client SIGNS a selection from her portal (Q4: this IS the
 * binding instrument; no CO is generated). Mirrors /api/portal/sign-co: resolve
 * the portal identity, validate the same signature schema, hand the M9
 * caller-context to the one write path. The portal PAGE that calls this is
 * stage 7; until then the route is exercised by the live harness.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const identity = await getPortalIdentity(supabase);
  if (!identity) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (identity.accessLevel !== 'full') {
    return NextResponse.json({ error: 'Your portal access does not allow signing.' }, { status: 403 });
  }
  let parsed;
  let selectionId: string;
  try {
    const raw = await request.json();
    selectionId = String(raw?.selectionId ?? '').trim();
    parsed = completeSignatureSchema.safeParse(raw);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!selectionId) return NextResponse.json({ error: 'A selection is required.' }, { status: 400 });
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  const forwardedFor = request.headers.get('x-forwarded-for');
  const result = await completeSelectionSignature(supabase, selectionId, {
    signatureType: parsed.data.signature_type,
    signatureData: parsed.data.signature_data,
    signerName: parsed.data.signer_name,
    signerIp: forwardedFor ? forwardedFor.split(',')[0].trim() : null,
    signerUserAgent: request.headers.get('user-agent'),
    caller: { kind: 'portal_session', profileId: identity.profileId },
  });
  if (!result.success) {
    console.error('[portal/sign-selection] refused', selectionId, result.error);
    return NextResponse.json({ error: result.error }, { status: 409 });
  }
  return NextResponse.json({ success: true, selectionId });
}
