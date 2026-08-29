import { headers } from 'next/headers';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { createClient } from '@/lib/supabase-server';
import { getActiveSessionByToken } from '@/lib/services/signing-service';
import { getProposalData } from '@/lib/proposal/proposal-data';
import { recordProposalView } from '@/lib/proposal/record-view';
import { SigningClient } from './signing-client';

// Spec 2 (4F F1) — public signing page. No authentication: the
// token IS the access credential. Lives outside /dashboard.

interface PageProps {
  params: { token: string };
}

function ErrorCard({ message }: { message: string }) {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#f3f4f6',
        fontFamily: 'Helvetica, Arial, sans-serif',
        padding: '1rem',
      }}
    >
      <div
        style={{
          backgroundColor: '#fff',
          borderRadius: '0.5rem',
          padding: '2.5rem',
          maxWidth: '420px',
          textAlign: 'center',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        }}
      >
        <h1 style={{ fontSize: '1.25rem', margin: '0 0 0.75rem' }}>Link unavailable</h1>
        <p style={{ fontSize: '0.875rem', color: '#6b7280', margin: 0 }}>{message}</p>
      </div>
    </div>
  );
}

export default async function SigningPage({ params }: PageProps) {
  const admin = getSupabaseAdmin() as SupabaseClient<Database>;

  const session = await getActiveSessionByToken(admin, params.token);
  if (!session) {
    return (
      <ErrorCard message="This link has expired or is no longer valid. Please contact the company that sent you this proposal for a new link." />
    );
  }

  const proposal = await getProposalData(admin, session.estimate_id);
  if (!proposal || proposal.estimate.status !== 'sent') {
    return (
      <ErrorCard
        message={`This proposal is no longer awaiting signature. Please contact ${
          proposal?.company.name ?? 'the company'
        } if you believe this is an error.`}
      />
    );
  }

  // View tracking (proposal-view-tracking-spec §4): every open logs a row —
  // UNLESS the viewer is signed in to the sending company (the contractor
  // checking their own proposal must not render as client activity). Known
  // accepted limitation: the contractor in a logged-out browser counts.
  // Detection failure falls through to logging — the row is the safe default,
  // since read-time filtering can always improve.
  let isOwnView = false;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      // Mirrors my_company_id_flat(): one profile per auth user is the seed
      // invariant, so this .limit(1) is the flat lookup, not an ordering bug.
      const { data: prof } = await admin
        .from('profiles')
        .select('company_id')
        .eq('user_id', user.id)
        .eq('is_deleted', false)
        .limit(1);
      isOwnView = prof?.[0]?.company_id === session.company_id;
    }
  } catch {
    // No session cookie context (or auth hiccup) — treat as a client view.
  }
  if (!isOwnView) {
    await recordProposalView(admin, {
      companyId: session.company_id,
      estimateId: session.estimate_id,
      userAgent: headers().get('user-agent'),
    });
  }

  return (
    <SigningClient
      token={params.token}
      proposal={proposal}
      recipientName={session.recipient_name}
    />
  );
}
