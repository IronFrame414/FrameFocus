'use client';

import { createClient } from '@/lib/supabase-browser';
import { storageStatus, type StorageStatus } from '@/lib/billing/storage-cap';

// The cap check the three capped upload paths share [storage-archive-ai-spec
// §2, §S2 RULED Q7]. One implementation: the §1 RPC for the number, the
// caller's own subscription row for the tier (its SELECT policy is
// company-scoped with no role arm, so crew and foremen read it too — the cap
// must not silently not-apply to non-admins), and the pure boundaries from
// storage-cap.ts.
//
// ⚠️ FAILS OPEN ON EVERY ERROR, deliberately. Storage is a billing limit,
// not a security boundary — an RPC hiccup must not take uploads offline.

export type { StorageStatus };

/** Sentinel: upload refused by the storage cap. UIs branch on this to show
 *  the limit notice instead of an error. The string itself carries the rules
 *  for surfaces that only render text. */
export const STORAGE_LIMIT_ERROR =
  'Storage limit reached. Uploads are paused — everything else keeps working. ' +
  'Free space by emptying Trash (trashed files still count; permanent delete is an ' +
  'Owner/Admin action), downloading a project archive, or upgrading your plan.';

export async function getStorageStatus(): Promise<StorageStatus> {
  const supabase = createClient();
  try {
    const [{ data: used, error: rpcError }, { data: sub }] = await Promise.all([
      supabase.rpc('company_storage_used_bytes'),
      supabase.from('subscriptions').select('plan_tier').maybeSingle(),
    ]);
    if (rpcError || used === null || used === undefined) {
      return storageStatus(0, null); // fail open
    }
    return storageStatus(Number(used), (sub as { plan_tier: string | null } | null)?.plan_tier ?? null);
  } catch {
    return storageStatus(0, null); // fail open
  }
}

/** True when a NEW user upload must be refused. */
export async function uploadBlockedByCap(): Promise<{ blocked: boolean; status: StorageStatus }> {
  const status = await getStorageStatus();
  return { blocked: status.level === 'blocked', status };
}
