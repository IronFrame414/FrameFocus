import Link from 'next/link';

// 6B-1 §3 — the Field sub-tab bar (handoff 4c). Daily Logs (6B), Deliveries
// (6D), and Safety (6C) are live. Crew Briefings is HIDDEN entirely (S88
// amendment to the Q7 enabled-and-404 posture, this tab only) — 6E is
// deferred post-launch; the tab returns when 6E ships.

const TABS = [
  { key: 'daily-logs', label: 'Daily Logs', segment: 'daily-logs' },
  { key: 'deliveries', label: 'Deliveries', segment: 'deliveries' },
  { key: 'safety', label: 'Safety', segment: 'safety' },
] as const;

export type FieldTabKey = (typeof TABS)[number]['key'];

export function FieldTabs({ projectId, active }: { projectId: string; active: FieldTabKey }) {
  return (
    <div className="mb-5 flex gap-[2px] border-b border-[#e6e9ef]">
      {TABS.map((tab) =>
        tab.key === active ? (
          <span
            key={tab.key}
            className="px-[14px] py-[10px] text-[13px] font-semibold text-[#14213d] shadow-[inset_0_-2px_0_#2f49d1]"
          >
            {tab.label}
          </span>
        ) : (
          <Link
            key={tab.key}
            href={`/dashboard/field-ops/${projectId}/${tab.segment}`}
            className="px-[14px] py-[10px] text-[13px] font-semibold text-[#8a919c] transition-colors hover:text-[#14213d]"
          >
            {tab.label}
          </Link>
        )
      )}
    </div>
  );
}
