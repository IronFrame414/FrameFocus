import { getMyMember } from '@/lib/services/members';
import { getMyProfile } from '@/lib/services/profiles';
import { getCompany, getCompanyTimeSettings } from '@/lib/services/company';
import { SetMobileHeader } from '../mobile-header';

// M6M §4.13.7 — M-30 · Settings. READ-ONLY, for every role including Owner.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE FINDING THAT DECIDES THIS SCREEN: there is NO personal-settings surface
// anywhere in this application. Not gated, not hidden — it does not exist.
// ─────────────────────────────────────────────────────────────────────────────
// The desktop settings page gates the whole route to Owner/Admin and renders
// five COMPANY-level forms (company profile, estimating, proposal, time
// tracking, GL mapping) plus a tag-options editor. A user's own record is edited
// through TEAM MANAGEMENT, by an Owner or Admin — not by the user.
//
// So M-30 answers the two questions a field user actually has — "am I signed in
// as the right person?" and "which company?" — and offers nothing to change.
// Read-only is a D-19-shaped cut: the data exists and is deliberately not made
// editable. Editing GL mappings or markup tables on a 402px screen is worse than
// not offering it, and a mobile write path into company configuration would need
// its own permission design that this spec has not done.
//
// A-48 asserts NO editable control as OWNER — the only role that could fail it.

export default async function MobileSettingsPage() {
  // The role comes from a SECOND READ IN THE PAGE via a named service function
  // — §4.13.7's correction. It does NOT come from the layout: app/m/layout.tsx
  // selects company_id only, and role was never in that query. It does NOT come
  // from a prop or context on MobileShell either: the shell is mounted by every
  // mobile screen and widening its contract to courier one label for one screen
  // is the change that is cheap once and expensive the fourth time. A-48e
  // asserts the mechanism, not just the output.
  const [member, profile, company, timeSettings] = await Promise.all([
    getMyMember(),
    getMyProfile(),
    getCompany(),
    getCompanyTimeSettings(),
  ]);

  return (
    <div className="px-[18px] pb-[18px] pt-[14px]">
      <SetMobileHeader title="Settings" sub={company?.name ?? null} />

      {/* ── You ────────────────────────────────────────────────────────────
          §4.13.7's first bound block. display_name and member_type from
          getMyMember(); role from getMyProfile(). The point of the block is
          identity confirmation: a shared site phone, or a handset that has been
          in a pocket since the last shift, makes "am I still me?" a real
          question — and clocking in as the wrong identity puts wrong-person
          time into job costing, the failure D-33 exists to prevent. */}
      <section
        data-testid="m-settings-you"
        className="mt-[14px] rounded-[15px] border border-m6m-border bg-m6m-card p-[16px]"
      >
        <h2 className="font-mono text-[11px] font-medium uppercase tracking-wide text-m6m-muted">
          You
        </h2>
        <p
          data-testid="m-settings-name"
          className="mt-[8px] text-[19px] font-extrabold leading-tight text-m6m-navy"
        >
          {member?.display_name ?? '—'}
        </p>
        <p className="mt-[4px] flex flex-wrap items-center gap-[8px]">
          <span
            data-testid="m-settings-role"
            className="font-mono text-[11px] font-semibold text-m6m-muted"
          >
            {profile?.role ?? '—'}
          </span>
          <span
            data-testid="m-settings-member-type"
            className="font-mono text-[11px] text-m6m-muted"
          >
            {member?.member_type ?? '—'}
          </span>
        </p>
      </section>

      {/* ── Your company ───────────────────────────────────────────────────
          The timezone earns its place: it is the rule M-5's clock and every
          mobile timestamp are rendered in, so a user seeing times they do not
          expect can see why without calling the office. */}
      <section
        data-testid="m-settings-company"
        className="mt-[12px] rounded-[15px] border border-m6m-border bg-m6m-card p-[16px]"
      >
        <h2 className="font-mono text-[11px] font-medium uppercase tracking-wide text-m6m-muted">
          Your company
        </h2>
        <p
          data-testid="m-settings-company-name"
          className="mt-[8px] text-[19px] font-extrabold leading-tight text-m6m-navy"
        >
          {company?.name ?? '—'}
        </p>
        <p
          data-testid="m-settings-timezone"
          className="mt-[4px] font-mono text-[11px] text-m6m-muted"
        >
          {timeSettings.timezone}
        </p>
      </section>

      <p className="mt-[14px] px-[2px] text-[13px] leading-snug text-m6m-muted">
        Company settings are managed on the desktop app by an owner or admin.
      </p>

      {/* CUT from M-30, each with its reason in §4.13.7:
          - all five desktop settings forms — Owner/Admin company configuration.
          - tag options — a taxonomy editor; auto-tagging applies tags instantly
            and editing the vocabulary is not field work.
          - weekStartsOn, ot_threshold_hours and the paid-break rules, though
            getCompanyTimeSettings() returns all of them alongside the timezone
            this screen DOES render. D-35 cut the derived OT figure from 7a
            precisely because a crew phone has neither the room nor the authority
            to explain the rule; surfacing the raw threshold here would
            reintroduce through the back door what D-35 removed from the front.
            A-48c is the criterion, and this is the easiest cut in §4.13 to undo
            by accident because the value is already in scope.
          - gpsClockMode — D-34 removed the opt-out entirely, so displaying a
            mode implies one exists. If D-41 is ever reversed and crew ARE told
            location is captured, §4.13.7 already names this screen as the home
            for that notice.
          - a second Sign out — it is in §3.3's sheet. Two routes to one
            destructive action is how they end up with different confirmations.
            A-48d.
          - app version / build info — no service function returns it and
            nothing specced it. Not derived. */}
    </div>
  );
}
