import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import { notify } from '@/lib/notify/notify';
import {
  getManagerNotifyRecipients,
  getProjectPmNotifyRecipients,
} from '@/lib/notify/recipients';

/**
 * §3g — delivery discrepancy, in-app + push.
 *
 * Extracted from `/api/deliveries/check-in` in the S123 coverage pass, for the
 * same reason the cron loops moved to lib/: the route cannot be driven from a
 * harness (it emails every Owner, Admin and assigned PM through Resend on the
 * way past), so the notification it produces had no live coverage at all — only
 * source assertions that the call was present and guarded.
 *
 * The GUARD stays in the route. `hasExceptions` is a fact the route derives
 * from the row it just wrote, and moving the condition here would let a caller
 * produce a discrepancy notification for a clean delivery.
 */
export interface DeliveryDiscrepancyParams {
  companyId: string;
  projectId: string;
  projectName: string;
  deliveryId: string;
  vendorName: string;
  receiverName: string;
  deliveryDate: string;
  items: Array<{ description: string; qty_received: number; qty_damaged: number }>;
}

export async function notifyDeliveryDiscrepancy(
  admin: SupabaseClient<Database>,
  params: DeliveryDiscrepancyParams
): Promise<{ written: number }> {
  const [managers, projectPms] = await Promise.all([
    getManagerNotifyRecipients(admin, params.companyId),
    getProjectPmNotifyRecipients(admin, params.projectId),
  ]);

  const damagedItems = params.items.filter((i) => i.qty_damaged > 0);
  const totalDamaged = damagedItems.reduce((sum, i) => sum + i.qty_damaged, 0);
  // ⚠️ THE DENOMINATOR IS THE DAMAGED LINES, NOT THE WHOLE DELIVERY. Summing
  // every line produced "3 of 30 windows damaged" for a truck carrying 20
  // windows and 10 lengths of trim — a number that is not the count of anything
  // the sentence names. Found by the live test; the whole-delivery sum was in
  // the first cut of this code and reads plausibly right.
  const totalReceived = damagedItems.reduce((sum, i) => sum + i.qty_received, 0);
  // "3 of 20 windows damaged" when one line is at fault, which is the §3g
  // example and the common case. With several, naming one would be actively
  // misleading, so the count carries it.
  const what =
    damagedItems.length === 1
      ? damagedItems[0].description
      : `items across ${damagedItems.length} lines`;
  // A delivery can have exceptions with nothing damaged — an issue_note alone
  // sets the flag. "0 of 20 damaged" would misdescribe it.
  const detail =
    totalDamaged > 0
      ? `${totalDamaged} of ${totalReceived} ${what} damaged`
      : 'issues noted on check-in';

  const outcome = await notify({
    admin,
    companyId: params.companyId,
    type: 'discrepancy',
    recipients: [...managers, ...projectPms],
    render: () => ({
      title: `Delivery discrepancy (${params.projectName}): ${detail} — ${params.receiverName}`,
      body: `${params.vendorName}, ${params.deliveryDate}.`,
    }),
    linkKey: 'delivery',
    // The `delivery` resolver was one of the four slice-1 keys pointing at a
    // route that does not exist; slice 3 corrected it to
    // /dashboard/field-ops/[projectId]/deliveries/d/[deliveryId].
    linkParams: { id: params.deliveryId, projectId: params.projectId },
    projectId: params.projectId,
    source: { table: 'deliveries', id: params.deliveryId },
    tag: `delivery-${params.deliveryId}`,
  });

  return { written: outcome.written };
}
