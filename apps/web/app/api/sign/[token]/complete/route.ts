import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import { completeSignatureSchema } from '@framefocus/shared/validation/signing';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { completeSignature } from '@/lib/services/signing-service';

// Spec 2 (4F) — public signature completion. Records the signature
// + ESIGN audit trail, composites the signed PDF into Module 3,
// moves the estimate to `accepted`, and notifies Owner/Admin.

export async function POST(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  let parsed;
  try {
    parsed = completeSignatureSchema.safeParse(await request.json());
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  }

  const admin = getSupabaseAdmin() as SupabaseClient<Database>;
  const forwardedFor = request.headers.get('x-forwarded-for');

  const result = await completeSignature(admin, params.token, {
    signatureType: parsed.data.signature_type,
    signatureData: parsed.data.signature_data,
    signerName: parsed.data.signer_name,
    signerIp: forwardedFor ? forwardedFor.split(',')[0].trim() : null,
    signerUserAgent: request.headers.get('user-agent'),
  });

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 409 });
  }
  return NextResponse.json({ success: true });
}
