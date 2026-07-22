import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { regenerateDailyLogPdf } from '@/lib/services/daily-log-pdf-service';

// 6B — generate/regenerate a daily log's PDF (6B-1 §2.3). Called after create
// and after every edit. Authority mirrors the live daily_logs UPDATE policy
// (Phase 3 Q1): the author, or Owner/Admin. Auth failures return 401/403 with
// their own message; "not found" means auth passed and the log genuinely is
// not visible (RLS) or does not exist — per the CLAUDE.md API error rules.

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
    console.error(`[daily-logs/pdf] no profile for user ${user.id}`);
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  // RLS-scoped fetch — cross-tenant and non-visible ids 404 here.
  const { data: log } = await supabase
    .from('daily_logs')
    .select('id, author_member_id, is_deleted')
    .eq('id', params.id)
    .maybeSingle();
  if (!log || log.is_deleted) {
    return NextResponse.json({ error: 'Daily log not found' }, { status: 404 });
  }

  const isAdminRole = ['owner', 'admin'].includes(profile.role);
  if (!isAdminRole) {
    const { data: myMember } = await supabase
      .from('company_members')
      .select('id')
      .eq('profile_id', profile.id)
      .eq('is_deleted', false)
      .maybeSingle();
    if (!myMember || myMember.id !== log.author_member_id) {
      console.error(
        `[daily-logs/pdf] member ${myMember?.id ?? 'none'} is not author of log ${params.id} and role ${profile.role} is not owner/admin`
      );
      return NextResponse.json(
        { error: 'Only the log author or an Owner/Admin can regenerate the PDF' },
        { status: 403 }
      );
    }
  }

  const admin = getSupabaseAdmin();
  const { fileId, error } = await regenerateDailyLogPdf(supabase, admin, params.id);
  if (error) {
    console.error(`[daily-logs/pdf] generation failed for log ${params.id}: ${error}`);
    return NextResponse.json({ error: 'PDF generation failed' }, { status: 500 });
  }
  return NextResponse.json({ fileId });
}
