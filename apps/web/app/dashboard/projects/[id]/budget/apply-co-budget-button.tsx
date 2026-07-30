'use client';

// Money representation §5.2 retry surface: a signed CO with no budget rows
// (the signing-time apply_change_order_budget call failed) gets an inline
// Owner/Admin "Create budget lines" action. The RPC is idempotent — safe to
// click twice.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase-browser';
import { color, secondaryButtonStyle } from '@/lib/theme';

export function ApplyCoBudgetButton({ changeOrderId }: { changeOrderId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleApply() {
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc('apply_change_order_budget', {
      p_change_order_id: changeOrderId,
    });
    setBusy(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    router.refresh();
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
      <button
        style={{ ...secondaryButtonStyle, padding: '4px 10px', fontSize: '12px', opacity: busy ? 0.6 : 1 }}
        disabled={busy}
        onClick={() => void handleApply()}
      >
        {busy ? 'Creating…' : 'Create budget lines'}
      </button>
      {error && <span style={{ fontSize: '12px', color: color.danger }}>{error}</span>}
    </span>
  );
}
