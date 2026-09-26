import Link from 'next/link';
import { getMobileT } from '@/lib/i18n/server';
import { SetMobileHeader } from './mobile-header';

// /m's not-found boundary [/m visual sweep, 2026-09-24].
//
// Before this file, every notFound() under /m — 18 pages call it — fell through
// to the ROOT not-found, which renders outside app/m/layout.tsx: a bare Next
// 404 with no app bar, no tab bar and no way back but the browser. Phase 1 of
// the sweep caught it on M-31 (a crew member opening a change-order link).
// Here, the same notFound() renders inside the shell, with a way home.
//
// A URL /m has no route for at all lands here too, via [...missing]/page.tsx.
//
// ⚠️ This is the answer for a record that is genuinely ABSENT. A record the
// caller may not read is a different case and deserves a reason, not "not
// found": those redirect to their list with ?denied= (A-66) — see M-31 and
// app/m/detail-access.ts.
export default async function MobileNotFound() {
  const t = await getMobileT();
  return (
    <div data-testid="m-not-found" className="px-[18px] pb-[18px] pt-[14px]">
      <SetMobileHeader title={t('shell.notFound.title')} />
      <p className="rounded-[15px] border border-dashed border-m6m-border bg-m6m-card px-[16px] py-[22px] text-center text-[15px] text-m6m-muted">
        {t('shell.notFound.body')}
      </p>
      <Link
        href="/m"
        data-testid="m-not-found-home"
        className="mt-[14px] flex min-h-[52px] w-full items-center justify-center rounded-[14px] border border-m6m-border bg-m6m-card text-[15px] font-bold text-m6m-navy"
      >
        {t('shell.notFound.home')}
      </Link>
    </div>
  );
}
