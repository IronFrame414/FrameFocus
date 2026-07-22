import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { regenerateIncidentPdf } from '@/lib/services/incident-pdf-service';

// 6C §7 — regenerate the incident PDF (called after every edit; also the
// manual "Generate PDF" fallback). Authority mirrors the live RLS: the
// reporter, or Owner/Admin.

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
  if (!profile) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { data: incident } = await supabase
    .from('safety_incidents')
    .select('id, reported_by_member_id, is_deleted')
    .eq('id', params.id)
    .maybeSingle();
  if (!incident || incident.is_deleted) {
    return NextResponse.json({ error: 'Incident not found' }, { status: 404 });
  }

  if (!['owner', 'admin'].includes(profile.role)) {
    const { data: myMember } = await supabase
      .from('company_members')
      .select('id')
      .eq('profile_id', profile.id)
      .eq('is_deleted', false)
      .maybeSingle();
    if (!myMember || myMember.id !== incident.reported_by_member_id) {
      console.error(
        `[safety-incidents/pdf] member ${myMember?.id ?? 'none'} is not reporter of ${params.id} and role ${profile.role} is not owner/admin`
      );
      return NextResponse.json(
        { error: 'Only the reporter or an Owner/Admin can regenerate the PDF' },
        { status: 403 }
      );
    }
  }

  const { fileId, error } = await regenerateIncidentPdf(supabase, getSupabaseAdmin(), params.id);
  if (error) {
    console.error(`[safety-incidents/pdf] generation failed for ${params.id}: ${error}`);
    return NextResponse.json({ error: 'PDF generation failed' }, { status: 500 });
  }
  return NextResponse.json({ fileId });
}
