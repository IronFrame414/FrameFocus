import { getNotifications, type NotificationFilter } from '@/lib/services/notifications';
import { NotificationList } from '@/components/notifications/notification-list';
import { PushEnrolment } from '@/components/notifications/push-enrolment';

// Desktop notifications surface — spec §10.1.
//
// UNGATED for every role, deliberately: everybody has notifications, and RLS
// (`notifications_select_own`) is what scopes the contents. This follows the
// Field Ops precedent the sidebar already sets — the nav item is ungated and the
// page content is role-scoped — rather than inventing a role gate that would
// have to be kept in step with every future consumer.
//
// Filters are a URL param, not local state, so a filtered view is linkable and
// survives a refresh. §10.1: All · Unread · Starred. No type filter in v1.

export const dynamic = 'force-dynamic';

const FILTERS: { value: NotificationFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'unread', label: 'Unread' },
  { value: 'starred', label: 'Starred' },
];

function parseFilter(value: string | undefined): NotificationFilter {
  return value === 'unread' || value === 'starred' ? value : 'all';
}

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: { filter?: string };
}) {
  const filter = parseFilter(searchParams.filter);
  const items = await getNotifications(filter);

  return (
    <div style={{ padding: '1.5rem', maxWidth: '52rem' }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '1rem' }}>
        Notifications
      </h1>

      <nav
        aria-label="Filter notifications"
        style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem' }}
      >
        {FILTERS.map((f) => (
          <a
            key={f.value}
            href={`/dashboard/notifications?filter=${f.value}`}
            data-testid={`notifications-filter-${f.value}`}
            aria-current={filter === f.value ? 'page' : undefined}
            style={{ fontWeight: filter === f.value ? 700 : 400 }}
          >
            {f.label}
          </a>
        ))}
      </nav>

      <NotificationList initial={items} surface="desktop" filter={filter} />

      <section style={{ marginTop: '2rem' }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 600 }}>Push notifications</h2>
        {/* ND-4: this enrols against the /dashboard push-only worker. The same
            component on /m enrols against the /m worker — one behaviour, two
            registrations. */}
        <PushEnrolment surface="desktop" />
      </section>
    </div>
  );
}
