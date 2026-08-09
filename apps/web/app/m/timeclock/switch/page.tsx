import Link from 'next/link';
import { getOpenSession } from '@/lib/services/time-tracking';
import { getProjects } from '@/lib/services/projects';
import { SetMobileHeader } from '../../mobile-header';
import { SwitchScreen } from './switch-screen';
import type { PickerProject } from '../timeclock-screen';

// M6M §4.12.2 — M-20 · the mid-shift segment switcher (7b). ADOPTED by D-32:
// a gap in the spec, not a contradiction — §4.5a recorded it as owed and
// pre-committed its constraints. A PAGE, not a sheet (D-28): deep-linkable and
// browser-back-able; the handoff's ✕ chrome is styling.

export default async function SwitchSegmentPage() {
  const [openSession, projects] = await Promise.all([
    getOpenSession(),
    getProjects({ status: 'active' }),
  ]);

  const openSegment =
    openSession?.segments.find((s) => s.segment_end === null && !s.is_deleted) ?? null;

  if (!openSession || !openSegment) {
    // Deep-linked while clocked out: the switcher has nothing to close. Say
    // so rather than rendering a form whose submit can only throw.
    return (
      <div className="px-[18px] pb-[18px] pt-[14px]">
        <SetMobileHeader title="Switch segment" sub={null} />
        <p
          data-testid="m-switch-empty"
          className="rounded-[15px] border border-dashed border-m6m-border bg-m6m-card px-[16px] py-[22px] text-center text-[15px] text-m6m-muted"
        >
          Not clocked in — there is no segment to switch.
        </p>
        {/* This branch ALREADY owned its exit — the gap [S121] was in the
            clocked-in branch, which had none. Given a testid so the "every
            capture screen offers a way out" criterion can assert BOTH branches
            rather than only the one the test identity happens to be in. */}
        <Link
          href="/m/timeclock"
          data-testid="m-switch-cancel"
          className="mt-[14px] flex min-h-[52px] w-full items-center justify-center rounded-[14px] border border-m6m-border bg-m6m-card text-[15px] font-semibold text-m6m-navy"
        >
          Go to Timeclock
        </Link>
      </div>
    );
  }

  const picker: PickerProject[] = projects.map((p) => ({
    id: p.id,
    name: p.name,
    project_number: p.project_number,
  }));

  return (
    <SwitchScreen session={openSession} openSegment={openSegment} projects={picker} />
  );
}
