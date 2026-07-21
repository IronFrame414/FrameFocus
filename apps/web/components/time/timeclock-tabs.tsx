// Tab strip for the Timeclock area (S85): Timesheets is a SUBPAGE of
// Timeclock, not a first-class nav item — shown only to supervisor roles
// (owner/admin/PM/foreman); crew/subs see no tabs at all. Server-safe: plain
// links, active state passed by the rendering page. NOTE: this supersedes the
// M6 handoff's FFNav, which listed Timesheets as first-class — the owed FFNav
// reindex must build 10 items (amendment logged in the 6a build report).

import Link from 'next/link';
import { color, font } from '@/lib/theme';

const tabBase: React.CSSProperties = {
  padding: '8px 16px',
  borderRadius: '9px',
  fontFamily: font.sans,
  fontSize: '13px',
  fontWeight: 600,
  textDecoration: 'none',
};

export function TimeclockTabs({ active }: { active: 'personal' | 'timesheets' }) {
  return (
    <div style={{ display: 'flex', gap: '6px', marginBottom: '18px' }}>
      <Link
        href="/dashboard/timeclock"
        style={{
          ...tabBase,
          backgroundColor: active === 'personal' ? color.primary : 'transparent',
          color: active === 'personal' ? '#fff' : color.bodyAlt,
        }}
      >
        My clock
      </Link>
      <Link
        href="/dashboard/timeclock/timesheets"
        style={{
          ...tabBase,
          backgroundColor: active === 'timesheets' ? color.primary : 'transparent',
          color: active === 'timesheets' ? '#fff' : color.bodyAlt,
        }}
      >
        Timesheets
      </Link>
    </div>
  );
}
