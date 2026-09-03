import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { BidReplyClient, type BidRequestView } from './bid-reply-client';

// Public sub-bid reply page (19c "a link they fill in"). No authentication:
// the token IS the credential. Lives outside /dashboard, mirroring
// /sign-co/[token]. The read goes through get_sub_bid_request (SECURITY DEFINER,
// keyed on the token), which also marks the request viewed; the form posts to
// submit_sub_bid_reply. Each sub reaches only their own request.

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
        background: '#f3f4f6',
        padding: '1rem',
      }}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: '14px',
          padding: '2.5rem',
          maxWidth: '420px',
          textAlign: 'center',
          boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
        }}
      >
        <h1 style={{ fontSize: '1.25rem', margin: '0 0 0.75rem' }}>Link unavailable</h1>
        <p style={{ fontSize: '0.875rem', color: '#6b7280', margin: 0 }}>{message}</p>
      </div>
    </div>
  );
}

export default async function SubBidReplyPage({ params }: PageProps) {
  const admin = getSupabaseAdmin() as SupabaseClient<Database>;

  const { data } = await admin.rpc('get_sub_bid_request', { p_token: params.token });
  const request = data as unknown as BidRequestView | null;

  if (!request) {
    return (
      <ErrorCard message="This link has expired or is no longer valid. Please contact the company that sent you this bid request for a new link." />
    );
  }

  return <BidReplyClient request={request} />;
}
