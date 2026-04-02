import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { stripe } from '@/lib/stripe';

const PRICE_IDS: Record<string, string> = {
  starter: 'price_XXXXXXXXXXXXX', // ← Replace with your real Starter price ID
  professional: 'price_XXXXXXXXXXXXX', // ← Replace with your real Professional price ID
  business: 'price_XXXXXXXXXXXXX', // ← Replace with your real Business price ID
};

const SEAT_LIMITS: Record<string, number> = {
  starter: 2,
  professional: 5,
  business: 15,
};

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Get profile and company
    const { data: profile } = await supabase
      .from('profiles')
      .select('company_id, role')
      .eq('user_id', user.id)
      .single();

    if (!profile || profile.role !== 'owner') {
      return NextResponse.json({ error: 'Only the Owner can manage billing' }, { status: 403 });
    }

    // Get requested plan
    const { plan } = await request.json();
    const priceId = PRICE_IDS[plan];
    if (!priceId) {
      return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });
    }

    // Get or create Stripe customer
    const { data: company } = await supabase
      .from('companies')
      .select('id, name, stripe_customer_id')
      .eq('id', profile.company_id)
      .single();

    let stripeCustomerId = company?.stripe_customer_id;

    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: company?.name || undefined,
        metadata: {
          company_id: profile.company_id,
          supabase_user_id: user.id,
        },
      });
      stripeCustomerId = customer.id;

      // Save Stripe customer ID to companies table (use service role for this)
      await supabase
        .from('companies')
        .update({ stripe_customer_id: stripeCustomerId })
        .eq('id', profile.company_id);
    }

    // Calculate remaining trial days
    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('trial_end')
      .eq('company_id', profile.company_id)
      .single();

    let trialDays = 0;
    if (subscription?.trial_end) {
      const now = new Date();
      const trialEnd = new Date(subscription.trial_end);
      trialDays = Math.max(
        0,
        Math.ceil((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      );
    }

    // Create Stripe Checkout Session
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://frame-focus-eight.vercel.app';

    const sessionParams: Record<string, any> = {
      customer: stripeCustomerId,
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${baseUrl}/dashboard/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/dashboard/billing/plans`,
      metadata: {
        company_id: profile.company_id,
        plan_tier: plan,
        seat_limit: SEAT_LIMITS[plan].toString(),
      },
    };

    // If trial days remain, carry them over to the Stripe subscription
    if (trialDays > 0) {
      sessionParams.subscription_data = {
        trial_period_days: trialDays,
        metadata: {
          company_id: profile.company_id,
          plan_tier: plan,
          seat_limit: SEAT_LIMITS[plan].toString(),
        },
      };
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error('Checkout error:', error);
    return NextResponse.json({ error: 'Failed to create checkout session' }, { status: 500 });
  }
}
