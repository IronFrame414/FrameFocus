import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

/**
 * Store (or revive) a Web Push subscription for the signed-in user.
 *
 * Spec: docs/specs/notifications-architecture.md §4.4, §5.2, §5.3.
 *
 * ---------------------------------------------------------------------------
 * WHY THE SUBSCRIPTION IS BOUND TO THE SESSION AND NEVER TO A BODY FIELD
 * ---------------------------------------------------------------------------
 * `profile_id` comes from the SESSION, never from the request body. A body-
 * supplied profile id would let any signed-in user register their own device
 * against somebody else's profile and receive that person's notifications —
 * including the Owner-only text R7 exists to keep from them. The RLS policy
 * (`profile_id = get_my_profile_id()`) is the second lock; this is the first.
 *
 * ---------------------------------------------------------------------------
 * CLAUDE.md → API / Data Layer, on error responses
 * ---------------------------------------------------------------------------
 * "Auth and permission failures return 401/403 with their own message — never
 * fall through to a 'not found' path." Every failure below logs the real cause
 * server-side with the failing check; the client message stays generic.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, company_id')
    .eq('user_id', user.id)
    .eq('is_deleted', false)
    .single();

  if (!profile) {
    console.error('[push/subscribe] no profile for authenticated user', {
      userId: user.id,
      check: 'profiles lookup by user_id',
    });
    return NextResponse.json({ error: 'No profile' }, { status: 403 });
  }

  let body: {
    subscription?: { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
    surface?: string;
    deviceLabel?: string;
    previousEndpoint?: string | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Malformed body' }, { status: 400 });
  }

  const endpoint = body.subscription?.endpoint;
  const p256dh = body.subscription?.keys?.p256dh;
  const auth = body.subscription?.keys?.auth;
  const surface = body.surface;

  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ error: 'Incomplete subscription' }, { status: 400 });
  }
  // ND-4: exactly two surfaces, because there are exactly two workers. Validated
  // here as well as by the CHECK constraint so a bad client gets a 400 rather
  // than a 500 out of Postgres.
  if (surface !== 'mobile' && surface !== 'desktop') {
    return NextResponse.json({ error: 'Unknown surface' }, { status: 400 });
  }

  const admin = getSupabaseAdmin();

  // Upsert on `endpoint`, which carries the unique index. This is what makes
  // re-subscription REVIVE a pruned row rather than collide with its tombstone:
  // a 410 sets is_deleted, and the browser handing us the same endpoint again
  // clears it. See the migration's note on why pruning is soft.
  const { error } = await admin.from('push_subscriptions').upsert(
    {
      company_id: profile.company_id,
      profile_id: profile.id,
      endpoint,
      p256dh,
      auth,
      surface,
      device_label: body.deviceLabel ?? null,
      last_seen_at: new Date().toISOString(),
      is_deleted: false,
      deleted_at: null,
    },
    { onConflict: 'endpoint' }
  );

  if (error) {
    console.error('[push/subscribe] upsert failed', {
      profileId: profile.id,
      surface,
      check: 'push_subscriptions upsert on endpoint',
      error: error.message,
    });
    return NextResponse.json({ error: 'Could not store subscription' }, { status: 500 });
  }

  // `pushsubscriptionchange` hands us the rotated-away endpoint. Retire it, or
  // the next send 410s against a row we already know is dead.
  if (body.previousEndpoint && body.previousEndpoint !== endpoint) {
    await admin
      .from('push_subscriptions')
      .update({ is_deleted: true, deleted_at: new Date().toISOString() })
      .eq('endpoint', body.previousEndpoint)
      .eq('profile_id', profile.id);
  }

  return NextResponse.json({ ok: true });
}

/**
 * Retire a subscription — the user turning push off on this device.
 *
 * Soft, like 410 pruning, and scoped to the caller's own profile so one user
 * cannot unsubscribe another's device by guessing an endpoint.
 */
export async function DELETE(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('user_id', user.id)
    .eq('is_deleted', false)
    .single();

  if (!profile) {
    return NextResponse.json({ error: 'No profile' }, { status: 403 });
  }

  let endpoint: string | undefined;
  try {
    endpoint = (await request.json())?.endpoint;
  } catch {
    return NextResponse.json({ error: 'Malformed body' }, { status: 400 });
  }
  if (!endpoint) {
    return NextResponse.json({ error: 'No endpoint' }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  const { error } = await admin
    .from('push_subscriptions')
    .update({ is_deleted: true, deleted_at: new Date().toISOString() })
    .eq('endpoint', endpoint)
    .eq('profile_id', profile.id);

  if (error) {
    console.error('[push/subscribe] retire failed', {
      profileId: profile.id,
      check: 'push_subscriptions soft delete by endpoint',
      error: error.message,
    });
    return NextResponse.json({ error: 'Could not retire subscription' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
