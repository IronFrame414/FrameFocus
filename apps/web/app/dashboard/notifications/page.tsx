import { getNotifications, type NotificationFilter } from '@/lib/services/notifications';
import { NotificationList } from '@/components/notifications/notification-list';
import { PushEnrolment } from '@/components/notifications/push-enrolment';
import {
  CHIP_LABELS,
  chipFor,
  needsDecision,
  type NotificationChip,
} from '@/lib/notify/categories';
import type { NotificationType } from '@/lib/notify/notify';

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

const CHIPS: NotificationChip[] = ['all', 'signatures', 'money', 'field', 'account'];

function parseChip(value: string | undefined): NotificationChip {
  return CHIPS.includes(value as NotificationChip) ? (value as NotificationChip) : 'all';
}

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: { filter?: string; category?: string };
}) {
  const filter = parseFilter(searchParams.filter);
  const chip = parseChip(searchParams.category);
  const items = await getNotifications(filter);

  // §8.11.2 — the RULED chip mapping, derived from `type` (no category
  // column). 'all' is Everything, and it does double duty as the only home
  // for mention/assignment (routing notifications that fit no chip).
  const chipFiltered =
    chip === 'all' ? items : items.filter((i) => chipFor(i.type as NotificationType) === chip);

  // §8.11.2 — "needs a decision from you": UNREAD items of the ruled decision
  // set, pulled above the stream. A read decision item returns to the flow —
  // the block is a to-do list, not a category.
  const decisions = chipFiltered.filter(
    (i) => !i.read_at && needsDecision(i.type as NotificationType)
  );
  const rest = chipFiltered.filter((i) => !decisions.some((d) => d.id === i.id));

  return (
    <div style={{ padding: '1.5rem', maxWidth: '52rem' }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '1rem' }}>
        Notifications
      </h1>

      <nav
        aria-label="Filter notifications"
        style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.5rem' }}
      >
        {FILTERS.map((f) => (
          <a
            key={f.value}
            href={`/dashboard/notifications?filter=${f.value}${chip === 'all' ? '' : `&category=${chip}`}`}
            data-testid={`notifications-filter-${f.value}`}
            aria-current={filter === f.value ? 'page' : undefined}
            style={{ fontWeight: filter === f.value ? 700 : 400 }}
          >
            {f.label}
          </a>
        ))}
      </nav>

      <nav
        aria-label="Filter by category"
        style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}
      >
        {CHIPS.map((c) => (
          <a
            key={c}
            href={`/dashboard/notifications?filter=${filter}${c === 'all' ? '' : `&category=${c}`}`}
            data-testid={`notifications-chip-${c}`}
            aria-current={chip === c ? 'page' : undefined}
            style={{
              padding: '5px 12px',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: 600,
              textDecoration: 'none',
              backgroundColor: chip === c ? '#0f1729' : '#fff',
              color: chip === c ? '#fff' : '#4b5670',
              border: chip === c ? '1px solid transparent' : '1px solid #e4e8ef',
            }}
          >
            {CHIP_LABELS[c]}
          </a>
        ))}
      </nav>

      {decisions.length > 0 && (
        <section style={{ marginBottom: '1.25rem' }} data-testid="notifications-decisions">
          <h2 style={{ fontSize: '0.8125rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#b45309', marginBottom: '0.5rem' }}>
            Needs a decision from you
          </h2>
          <NotificationList initial={decisions} surface="desktop" filter={filter} />
        </section>
      )}

      <NotificationList initial={rest} surface="desktop" filter={filter} rollUpRepeats />

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
