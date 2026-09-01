import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { getStripe } from '@/lib/stripe';

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
      return NextResponse.json({ error: 'Only the Owner can manage billing' }, { status: 403 });
    }

    const { data: company } = await supabase
      .from('companies')
      .select('stripe_customer_id')
      .eq('id', profile.company_id)
      .single();

    if (!company?.stripe_customer_id) {
      return NextResponse.json(
        { error: 'No billing account found. Please choose a plan first.' },
        { status: 400 }
      );
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://frame-focus-eight.vercel.app';

    const portalSession = await stripe.billingPortal.sessions.create({
      // Billing now lives in Settings [Josh]; return there directly rather than
      // through the /dashboard/billing permanent redirect (one hop instead of
      // two). The old path still redirects here, for bookmarks and history.
      return_url: `${baseUrl}/dashboard/settings?tab=billing`,
    });

    return NextResponse.json({ url: portalSession.url });
  } catch (error) {
    console.error('Portal error:', error);
    return NextResponse.json({ error: 'Failed to create portal session' }, { status: 500 });
  }
}
