import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { notifySiteVisitRecorded } from '@/lib/notify/site-visit-notify';

// S108 Spec A — record a site visit.
//
// The visit is created by create_site_visit() ON THE CALLER'S SESSION: the RPC
// decides who may (any internal role) and writes no money. This route exists
// only because the office must be TOLD (ASK-A4), and notify() needs the
// service-role client for push — an RPC cannot call application code. So the
// service-role client is reached ONLY after the session RPC has succeeded.

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const body = (await req.json().catch(() => null)) as {
    title?: string;
    contact_id?: string | null;
    contact_address_id?: string | null;
    new_contact?: Record<string, string> | null;
    new_address?: Record<string, string> | null;
  } | null;
  if (!body) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });

  const { data: estimateId, error } = await supabase.rpc('create_site_visit', {
    p_title: body.title ?? '',
    p_contact_id: body.contact_id ?? null,
    p_contact_address_id: body.contact_address_id ?? null,
    p_new_contact: body.new_contact ?? null,
    p_new_address: body.new_address ?? null,
  });
  if (error || !estimateId) {
    const denied = error?.code === '42501';
    console.error('[POST /api/site-visits] create_site_visit refused', {
      userId: user.id,
      code: error?.code,
      message: error?.message,
    });
    return NextResponse.json(
      { error: error?.message ?? 'Could not record the visit.' },
      { status: denied ? 403 : 400 }
    );
  }

  // Best-effort: a failed notification must not un-record the visit.
  try {
    await notifySiteVisitRecorded(getSupabaseAdmin(), estimateId as string, user.id);
  } catch (e) {
    console.error('[POST /api/site-visits] notify failed', {
      estimateId,
      message: e instanceof Error ? e.message : String(e),
    });
  }
  return NextResponse.json({ id: estimateId });
}
