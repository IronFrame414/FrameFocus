import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { getStripe } from '@/lib/stripe';
import { getResubscribeContext } from '@/lib/trial/resubscribe';
import { seatLimitFor } from '@/lib/billing/plan-catalog';
import { getPriceId } from '@/lib/billing/price-ids';

// Checkout for a LOCKED account [Q1a] — the resubscribe token stands in for
// the session, because the audience is banned from holding one. The token is
// validated by the SAME `getResubscribeContext()` as the page; everything
// downstream (metadata shape, webhook unlock on checkout.session.completed)
// is the existing /api/stripe/checkout path unchanged, so a resubscribe
// payment unlocks through the very same four-path machinery as any other.
//
// Unauthenticated requests pass the middleware lock guard because that guard
// only inspects requests WITH a user — by design; this route's own validation
// is the token.

export async function POST(request: NextRequest) {
  try {
    const { token, plan } = (await request.json()) as { token?: string; plan?: string };
    if (typeof token !== 'string' || typeof plan !== 'string') {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }

    const admin = getSupabaseAdmin() as SupabaseClient<Database>;
    const ctx = await getResubscribeContext(admin, token, new Date());
    if (!ctx) {
      // Neutral, like the page: which check failed is not disclosed.
      return NextResponse.json({ error: 'This link is no longer valid' }, { status: 403 });
    }

    const priceId = getPriceId(plan);
    const seatLimit = seatLimitFor(plan);
    if (!priceId || seatLimit === null) {
      return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });
    }

    const stripe = getStripe();
    let stripeCustomerId = ctx.stripeCustomerId;
    if (!stripeCustomerId) {
      // A trial that never paid has no Stripe customer yet. The founding
      // owner's email seeds it — ordered, per the S165 .limit(1) rule (the
      // unordered shape in resolveCompanyReplyTo is the one NOT to copy).
      const { data: owner } = await admin
        .from('profiles')
        .select('email')
        .eq('company_id', ctx.companyId)
        .eq('role', 'owner')
        .eq('is_deleted', false)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      const customer = await stripe.customers.create({
        email: (owner as { email: string | null } | null)?.email ?? undefined,
        name: ctx.companyName,
        metadata: { company_id: ctx.companyId },
      });
      stripeCustomerId = customer.id;
      await admin
        .from('companies')
        .update({ stripe_customer_id: stripeCustomerId })
        .eq('id', ctx.companyId);
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://frame-focus-eight.vercel.app';

    // No trial_period_days branch, deliberately: this audience's trial is
    // over — carrying "remaining trial days" over would resurrect it.
    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${baseUrl}/resubscribe/success`,
      cancel_url: `${baseUrl}/resubscribe?token=${token}`,
      metadata: {
        company_id: ctx.companyId,
        plan_tier: plan,
        seat_limit: String(seatLimit),
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error('Resubscribe checkout error:', error);
    return NextResponse.json({ error: 'Failed to create checkout session' }, { status: 500 });
  }
}
