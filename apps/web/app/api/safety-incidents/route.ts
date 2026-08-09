import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { incidentCreateSchema } from '@framefocus/shared/validation/safety';
import type { CompanyRole } from '@framefocus/shared';
import { getIncident } from '@/lib/services/safety';
import { regenerateIncidentPdf } from '@/lib/services/incident-pdf-service';
import {
  computeIncidentRecipients,
  notifyIncident,
  sendIncidentNotifications,
} from '@/lib/services/incident-notify';

// 6C — create an incident. Atomic via the create_safety_incident RPC
// (SECURITY INVOKER — the deferred injury-invariant trigger requires the
// incident and its injuries in ONE transaction; RLS applies as if the caller
// inserted directly). Then: PDF to M3 Safety, and the HIERARCHY notification
// (§4 as amended — strictly above the submitter, Owner→Admin floor). PDF or
// email failure never rolls back the record.

type UntypedRpc = (
  fn: string,
  args?: Record<string, unknown>
) => PromiseLike<{ data: unknown; error: { message: string } | null }>;

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role, email, company_id')
    .eq('user_id', user.id)
    .eq('is_deleted', false)
    .single();
  if (!profile) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  let parsed;
  try {
    parsed = incidentCreateSchema.safeParse(await request.json());
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  }
  const input = parsed.data;

  // RLS-scoped project check when one is named (project-less is legal, Q3).
  if (input.project_id) {
    const { data: project } = await supabase
      .from('projects')
      .select('id')
      .eq('id', input.project_id)
      .eq('is_deleted', false)
      .maybeSingle();
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  const rpc = supabase.rpc.bind(supabase) as unknown as UntypedRpc;
  const { data: incidentId, error: rpcError } = await rpc('create_safety_incident', {
    p_project_id: input.project_id,
    p_incident_date: input.incident_date,
    p_incident_type: input.incident_type,
    p_description: input.description,
    p_prevention_notes: input.prevention_notes ?? null,
    p_injuries: input.injuries.map((i) => ({
      member_id: i.member_id ?? null,
      injured_name: i.member_id ? null : (i.name?.trim() ?? null),
      treatment_sought: i.treatment_sought,
      treatment_notes: i.treatment_notes ?? null,
    })),
    p_witnesses: input.witnesses.map((w) => ({
      member_id: w.member_id ?? null,
      witness_name: w.member_id ? null : (w.name?.trim() ?? null),
    })),
  });
  if (rpcError || typeof incidentId !== 'string') {
    console.error(`[safety-incidents] create failed: ${rpcError?.message ?? 'no id returned'}`);
    return NextResponse.json({ error: 'Incident creation failed' }, { status: 500 });
  }

  const admin = getSupabaseAdmin();

  // PDF — best-effort; regenerable from the detail view.
  let pdfError: string | null = null;
  try {
    const pdf = await regenerateIncidentPdf(supabase, admin, incidentId);
    pdfError = pdf.error;
  } catch (err) {
    pdfError = err instanceof Error ? err.message : 'PDF generation failed';
  }
  if (pdfError) console.error(`[safety-incidents] PDF failed for ${incidentId}: ${pdfError}`);

  // Hierarchy notification — best-effort; failures land in email_logs and
  // surface as the Owner/Admin retry banner (§4).
  //
  // [S123 slice 3] ONE recipient computation, THREE channels: in-app row, push,
  // and email. The in-app/push pair goes FIRST and deliberately so — it is the
  // channel that reaches a phone in seconds, and email is the slow one (a Resend
  // round trip PER RECIPIENT, inside this request). Ordering it second would put
  // the safety-critical channel behind the slow one for no benefit.
  //
  // Both mobile and desktop capture POST here (app/m/p/[projectId]/safety/new →
  // /api/safety-incidents), so wiring notify() at this single point gives both
  // surfaces identical behaviour by MECHANISM rather than by two implementations
  // that agree today — CLAUDE.md's parity rule, and #129's lesson.
  let emailErrors: string[] = [];
  try {
    const incident = await getIncident(incidentId);
    const { data: company } = await supabase
      .from('companies')
      .select('name, slug, brand_color')
      .eq('id', profile.company_id)
      .single();
    if (incident && company) {
      const recipients = await computeIncidentRecipients(
        admin,
        profile.company_id,
        profile.role as CompanyRole,
        profile.email,
        profile.id
      );

      // ND-5: pushes at ANY hour, every incident type. notify() never throws for
      // a delivery failure, but a bug inside it must not cost the email either.
      try {
        await notifyIncident({ admin, recipients, incident });
      } catch (err) {
        console.error(
          `[safety-incidents] in-app notify failed for ${incidentId}: ${
            err instanceof Error ? err.message : 'unknown'
          }`
        );
      }

      emailErrors = await sendIncidentNotifications({
        admin,
        recipients,
        incident,
        company,
        origin: request.nextUrl.origin,
      });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'notification failed';
    console.error(`[safety-incidents] notification block failed: ${msg}`);
    emailErrors.push(msg);
  }

  return NextResponse.json({
    incidentId,
    pdfError: pdfError ?? undefined,
    emailErrors: emailErrors.length > 0 ? emailErrors : undefined,
  });
}
