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
//
// ===========================================================================
// EMAIL ONLY. THIS ROUTE MUST NEVER CALL notifyIncident(). [S123 slice 3]
// ===========================================================================
// Since slice 3 an incident also writes in-app rows and pushes (§3c, ND-5), and
// that happened at CREATE time. Those rows are still sitting unread in the
// recipients' lists; a failed *email* says nothing about them. Adding a notify()
// call here would write a second row per recipient, double the badge, and
// re-push an incident everyone was already told about — while the retry banner
// this route serves would still be reporting only the email failure.
//
// This is the same route-name collision that makes the mistake easy: the route
// is called `/notify` and does not notify. It resends email.

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
    .select('profile:profiles(id, role, email)')
    .eq('id', incident.reported_by_member_id)
    .maybeSingle();
  const reporterProfile = (
    reporterMember as unknown as {
      profile: { id: string; role: string; email: string } | null;
    } | null
  )?.profile;
  const reporterRole = (reporterProfile?.role ?? 'crew_member') as CompanyRole;

  // The reporter's PROFILE ID now anchors the self-exclusion. 34 of 41 member
  // rows have no login (the ND-2 finding), so this join legitimately returns a
  // null profile for a member-only reporter — at which point the old
  // email-keyed exclusion compared against null and excluded nobody, mailing
  // the reporter their own incident on retry but not on create. An id compare
  // degrades the same way in both paths.
  const allRecipients = await computeIncidentRecipients(
    admin,
    profile.company_id,
    reporterRole,
    reporterProfile?.email ?? null,
    reporterProfile?.id ?? null
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
