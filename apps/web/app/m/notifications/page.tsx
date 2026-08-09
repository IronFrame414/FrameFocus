import { getNotifications, type NotificationFilter } from '@/lib/services/notifications';
import { NotificationList } from '@/components/notifications/notification-list';
import { PushEnrolment } from '@/components/notifications/push-enrolment';
import { SetMobileHeader } from '../mobile-header';

// Mobile notifications surface — spec §10.3, ND-13.
//
// ─────────────────────────────────────────────────────────────────────────────
// A REAL ROUTE, NOT A SHEET, AND NOT A TAB.
// ─────────────────────────────────────────────────────────────────────────────
// M6M D-28 ruled pages rather than sheets for field-capture screens and the
// reasoning carries: a sheet cannot be linked to, and `notificationclick` in the
// service worker has to open a URL.
//
// It is reached from the APP-BAR BELL, not the bottom tab bar. ND-13 as amended
// [S123, Josh]: the six-slot bar was ruled and then REVERSED on the arithmetic —
// at 402px a sixth slot cuts each side item's envelope from 77.0px to 61.6px
// while "Notifications" needs ~70px at 11px Barlow, and five side items plus the
// centre camera has no true centre, so the camera's -26px break would read as a
// mistake. M6M D-3 therefore stands and the bottom bar is untouched.
//
// The bell lives in the slot M6M D-36 emptied when it cut the 38px avatar. That
// is not a reversal of D-36: D-36 cut a control with NO ACTION that was UNDER
// the 44px floor. The bell has one action and meets the floor.
//
// The list itself is the SHARED component — CLAUDE.md's parity rule. `compact`
// applies D-4's card geometry; it changes presentation and nothing about what a
// tap writes.

export const dynamic = 'force-dynamic';

function parseFilter(value: string | undefined): NotificationFilter {
  return value === 'unread' || value === 'starred' ? value : 'all';
}

export default async function MobileNotificationsPage({
  searchParams,
}: {
  searchParams: { filter?: string };
}) {
  const filter = parseFilter(searchParams.filter);
  const items = await getNotifications(filter);

  return (
    <>
      <SetMobileHeader title="Notifications" />
      <div style={{ padding: '18px' }}>
        <NotificationList initial={items} surface="mobile" filter={filter} compact />

        <section style={{ marginTop: '24px' }}>
          {/* §5.2 — on iOS in a browser tab this renders install instructions
              and NO enable control, and never calls requestPermission(). */}
          <PushEnrolment surface="mobile" />
        </section>
      </div>
    </>
  );
}
