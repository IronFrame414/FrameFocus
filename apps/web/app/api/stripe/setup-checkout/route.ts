import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { getStripe } from '@/lib/stripe';

// Card-at-signup [§S3/§S8] — a Stripe Checkout session in `mode:'setup'`: stores
// the owner's card, charges nothing, and creates NO subscription. ⚠️ NOT
// subscription-mode-with-trial (`trial_period_days`), which would hand Stripe
// the authority to auto-charge at trial end — §5 forbids that. Modelled on
// /api/stripe/checkout (owner-only, session-auth), minus line_items and the
// trial-days carry-over. The card landing is recorded by the webhook (setup
// branch) and, to beat the webhook race, by /onboarding/complete which verifies
// this session server-side [ruled Q2a].
export async function POST(request: NextRequest) {
  const stripe = getStripe();
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('company_id, role')
      .eq('user_id', user.id)
      .single();
    if (!profile || profile.role !== 'owner') {
      return NextResponse.json(
        { error: 'Only the Owner can add a payment method' },
        { status: 403 }
      );
    }

    const { data: company } = await supabase
      .from('companies')
      .select('id, name, stripe_customer_id')
      .eq('id', profile.company_id)
      .single();

    // Get or create the Stripe customer — same pattern as the subscription
    // checkout. Setting only stripe_customer_id (never payment_method_on_file)
    // keeps this within what the column-scope trigger allows for a user session.
    let stripeCustomerId = company?.stripe_customer_id;
    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: company?.name || undefined,
        metadata: { company_id: profile.company_id, supabase_user_id: user.id },
      });
      stripeCustomerId = customer.id;
      await supabase
        .from('companies')
        .update({ stripe_customer_id: stripeCustomerId })
        .eq('id', profile.company_id);
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://frame-focus-eight.vercel.app';
    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      mode: 'setup',
      // On completion → Company Settings, via the verify-and-set handler (§S3.3).
      success_url: `${baseUrl}/onboarding/complete?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/onboarding`,
      metadata: { company_id: profile.company_id },
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error('Setup checkout error:', error);
    return NextResponse.json({ error: 'Failed to create checkout session' }, { status: 500 });
  }
}
