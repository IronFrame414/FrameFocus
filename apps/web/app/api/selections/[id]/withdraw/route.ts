import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { withdrawSelectionOffer } from '@/lib/services/selection-lifecycle-service';

// S171 stage 4 — withdraw. Gated by the CALLER'S RLS UPDATE on `selections`
// inside the service (a zero-row update is a refusal, mutation-result.ts); the
// route adds only "is someone signed in".
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  const result = await withdrawSelectionOffer(supabase, params.id);
  if (!result.success) {
    console.error('[selections/withdraw] refused', params.id, result.error);
    return NextResponse.json({ error: result.error }, { status: 409 });
  }
  return NextResponse.json(result);
}
