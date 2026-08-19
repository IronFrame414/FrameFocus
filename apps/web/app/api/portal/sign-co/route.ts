import { NextRequest, NextResponse } from 'next/server';
import { completeSignatureSchema } from '@framefocus/shared/validation/signing';
import { createClient } from '@/lib/supabase-server';
import { getPortalIdentity } from '@/lib/services/portal';
import { signChangeOrderFromPortal } from '@/lib/services/portal-writes';

/**
 * M9 R10 — the portal's change-order signature.
 *
 * ⚠️ THE SECOND ENTRY TO ONE WRITE PATH, NOT A SECOND WRITE PATH.
 * §7.1: *"The portal must call THE SAME signature write the tokenised route
 * calls. A second implementation that 'does the same thing' IS the divergence
 * — that is `#129`'s precedent exactly."*
 *
 * So this route validates with **the same `completeSignatureSchema`** that
 * `/api/sign-co/[token]/complete` uses, and hands off to
 * `signChangeOrderFromPortal()`, whose only job is to establish authorisation
 * and a session before calling `completeCoSignature()`. Every downstream
 * consequence — the v2 PDF, the CO flip, `apply_change_order_budget`, the
 * in-app notification, the emails — happens because it is the same function,
 * not because this route remembered to do them.
 *
 * The two callers are told apart in the record by `caller: 'portal_session'`
 * (Q6), which is the point of that parameter.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const identity = await getPortalIdentity(supabase);
  if (!identity) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  let parsed;
  let changeOrderId: string;
  try {
    const raw = await request.json();
    changeOrderId = String(raw?.changeOrderId ?? '').trim();
    parsed = completeSignatureSchema.safeParse(raw);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!changeOrderId) {
    return NextResponse.json({ error: 'A change order is required.' }, { status: 400 });
  }
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  }

  // Her own contact row, for the session's recipient fields. Readable through
  // `contacts_select_client_own`; a null is not fatal, it only leaves the
  // session's recipient blank on a CO she is signing in person.
  let contactEmail: string | null = null;
  if (identity.contactId) {
    const { data } = await supabase
      .from('contacts')
      .select('email')
      .eq('id', identity.contactId)
      .maybeSingle();
    contactEmail = (data as { email: string | null } | null)?.email ?? null;
  }

  const forwardedFor = request.headers.get('x-forwarded-for');

  const result = await signChangeOrderFromPortal(supabase, {
    changeOrderId,
    profileId: identity.profileId,
    contactEmail,
    signature: {
      signatureType: parsed.data.signature_type,
      signatureData: parsed.data.signature_data,
      signerName: parsed.data.signer_name,
      signerIp: forwardedFor ? forwardedFor.split(',')[0].trim() : null,
      signerUserAgent: request.headers.get('user-agent'),
    },
  });

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 409 });
  }
  return NextResponse.json({ success: true, changeOrderId: result.id });
}
