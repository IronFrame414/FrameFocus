import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { notifySiteVisitReadyToPrice } from '@/lib/notify/site-visit-notify';

// S108 follow-up — FINISH a site visit, then tell the office it is ready to
// price [ASK-A4 amended, Josh 2026-09-23, ruling 1].
//
// The finish itself is finish_site_visit() ON THE CALLER'S SESSION: the
// database decides who may (the office, or the recorder while it is still a
// visit) and it writes nothing on `estimates`. This route exists only because
// notify() needs the service-role client for push and an RPC cannot call
// application code — so the service-role client is reached ONLY after the
// session RPC has succeeded.
//
// Notifies on the FIRST finish only: the RPC is idempotent (a second tap keeps
// the first stamp), and so is the office's inbox. "First" is read on the
// session before the RPC runs; the phone disables the button while a finish is
// in flight, so two concurrent first taps are not a path the UI offers.

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { data: before } = await supabase
    .from('site_visits')
    .select('finished_at')
    .eq('estimate_id', params.id)
    .maybeSingle();

  const { data: finishedAt, error } = await supabase.rpc('finish_site_visit', { p_estimate_id: params.id });
  if (error || !finishedAt) {
    const denied = error?.code === '42501';
    console.error('[POST /api/site-visits/[id]/finish] finish_site_visit refused', {
      estimateId: params.id,
      userId: user.id,
      code: error?.code,
      message: error?.message,
    });
    return NextResponse.json({ error: error?.message ?? 'Could not finish the visit.' }, { status: denied ? 403 : 400 });
  }

  const first = !before?.finished_at;
  if (first) {
    // Best-effort: a failed notification must not un-finish the visit.
    try {
      await notifySiteVisitReadyToPrice(getSupabaseAdmin(), params.id, user.id);
    } catch (e) {
      console.error('[POST /api/site-visits/[id]/finish] notify failed', {
        estimateId: params.id,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }
  return NextResponse.json({ finished_at: finishedAt, notified: first });
}
