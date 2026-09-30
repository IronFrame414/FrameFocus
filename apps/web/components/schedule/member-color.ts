// One consistent color per member everywhere (5B §6, Q-N6).
//
// [S121 5-G] THE RULE MOVED to packages/shared/utils/schedule-colors.ts —
// crew: picked colour or a stable hash; subs/vendors: their TRADE's colour;
// nobody / no trade: neutral slate. This file keeps the call sites' names.
// SUPERSEDED: a local FALLBACK_PALETTE here (desktop) and a flat amber on /m —
// one member, two colours. Both surfaces now resolve through scheduleColor().

import { scheduleColor, SCHEDULE_NEUTRAL } from '@framefocus/shared/utils/schedule-colors';
import type { TaskAssignee } from '@/lib/tasks/assignees';

/** A crew-style colour from an id + explicit colour (callers without a member type). */
export function memberColor(memberId: string | null, explicit: string | null): string {
  if (!memberId) return SCHEDULE_NEUTRAL;
  return scheduleColor({ memberId, memberType: 'crew', explicit, trade: null });
}

/** A task assignee's colour — crew by person, subs/vendors by trade. */
export function assigneeColor(a: TaskAssignee | null | undefined): string {
  if (!a) return SCHEDULE_NEUTRAL;
  return scheduleColor({
    memberId: a.id,
    memberType: a.member_type,
    explicit: a.schedule_color,
    trade: a.trade,
  });
}
