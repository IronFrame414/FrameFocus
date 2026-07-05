import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { getActiveCoSessionByToken } from '@/lib/services/co-signing-service';
import { CoSigningClient, type CoSigningData } from './co-signing-client';

// 5D §6 — public CO signing page (D-4: client signature = binding).
// No authentication: the token IS the access credential. Lives outside
// /dashboard, mirroring /sign/[token] (M4). Renders the CO summary
// inline — no PDF at launch (F-2 unresolved).

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

export default async function CoSigningPage({ params }: PageProps) {
  const admin = getSupabaseAdmin() as SupabaseClient<Database>;

  const session = await getActiveCoSessionByToken(admin, params.token);
  if (!session) {
    return (
      <ErrorCard message="This link has expired or is no longer valid. Please contact the company that sent you this change order for a new link." />
    );
  }

  const { data: co } = await admin
    .from('change_orders')
    .select('id, status, co_number, title, description, net_delta, project_id, company_id')
    .eq('id', session.change_order_id)
    .single();

  const { data: company } = co
    ? await admin
        .from('companies')
        .select('name, brand_color')
        .eq('id', co.company_id)
        .single()
    : { data: null };

  if (!co || co.status !== 'sent' || !company) {
    return (
      <ErrorCard
        message={`This change order is no longer awaiting signature. Please contact ${
          company?.name ?? 'the company'
        } if you believe this is an error.`}
      />
    );
  }

  const { data: project } = await admin
    .from('projects')
    .select('name, project_number')
    .eq('id', co.project_id)
    .single();

  const { data: items } = await admin
    .from('change_order_line_items')
    .select('id, name, description, total_price, sort_order')
    .eq('change_order_id', co.id)
    .order('sort_order', { ascending: true });

  const itemIds = (items ?? []).map((i) => i.id);
  const { data: rows } =
    itemIds.length > 0
      ? await admin
          .from('change_order_line_rows')
          .select('id, line_item_id, name, row_type, total, sort_order')
          .in('line_item_id', itemIds)
          .order('sort_order', { ascending: true })
      : { data: [] as never[] };

  const data: CoSigningData = {
    companyName: company.name,
    brandColor: company.brand_color || '#1a56db',
    projectName: project?.name ?? '',
    projectNumber: project?.project_number ?? '',
    coNumber: co.co_number,
    title: co.title,
    description: co.description,
    netDelta: co.net_delta,
    lineItems: (items ?? []).map((item) => ({
      id: item.id,
      name: item.name,
      description: item.description,
      total: item.total_price,
      rows: (rows ?? [])
        .filter((r) => r.line_item_id === item.id)
        .map((r) => ({ id: r.id, name: r.name, row_type: r.row_type, total: r.total })),
    })),
  };

  return (
    <CoSigningClient
      token={params.token}
      data={data}
      recipientName={session.recipient_name}
    />
  );
}
