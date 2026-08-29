import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import { getStripe } from '@/lib/stripe';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { runCancellationLock, unlockCompany } from '@/lib/trial/lifecycle';

/**
 * S138 — release a trial lock when payment lands.
 *
 * ⚠️ SAFE TO CALL WHEN NOTHING IS LOCKED, AND SAFE TO CALL TWICE. Stripe
 * retries webhooks; `unlock_trial_company()` is idempotent by construction (it
 * un-bans only rows that are banned and clears `locked_at` only where it is
 * set), and a second un-ban of an already-un-banned user is a no-op — measured
 * in S138 rather than assumed.
 *
 * Never throws into the handler. A failure to unlock must not make the webhook
 * return 500, because Stripe would then retry the WHOLE event and the
 * subscription update above it has already been applied.
 */
async function releaseTrialLock(
  admin: SupabaseClient<Database>,
  companyId: string,
  reason: string
): Promise<void> {
  try {
    const { unbanned } = await unlockCompany(admin, companyId);
    if (unbanned > 0) {
      console.log(`[trial-unlock] ${reason}: company=${companyId} unbanned=${unbanned}`);
    }
  } catch (err) {
    // Logged, not thrown: the daily reconcile in /api/cron/trial-lock is the
    // backstop for exactly this, so a lost unlock costs hours, not the account.
    console.error(`[trial-unlock] FAILED for company=${companyId} (${reason}):`, err);
  }
}

export async function POST(request: NextRequest) {
  const stripe = getStripe();
  const supabaseAdmin = getSupabaseAdmin();

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

          if (session.customer) {
            await supabaseAdmin
              .from('companies')
              .update({ stripe_customer_id: session.customer as string })
              .eq('id', companyId)
              .is('stripe_customer_id', null);
          }

          // S138 — path 1 of 4: the trial converts through Checkout.
          await releaseTrialLock(
            supabaseAdmin as unknown as SupabaseClient<Database>,
            companyId,
            'checkout.session.completed'
          );
        }
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        let companyId = subscription.metadata?.company_id;

        if (!companyId) {
          const { data: existing } = await supabaseAdmin
            .from('subscriptions')
            .select('company_id')
            .eq('stripe_subscription_id', subscription.id)
            .single();
          companyId = existing?.company_id;
        }

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

          // S138 — path 2 of 4: reactivation, a past_due recovery, or a change
          // made from the Stripe dashboard rather than through Checkout.
          if (subscription.status === 'active') {
            await releaseTrialLock(
              supabaseAdmin as unknown as SupabaseClient<Database>,
              companyId,
              'customer.subscription.updated→active'
            );
          }
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        let companyId = subscription.metadata?.company_id;

        if (!companyId) {
          const { data: existing } = await supabaseAdmin
            .from('subscriptions')
            .select('company_id')
            .eq('stripe_subscription_id', subscription.id)
            .single();
          companyId = existing?.company_id;
        }

        if (companyId) {
          await supabaseAdmin
            .from('subscriptions')
            .update({ status: 'canceled' })
            .eq('company_id', companyId);

          // Register backlog §4 — the paid-cancellation lock lands HERE, at
          // the actual end of the paid period (Q10: locking at
          // cancel_at_period_end would take away time they paid for). Staff
          // banned, clients NOT (Q12 — the portal stays up on its own
          // windows); 90-day clock stored as a fact. Same never-throw posture
          // as releaseTrialLock above: a lock failure must not 500 the
          // webhook after the status write already applied.
          try {
            const { banned, alreadyLocked } = await runCancellationLock(
              supabaseAdmin,
              companyId,
              new Date()
            );
            if (!alreadyLocked) {
              console.log(
                `[cancellation-lock] company=${companyId} banned=${banned} retention=90d`
              );
            }
          } catch (err) {
            console.error(`[cancellation-lock] FAILED for company=${companyId}:`, err);
          }
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
