import { describe, it, expect } from 'vitest';
import { timeEntryFlag } from '@/lib/quickbooks/time-entry-flag';

// S124 [Josh, RULED Q6 = B] — a day changed after it was sent is FLAGGED, never
// silently changed in QuickBooks. One function feeds both places it shows (the
// timesheet day page and Settings → Accounting).

const sent = {
  qb_time_activity_id: '100',
  qb_synced_at: '2026-10-05T21:00:00Z',
  status: 'approved',
  is_deleted: false,
  approved_at: '2026-10-05T20:30:00Z',
};
const MESSAGE =
  'Changed after it was sent to QuickBooks. QuickBooks was NOT updated (time entry 100). ' +
  'Re-approve this day to send the change, or correct it in QuickBooks.';

describe('S124 Q6 — timeEntryFlag', () => {
  it('never sent → no flag', () => {
    expect(timeEntryFlag({ ...sent, qb_time_activity_id: null })).toBeNull();
  });
  it('sent and unchanged → no flag', () => {
    expect(timeEntryFlag(sent)).toBeNull();
  });
  it('reopened (pending) after sending → flagged, exactly', () => {
    expect(timeEntryFlag({ ...sent, status: 'pending', approved_at: null })).toEqual({
      kind: 'changed_after_sending',
      qbId: '100',
      message: MESSAGE,
    });
  });
  it('deleted after sending → flagged', () => {
    expect(timeEntryFlag({ ...sent, is_deleted: true })?.kind).toBe('changed_after_sending');
  });
  it('re-approved after sending but not yet pushed (e.g. the switch is off) → flagged', () => {
    expect(timeEntryFlag({ ...sent, approved_at: '2026-10-06T09:00:00Z' })?.kind).toBe('changed_after_sending');
  });
});
