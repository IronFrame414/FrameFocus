import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { reopenSelection } from '@/lib/services/selection-lifecycle-service';

// S172 — reopen a DENIED selection to draft (company). Gated by the caller's
// RLS UPDATE inside the service.
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  const result = await reopenSelection(supabase, params.id);
  if (!result.success) {
    console.error('[selections/reopen] refused', params.id, result.error);
    return NextResponse.json({ error: result.error }, { status: 409 });
  }
  return NextResponse.json(result);
}
