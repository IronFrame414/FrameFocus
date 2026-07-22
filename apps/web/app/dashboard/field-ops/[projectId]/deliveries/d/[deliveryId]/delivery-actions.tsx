'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { softDeleteDelivery } from '@/lib/services/deliveries-client';

export function DeleteDeliveryButton({
  deliveryId,
  projectId,
}: {
  deliveryId: string;
  projectId: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleDelete() {
    if (!window.confirm('Move this delivery to the trash? PO usable totals will recompute.'))
      return;
    setBusy(true);
    const result = await softDeleteDelivery(deliveryId);
    setBusy(false);
    if (result.success) {
      router.push(`/dashboard/field-ops/${projectId}/deliveries`);
      router.refresh();
    } else {
      window.alert(result.error ?? 'Delete failed');
    }
  }

  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => void handleDelete()}
      className="rounded-[9px] border border-[#f5c6c0] bg-white px-[15px] py-[9px] text-[13px] font-semibold text-[#c0362c] transition-colors hover:bg-[#fbe4e2] disabled:opacity-50"
    >
      Delete
    </button>
  );
}
