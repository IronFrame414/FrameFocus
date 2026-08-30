import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

// The project archive [storage-archive-ai-spec §4].
//
// POST — Owner/Admin asks for an archive; a kind='project_archive' job row
// goes into export_jobs and the export worker (every 5 minutes) builds it.
// ⚠️ Worst case ~5 minutes before work STARTS (§S6) — the UI says so.
//
// GET — status + signed part links once complete (24h window, Q6; the links
// die with the sweep's expiry and the answer to hour-23 is regenerating).
//
// ⚠️ The archive NEVER deletes anything. The delete prompt is a separate,
// deliberate act in the UI after the download completes.

async function authorize(request: NextRequest, projectId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) };

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, company_id, role')
    .eq('user_id', user.id)
    .single();
  if (!profile || (profile.role !== 'owner' && profile.role !== 'admin')) {
    return {
      error: NextResponse.json(
        { error: 'Only an Owner or Admin can archive a project' },
        { status: 403 }
      ),
    };
  }

  // The project must be the caller's own — verified against company_id, not
  // trusted from the URL.
  const { data: project } = await supabase
    .from('projects')
    .select('id, company_id')
    .eq('id', projectId)
    .single();
  if (!project || project.company_id !== profile.company_id) {
    return { error: NextResponse.json({ error: 'Project not found' }, { status: 404 }) };
  }
  return { profile, project };
}

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await ctx.params;
  const auth = await authorize(request, projectId);
  if ('error' in auth) return auth.error;

  const admin = getSupabaseAdmin();

  // One live job per project at a time — a second click while one is
  // building returns the existing job rather than queueing a duplicate.
  const { data: existing } = await admin
    .from('export_jobs')
    .select('id, state')
    .eq('project_id', projectId)
    .eq('kind', 'project_archive')
    .in('state', ['pending', 'running'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing) return NextResponse.json({ id: existing.id, state: existing.state });

  const { data: created, error } = await admin
    .from('export_jobs')
    .insert({
      company_id: auth.profile.company_id,
      requested_by: auth.profile.id,
      categories: [],
      kind: 'project_archive',
      project_id: projectId,
      state: 'pending',
    })
    .select('id, state')
    .single();
  if (error || !created) {
    return NextResponse.json({ error: 'Could not queue the archive' }, { status: 500 });
  }
  return NextResponse.json({ id: created.id, state: created.state });
}

export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await ctx.params;
  const auth = await authorize(request, projectId);
  if ('error' in auth) return auth.error;

  const admin = getSupabaseAdmin();
  const { data: job } = await admin
    .from('export_jobs')
    .select('id, state, object_path, expires_at, last_error, created_at')
    .eq('project_id', projectId)
    .eq('kind', 'project_archive')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!job) return NextResponse.json({ state: 'none' });

  if (job.state !== 'complete' || !job.object_path) {
    return NextResponse.json({ id: job.id, state: job.state, error: job.last_error ?? null });
  }

  // Signed links for every part — the trial-export download shape.
  const { data: objects } = await admin.storage.from('exports').list(job.object_path);
  const parts: Array<{ name: string; url: string }> = [];
  for (const o of objects ?? []) {
    const { data: signed } = await admin.storage
      .from('exports')
      .createSignedUrl(`${job.object_path}/${o.name}`, 3600, { download: o.name });
    if (signed?.signedUrl) parts.push({ name: o.name, url: signed.signedUrl });
  }
  return NextResponse.json({
    id: job.id,
    state: job.state,
    expiresAt: job.expires_at,
    parts,
  });
}
