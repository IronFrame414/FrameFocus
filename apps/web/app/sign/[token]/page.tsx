import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { getActiveSessionByToken } from '@/lib/services/signing-service';
import { getProposalData } from '@/lib/proposal/proposal-data';
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

  return (
    <SigningClient
      token={params.token}
      proposal={proposal}
      recipientName={session.recipient_name}
    />
  );
}
