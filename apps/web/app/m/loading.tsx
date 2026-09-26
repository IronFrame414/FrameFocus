// S112 R2 (audit F1) — navigation feedback on /m. RULED [Josh, S112]: this
// file, inside the persistent shell.
//
// Measured before it existed: with the next screen's RSC payload held 3s,
// 20 of 20 taps left the old screen unchanged at 800ms — a dead tap on
// jobsite LTE, which invites a second one. `/m` has ONE layout
// (app/m/layout.tsx), so this boundary sits inside the shell and covers every
// page under it; the app bar and tab bar stay put while the body swaps to this
// skeleton the moment navigation starts.
//
// ⚠️ It fires when the first segment under /m changes (tab to tab, list to a
// project). A navigation that keeps that segment — inside one project, for
// instance — does not remount this boundary. Measured in S112's R2 record,
// not assumed.
//
// No data, no translation lookup: a loading state that waits on the server is
// the defect it replaces. The ellipsis is language-neutral.

export default function MobileLoading() {
  return (
    <div
      data-testid="m-loading"
      role="status"
      aria-busy="true"
      className="flex flex-col gap-[12px] px-[16px] py-[16px]"
    >
      <span className="sr-only">…</span>
      <div className="h-[22px] w-[45%] animate-pulse rounded-[8px] bg-m6m-border" />
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="h-[76px] animate-pulse rounded-[15px] border border-m6m-border bg-m6m-card"
        />
      ))}
    </div>
  );
}
