import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import { createClient } from '@/lib/supabase-server';
import { getStripe } from '@/lib/stripe';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

// Reads request.url and redirects — never static. Explicit so the build does not
// probe it for prerendering (which logs a benign "Dynamic server usage" line).
export const dynamic = 'force-dynamic';

// Card-at-signup success handler [ruled Q2a]. Stripe redirects the browser here
// after the setup checkout. The webhook is the authoritative writer, but it can
// lag the redirect — and bouncing an owner back to "add card" seconds after they
// added one is the worst moment to look broken. So this VERIFIES the session
// server-side and sets `payment_method_on_file` OPTIMISTICALLY, then sends them
// to Company Settings. Idempotent with the webhook (both set the same flag).
//
// ⚠️ `session_id` arrives in a URL the user controls — trust NOTHING about it
// without checking mode, status, and that the company_id we put in the session's
// metadata is the caller's own. The flag write goes through the service role
// because the column is service-only by trigger (20261090000000).
export async function GET(request: NextRequest) {
  const origin = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
  const settings = `${origin}/dashboard/settings`;
  const back = `${origin}/onboarding`;
  try {
    const sessionId = new URL(request.url).searchParams.get('session_id');
    if (!sessionId) return NextResponse.redirect(back);

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.redirect(`${origin}/sign-in`);

    const { data: profile } = await supabase
      .from('profiles')
      .select('company_id, role')
      .eq('user_id', user.id)
      .single();
    if (!profile || profile.role !== 'owner') return NextResponse.redirect(settings);

    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    const ok =
      session.mode === 'setup' &&
      session.status === 'complete' &&
      session.metadata?.company_id === profile.company_id;
    if (!ok) return NextResponse.redirect(back);

    const admin = getSupabaseAdmin() as SupabaseClient<Database>;
    await admin
      .from('companies')
      .update({ payment_method_on_file: true })
      .eq('id', profile.company_id);
    if (session.customer) {
      await admin
        .from('companies')
        .update({ stripe_customer_id: session.customer as string })
        .eq('id', profile.company_id)
        .is('stripe_customer_id', null);
    }
    return NextResponse.redirect(settings);
  } catch (err) {
    console.error('Onboarding complete error:', err);
    return NextResponse.redirect(back);
  }
}
