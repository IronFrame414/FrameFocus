import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

// S108 Spec A — record a site visit.
//
// The visit is created by create_site_visit() ON THE CALLER'S SESSION: the RPC
// decides who may (any internal role) and writes no money.
//
// [2026-09-23, ruling 1 — ASK-A4 amended] It NO LONGER notifies the office.
// Creation is the moment nothing has been captured yet; the office is told at
// FINISH instead (/api/site-visits/[id]/finish). This route stays the create
// path so the phone's client code is unchanged.

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

  return NextResponse.json({ id: estimateId });
}
