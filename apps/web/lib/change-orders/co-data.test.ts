import { describe, it, expect } from 'vitest';
import { getChangeOrderData } from './co-data';

// Local helper: builds a fake Supabase client from table→rows.
// Every chain method returns the same builder; terminals resolve to rows.
function makeSupabase(rows: Record<string, any[]>) {
  const build = (table: string) => {
    const data = rows[table] ?? [];
    const chain: any = {
      select: () => chain,
      eq: () => chain,
      in: () => chain,
      order: () => Promise.resolve({ data, error: null }),
      single: () => Promise.resolve({ data: data[0] ?? null, error: null }),
      maybeSingle: () => Promise.resolve({ data: data[0] ?? null, error: null }),
      then: (r: any) => r({ data, error: null }),
    };
    return chain;
  };
  return { from: (t: string) => build(t) } as any;
}

const baseRows = {
  change_orders: [{ id: 'co1', company_id: 'c1', project_id: 'p1', is_deleted: false }],
  companies: [{ name: 'Bishop', brand_color: null, timezone: 'America/New_York' }],
  projects: [{ name: 'Job', contact_id: null }],
  change_order_line_items: [],
  change_order_line_rows: [],
};

describe('getChangeOrderData signatures', () => {
  it('v1: no client override → clientSignature is null', async () => {
    const data = await getChangeOrderData(makeSupabase(baseRows), 'co1');
    expect(data?.clientSignature).toBeNull();
  });

  it('v2: client override → all fields map through', async () => {
    const data = await getChangeOrderData(makeSupabase(baseRows), 'co1', {
      clientSignature: { name: 'Client', imageDataUri: 'data:x', signedAt: 't', ip: '1.1.1.1' },
    });
    expect(data?.clientSignature).toEqual({
      name: 'Client', imageDataUri: 'data:x', signedAt: 't', ip: '1.1.1.1',
    });
  });

  it('contractor unsigned → contractorSignature is null', async () => {
    const data = await getChangeOrderData(makeSupabase(baseRows), 'co1');
    expect(data?.contractorSignature).toBeNull();
  });

  it('contractor typed_name signed → populated, imageDataUri null', async () => {
    const rows = { ...baseRows, change_orders: [{
      ...baseRows.change_orders[0],
      contractor_signed_at: 't', contractor_signature_mode: 'typed_name',
      contractor_signature_name: 'Bob', contractor_signature_ref: null,
    }] };
    const data = await getChangeOrderData(makeSupabase(rows), 'co1');
    expect(data?.contractorSignature).toMatchObject({ mode: 'typed_name', name: 'Bob', imageDataUri: null });
  });
});
