import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { createClient } from '@supabase/supabase-js';

// Service role client — bypasses RLS so webhooks can write to subscriptions
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const SEAT_LIMITS: Record<string, number> = {
  starter: 2,
  professional: 5,
  business: 15,
};

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get('stripe-signature');

  if (!signature) {
    return NextResponse.json({ error: 'No signature' }, { status: 400 });
  }

  let event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err: any) {
    console.error('Webhook signature verification failed:', err.message);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const companyId = session.metadata?.company_id;
        const planTier = session.metadata?.plan_tier || 'starter';
        const seatLimit = parseInt(session.metadata?.seat_limit || '2', 10);

        if (companyId && session.subscription) {
          const stripeSubscription = await stripe.subscriptions.retrieve(
            session.subscription as string
          );

          // Get period dates from the first subscription item
          const item = stripeSubscription.items.data[0];

          await supabaseAdmin
            .from('subscriptions')
            .update({
              stripe_subscription_id: stripeSubscription.id,
              plan_tier: planTier,
              seat_limit: seatLimit,
              status: stripeSubscription.status,
              trial_start: stripeSubscription.trial_start
                ? new Date(stripeSubscription.trial_start * 1000).toISOString()
                : null,
              trial_end: stripeSubscription.trial_end
                ? new Date(stripeSubscription.trial_end * 1000).toISOString()
                : null,
              current_period_start: item?.current_period_start
                ? new Date(item.current_period_start * 1000).toISOString()
                : null,
              current_period_end: item?.current_period_end
                ? new Date(item.current_period_end * 1000).toISOString()
                : null,
            })
            .eq('company_id', companyId);

          // Save Stripe customer ID to company if not already set
          if (session.customer) {
            await supabaseAdmin
              .from('companies')
              .update({ stripe_customer_id: session.customer as string })
              .eq('id', companyId)
              .is('stripe_customer_id', null);
          }
        }
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        const companyId = subscription.metadata?.company_id;

        if (companyId) {
          const planTier = subscription.metadata?.plan_tier || 'starter';
          const seatLimit = parseInt(subscription.metadata?.seat_limit || '2', 10);
          const item = subscription.items.data[0];

          await supabaseAdmin
            .from('subscriptions')
            .update({
              plan_tier: planTier,
              seat_limit: seatLimit,
              status: subscription.status,
              cancel_at_period_end: subscription.cancel_at_period_end,
              current_period_start: item?.current_period_start
                ? new Date(item.current_period_start * 1000).toISOString()
                : null,
              current_period_end: item?.current_period_end
                ? new Date(item.current_period_end * 1000).toISOString()
                : null,
              trial_end: subscription.trial_end
                ? new Date(subscription.trial_end * 1000).toISOString()
                : null,
            })
            .eq('company_id', companyId);
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const companyId = subscription.metadata?.company_id;

        if (companyId) {
          await supabaseAdmin
            .from('subscriptions')
            .update({ status: 'canceled' })
            .eq('company_id', companyId);
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as any;
        const subscriptionId = invoice.subscription as string;

        if (subscriptionId) {
          await supabaseAdmin
            .from('subscriptions')
            .update({ status: 'past_due' })
            .eq('stripe_subscription_id', subscriptionId);
        }
        break;
      }
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error('Webhook handler error:', err);
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 });
  }
}
