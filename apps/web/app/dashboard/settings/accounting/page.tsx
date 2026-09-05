import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';
import {
  getQuickBooksConnection,
  getQuickBooksQueueSummary,
} from '@/lib/services/quickbooks';
import { AccountingPanel } from '@/components/quickbooks/accounting-panel';
import { color, h2Style } from '@/lib/theme';
import { brand } from '@/lib/brand';

/**
 * ⚠️ THIS ROUTE EXISTS BECAUSE INTUIT IS REGISTERED AGAINST THIS EXACT PATH.
 *
 * `/dashboard/settings/accounting` is the **launch URL** registered with Intuit.
 * Before this file it returned **404**: `accounting` was only ever an in-page
 * TAB KEY in `app/dashboard/settings/page.tsx`, never a route. Both the build
 * prompt and `7g2-spec.md`'s header describe it as existing; neither is right.
 * A 404 on the launch URL is an Intuit review failure, not a cosmetic gap.
 *
 * ⚠️ IT RENDERS THE SAME COMPONENT AS THE SETTINGS TAB, deliberately — one
 * feature, two presentations, per the PARITY ruling [Josh, S122]. Do not fork
 * `AccountingPanel` for this page.
 *
 * `force-dynamic` for the same reason the Settings page carries it: the OAuth
 * round trip returns here immediately after writing `companies.qb_*`, and a
 * cached PostgREST GET would render the PRE-CONNECTION state to an Owner who
 * just connected.
 */
export const dynamic = 'force-dynamic';

const NOTICES: Record<string, { kind: 'ok' | 'error'; message: string }> = {
  declined: { kind: 'error', message: 'The QuickBooks connection was cancelled. Nothing has changed.' },
  state_mismatch: {
    kind: 'error',
    message:
      'That connection request could not be verified, so it was refused. Please start again from this page.',
  },
  missing_params: { kind: 'error', message: 'QuickBooks did not return enough information to finish connecting. Please try again.' },
  owner_only: { kind: 'error', message: 'Only the account Owner can connect or disconnect QuickBooks.' },
  not_configured: { kind: 'error', message: 'QuickBooks is not configured on this deployment yet.' },
  exchange_failed: { kind: 'error', message: 'QuickBooks refused the connection request. Please try again.' },
  realm_taken: {
    kind: 'error',
    message:
      `That QuickBooks company is already connected to another ${brand.name} account. Disconnect it there first.`,
  },
  vault_failed: { kind: 'error', message: 'The connection could not be stored securely. Nothing was saved — please try again.' },
  save_failed: { kind: 'error', message: 'The connection could not be saved. Please try again.' },
};

export default async function AccountingSettingsPage({
  searchParams,
}: {
  searchParams?: { qb_error?: string; qb_connected?: string; qb_disconnected?: string };
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');

  // Same gate as the Settings page itself: Owner and Admin only.
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('user_id', user.id)
    .single();

  if (!profile || !['owner', 'admin'].includes(profile.role as string)) {
    redirect('/dashboard');
  }

  const [connection, queue] = await Promise.all([
    getQuickBooksConnection(),
    getQuickBooksQueueSummary(),
  ]);

  let notice: { kind: 'ok' | 'error'; message: string } | null = null;
  if (searchParams?.qb_connected) {
    notice = { kind: 'ok', message: 'QuickBooks is connected.' };
  } else if (searchParams?.qb_disconnected) {
    notice = { kind: 'ok', message: 'QuickBooks has been disconnected.' };
  } else if (searchParams?.qb_error) {
    notice = NOTICES[searchParams.qb_error] ?? {
      kind: 'error',
      message: 'The QuickBooks connection could not be completed.',
    };
  }

  return (
    <div style={{ padding: '1.5rem', maxWidth: '900px' }}>
      <h1 style={{ ...h2Style, fontSize: '1.375rem', marginBottom: '0.25rem' }}>Accounting</h1>
      <p style={{ color: color.muted, fontSize: '0.875rem', marginTop: 0, marginBottom: '1.5rem' }}>
        <a href="/dashboard/settings?tab=accounting" style={{ color: color.primary }}>
          Back to all settings
        </a>
      </p>

      <AccountingPanel
        connection={connection}
        queue={queue}
        isOwner={profile.role === 'owner'}
        notice={notice}
      />
    </div>
  );
}
