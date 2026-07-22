import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { regenerateDeliveryPdf } from '@/lib/services/delivery-pdf-service';

// 6D — generate/regenerate a delivery's record PDF (S90; mechanics mirror
// /api/daily-logs/[id]/pdf). Called after every edit and on demand from the
// detail view. Authority mirrors the live deliveries UPDATE policy: the
// receiver, or Owner/Admin. Auth failures return 401/403 with their own
// message; "not found" means auth passed and the delivery genuinely is not
// visible (RLS) or does not exist — per the CLAUDE.md API error rules.

export async function POST(_request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('user_id', user.id)
    .eq('is_deleted', false)
    .single();
  if (!profile) {
    console.error(`[deliveries/pdf] no profile for user ${user.id}`);
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  // RLS-scoped fetch — cross-tenant and non-visible ids 404 here.
  const { data: delivery } = await supabase
    .from('deliveries')
    .select('id, received_by, is_deleted')
    .eq('id', params.id)
    .maybeSingle();
  if (!delivery || delivery.is_deleted) {
    return NextResponse.json({ error: 'Delivery not found' }, { status: 404 });
  }

  const isAdminRole = ['owner', 'admin'].includes(profile.role);
  if (!isAdminRole) {
    const { data: myMember } = await supabase
      .from('company_members')
      .select('id')
      .eq('profile_id', profile.id)
      .eq('is_deleted', false)
      .maybeSingle();
    if (!myMember || myMember.id !== delivery.received_by) {
      console.error(
        `[deliveries/pdf] member ${myMember?.id ?? 'none'} is not receiver of delivery ${params.id} and role ${profile.role} is not owner/admin`
      );
      return NextResponse.json(
        { error: 'Only the receiver or an Owner/Admin can regenerate the PDF' },
        { status: 403 }
      );
    }
  }

  const { fileId, error } = await regenerateDeliveryPdf(supabase, getSupabaseAdmin(), params.id);
  if (error) {
    console.error(`[deliveries/pdf] generation failed for delivery ${params.id}: ${error}`);
    return NextResponse.json({ error: 'PDF generation failed' }, { status: 500 });
  }
  return NextResponse.json({ fileId });
}
