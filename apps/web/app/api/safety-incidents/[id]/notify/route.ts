import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import type { CompanyRole } from '@framefocus/shared';
import { getFailedIncidentEmails, getIncident } from '@/lib/services/safety';
import {
  computeIncidentRecipients,
  sendIncidentNotifications,
} from '@/lib/services/incident-notify';

// 6C §4 / open item #5 — Owner/Admin retry for failed notification sends
// (Phase 3 Q6: Owner AND Admin). Recomputes the hierarchy from the ORIGINAL
// reporter's role and resends ONLY to recipients whose latest attempt
// failed — nobody gets a duplicate.

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, company_id')
    .eq('user_id', user.id)
    .eq('is_deleted', false)
    .single();
  if (!profile || !['owner', 'admin'].includes(profile.role)) {
    return NextResponse.json(
      { error: 'Only Owner or Admin can retry incident notifications' },
      { status: 403 }
    );
  }

  const incident = await getIncident(params.id);
  if (!incident || incident.is_deleted) {
    return NextResponse.json({ error: 'Incident not found' }, { status: 404 });
  }

  const failed = await getFailedIncidentEmails(params.id);
  if (failed.length === 0) return NextResponse.json({ resent: 0 });

  const admin = getSupabaseAdmin();

  // The reporter's role anchors the hierarchy — not the retrying admin's.
  const { data: reporterMember } = await admin
    .from('company_members')
    .select('profile:profiles(role, email)')
    .eq('id', incident.reported_by_member_id)
    .maybeSingle();
  const reporterProfile = (
    reporterMember as unknown as { profile: { role: string; email: string } | null } | null
  )?.profile;
  const reporterRole = (reporterProfile?.role ?? 'crew_member') as CompanyRole;

  const allRecipients = await computeIncidentRecipients(
    admin,
    profile.company_id,
    reporterRole,
    reporterProfile?.email ?? null
  );
  const failedEmails = new Set(failed.map((f) => f.email));
  const retryTargets = allRecipients.filter((r) => failedEmails.has(r.email));

  const { data: company } = await supabase
    .from('companies')
    .select('name, slug, brand_color')
    .eq('id', profile.company_id)
    .single();
  if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 });

  const emailErrors = await sendIncidentNotifications({
    admin,
    recipients: retryTargets,
    incident,
    company,
    origin: request.nextUrl.origin,
  });

  return NextResponse.json({
    resent: retryTargets.length - emailErrors.length,
    emailErrors: emailErrors.length > 0 ? emailErrors : undefined,
  });
}
