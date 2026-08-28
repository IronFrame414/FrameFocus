import { createClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import { getSessionsForReview } from '@/lib/services/time-tracking';
import { getCompanyTimeSettings } from '@/lib/services/company';
import {
  weekWindowForYmd,
  weeklyHoursSummary,
} from '@framefocus/shared/utils/time-tracking';
import { companyToday } from '@framefocus/shared/utils/dates';
import TeamPageClient from './team-page-client';

/**
 * 14e Team (desktop-redesign §8.5).
 *
 * ⚠️ This route INVERTS the usual pattern — the client fetches members and
 * invitations from the BROWSER — and that is deliberately NOT "fixed" here.
 * What this server page adds is the data for the two NEW columns, precisely
 * because their mechanisms are server-side and already correct elsewhere:
 *
 *  · Hours this week + OT — ONE getSessionsForReview({from,to}) for the whole
 *    week, grouped in JS, then the pure weeklyHoursSummary() per member — the
 *    timeclock/timesheets pattern verbatim. NOT getWeeklyHours(memberId) in a
 *    list.
 *  · Burden / hr — derived, never stored: rate × multiplier OR rate + company
 *    fixed, per member_burden_settings.burden_source; the pay-rate-section
 *    arithmetic. Pay rate is effective-dated — the rate IN FORCE today.
 *
 * Both reads are caller-RLS-scoped: pay rates are Owner/Admin, so a gated
 * role's burden map comes back empty and the column reflows to em-dashes.
 */
export default async function TeamPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/sign-in');
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('user_id', user.id)
    .single();

  if (!profile) {
    redirect('/sign-in');
  }

  const { timezone, weekStartsOn, time: timeSettings } = await getCompanyTimeSettings();

  // member ↔ profile mapping (sessions and rates key on company_members.id;
  // the list rows are profiles).
  const { data: memberRows } = await supabase
    .from('company_members')
    .select('id, profile_id')
    .eq('is_deleted', false);
  const profileByMember = new Map<string, string>();
  for (const m of memberRows ?? []) {
    if (m.profile_id) profileByMember.set(m.id, m.profile_id);
  }

  // ── Hours this week + overtime ───────────────────────────────────────────
  const { weekStart, weekEnd } = weekWindowForYmd(undefined, timezone, weekStartsOn);
  const sessions = await getSessionsForReview({
    from: weekStart.toISOString(),
    to: weekEnd.toISOString(),
  });
  const byMember = new Map<string, typeof sessions>();
  for (const s of sessions) {
    const list = byMember.get(s.member_id) ?? [];
    list.push(s);
    byMember.set(s.member_id, list);
  }
  const hours: Record<string, { paid: number; overtime: number }> = {};
  for (const [memberId, memberSessions] of byMember) {
    const profileId = profileByMember.get(memberId);
    if (!profileId) continue;
    const summary = weeklyHoursSummary(
      memberSessions.map((s) => ({ session: s, segments: s.segments })),
      timeSettings,
      undefined,
      timezone
    );
    hours[profileId] = { paid: summary.paidHours, overtime: summary.overtimeHours };
  }

  // ── Burden / hr (Owner/Admin by RLS — empty maps reflow the column) ──────
  const today = companyToday(timezone);
  const [ratesRes, burdenRes, companyRes] = await Promise.all([
    supabase
      .from('member_pay_rates')
      .select('member_id, hourly_rate, effective_date')
      .eq('is_deleted', false)
      .order('effective_date', { ascending: false }),
    supabase.from('member_burden_settings').select('member_id, burden_multiplier, burden_source'),
    supabase.from('companies').select('fixed_burden_per_hour').single(),
  ]);
  const fixedBurden = Number(companyRes.data?.fixed_burden_per_hour ?? 0);
  const currentRate = new Map<string, number>();
  for (const r of ratesRes.data ?? []) {
    // Rows arrive newest-first; the first row at-or-before today is the rate
    // in force (the pay-rate-section resolution).
    if (!currentRate.has(r.member_id) && r.effective_date <= today) {
      currentRate.set(r.member_id, Number(r.hourly_rate));
    }
  }
  const burdenSettings = new Map(
    (burdenRes.data ?? []).map((b) => [b.member_id, b] as const)
  );
  const burden: Record<string, number> = {};
  for (const [memberId, rate] of currentRate) {
    const profileId = profileByMember.get(memberId);
    if (!profileId) continue;
    const settings = burdenSettings.get(memberId);
    const source = settings?.burden_source ?? 'member_multiplier';
    const multiplier = Number(settings?.burden_multiplier ?? 1.0);
    burden[profileId] =
      source === 'company_fixed' ? rate + fixedBurden : rate * multiplier;
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <TeamPageClient userRole={profile.role} hours={hours} burden={burden} />
    </div>
  );
}
