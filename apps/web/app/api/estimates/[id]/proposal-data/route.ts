import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { getProposalData } from '@/lib/proposal/proposal-data';

// 19a Review & Send — the server-side proposal data for the sheet's preview
// pane. It calls the SAME getProposalData the /proposal route uses, with the
// SAME server client and RLS, so the sheet and /proposal (and the send PDF)
// render from one source of truth — they cannot drift. Role gate mirrors
// /proposal (Owner/Admin/PM; RLS scopes PM to their own).

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    console.warn(`[proposal-data] unauthenticated request for estimate ${params.id}`);
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('user_id', user.id)
    .eq('is_deleted', false)
    .single();
  if (!profile || !['owner', 'admin', 'project_manager'].includes(profile.role)) {
    console.warn(`[proposal-data] forbidden role for estimate ${params.id}: ${profile?.role}`);
    return NextResponse.json({ error: 'You cannot view this proposal.' }, { status: 403 });
  }

  const data = await getProposalData(supabase, params.id);
  if (!data) {
    // Auth passed; the record genuinely isn't visible/doesn't exist.
    return NextResponse.json({ error: 'Estimate not found.' }, { status: 404 });
  }

  return NextResponse.json(data);
}
