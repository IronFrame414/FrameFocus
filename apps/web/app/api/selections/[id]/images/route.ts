import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { signSelectionOptionImages } from '@/lib/services/selections';

// S172 — option images through the SECURITY DEFINER read. The caller's own
// client runs the RPC (so "can you see this selection" is decided by the
// function, for staff and client alike); an empty object is what a caller who
// cannot see it receives — the same answer as "no images", on purpose.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  return NextResponse.json(await signSelectionOptionImages(params.id, supabase));
}
