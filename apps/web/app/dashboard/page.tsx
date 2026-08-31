import { createClient } from '@/lib/supabase-server';
import Link from 'next/link';
import { getCalendarEvents } from '@/lib/services/schedule';
import { getMyMember } from '@/lib/services/members';
import { getDashboardData, getPortfolioMoney } from '@/lib/services/dashboard';
import { perfTime } from '@/lib/perf';
import { ScheduleCard } from './schedule-card';
import { cardStyle, color, font, h2Style, microLabelStyle, primaryButtonStyle } from '@/lib/theme';

/**
 * ui-02 — 1a summary dashboard: header, 4-up KPI row, schedule card +
 * Needs-Attention rail. Financial floor (ui-01 §11): Contract Value card and
 * all $ captions are Owner/Admin only; the KPI row REFLOWS for gated roles.
 */

/** $221.7k-style compact money for KPI numbers. */
function compactMoney(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}m`;
  if (abs >= 1_000) return `$${(value / 1_000).toFixed(1)}k`;
  return `$${value.toFixed(0)}`;
}

const DOT_COLORS = { amber: '#b45309', red: '#c0362c', blue: '#3b4ae0', green: '#1f8f4e' };

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await perfTime('page.getUser', () => supabase.auth.getUser());

  const { data: profile } = await perfTime('page.profiles', () =>
    supabase.from('profiles').select('first_name, role').eq('user_id', user?.id ?? '').single()
  );

  const role = profile?.role ?? '';
  const canSeeFinancials = role === 'owner' || role === 'admin';
  const canCreate = ['owner', 'admin', 'project_manager'].includes(role);
  const isCrew = role === 'crew_member' || role === 'subcontractor';
  const myMember = isCrew ? await getMyMember() : null;

  // Money-moving rollup is Owner/Admin only ($ floor) — a gated role triggers
  // ZERO of its queries, the established posture (14a's margin loop).
  const [{ kpis, attention }, events, money] = await Promise.all([
    perfTime('page.getDashboardData', () => getDashboardData()),
    perfTime('page.getCalendarEvents', () => getCalendarEvents({ ownMemberId: myMember?.id })),
    canSeeFinancials
      ? perfTime('page.getPortfolioMoney', () => getPortfolioMoney())
      : Promise.resolve(null),
  ]);

  const today = new Date();
  const subtitle = `${today.toLocaleDateString('en-US', { weekday: 'long' })}, ${today.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · ${kpis.activeProjectCount} active project${kpis.activeProjectCount === 1 ? '' : 's'}`;

  // KPI cards — financial floor reflow (ui-01 §11): Contract Value is
  // Owner/Admin only; gated roles get a 3-up of the remaining cards.
  const kpiCards: {
    label: string;
    value: string;
    caption: string;
    captionColor: string;
    captionWeight: number;
  }[] = [
    {
      label: 'Active Projects',
      value: String(kpis.activeProjectCount),
      caption: kpis.pastTargetCount === 0 ? 'On track' : `${kpis.pastTargetCount} past target`,
      captionColor: kpis.pastTargetCount === 0 ? color.success : color.warning,
      captionWeight: 600,
    },
    // [S97] SPLIT, not captioned. One "Contract Value" card summed a BINDING
    // obligation (fixed-price) with a NON-BINDING projection (cost-plus/T&M) —
    // P11 forbids the second from billing math, and a headline that adds them
    // is neither figure. Each half is now its own card, and a card with nothing
    // behind it does not render at all rather than showing a misleading zero.
    ...(canSeeFinancials && kpis.contractValueFixedCount > 0
      ? [
          {
            label: 'Contract Value',
            value: compactMoney(kpis.contractValueFixed),
            caption: `${kpis.contractValueFixedCount} fixed-price job${kpis.contractValueFixedCount === 1 ? '' : 's'}`,
            captionColor: color.muted,
            captionWeight: 400,
          },
        ]
      : []),
    ...(canSeeFinancials && kpis.contractValueProjectedCount > 0
      ? [
          {
            label: 'Projected Value',
            value: compactMoney(kpis.contractValueProjected),
            caption: `${kpis.contractValueProjectedCount} cost-plus / T&M · non-binding`,
            captionColor: color.muted,
            captionWeight: 400,
          },
        ]
      : []),
    {
      label: 'Awaiting Signature',
      value: String(kpis.awaitingCount),
      caption: canSeeFinancials
        ? `${compactMoney(kpis.awaitingSum)} in change orders`
        : 'change orders sent',
      captionColor: canSeeFinancials ? color.warning : color.muted,
      captionWeight: canSeeFinancials ? 600 : 400,
    },
    {
      label: 'Open Punch Items',
      value: String(kpis.openPunchCount),
      caption: 'across active jobs',
      captionColor: color.muted,
      captionWeight: 400,
    },
  ];

  return (
    <div>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '22px',
        }}
      >
        <div>
          <h2 style={h2Style}>Welcome back, {profile?.first_name ?? 'there'}</h2>
          <p style={{ color: color.muted, fontSize: '14px', margin: '4px 0 0' }}>{subtitle}</p>
        </div>
        {canCreate && (
          <Link href="/dashboard/projects/new" style={primaryButtonStyle}>
            + New Project
          </Link>
        )}
      </div>

      {/* KPI row — reflow to visible-card count (ui-01 §11) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${kpiCards.length}, 1fr)`,
          gap: '14px',
          marginBottom: '18px',
        }}
      >
        {kpiCards.map((kpi) => (
          <div key={kpi.label} style={{ ...cardStyle, padding: '16px 17px' }}>
            <div style={microLabelStyle}>{kpi.label}</div>
            <div
              style={{
                fontFamily: font.mono,
                fontSize: '30px',
                fontWeight: 600,
                color: color.navy,
                margin: '4px 0 2px',
              }}
            >
              {kpi.value}
            </div>
            <div
              style={{ fontSize: '12px', color: kpi.captionColor, fontWeight: kpi.captionWeight }}
            >
              {kpi.caption}
            </div>
          </div>
        ))}
      </div>

      {/* Money moving (§8.12.2) — Owner/Admin only; the row simply doesn't
          render for gated roles (less, not nothing: the rest of the page is
          untouched). No "cash in 30 days" cut — nothing writes due_date (P-1). */}
      {money && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '14px',
            marginBottom: '18px',
          }}
        >
          {[
            {
              label: 'Coming in',
              value: compactMoney(money.comingIn),
              caption: 'open invoices, net of retainage',
            },
            {
              label: 'Going out',
              value: compactMoney(money.goingOut),
              caption: 'committed to subs & suppliers, unpaid',
            },
            {
              label: 'Not yet billed',
              value: compactMoney(money.notYetBilled),
              caption: 'earned on active jobs, not invoiced',
            },
          ].map((m) => (
            <div key={m.label} style={{ ...cardStyle, padding: '16px 17px' }}>
              <div style={microLabelStyle}>{m.label}</div>
              <div
                style={{
                  fontFamily: font.mono,
                  fontSize: '24px',
                  fontWeight: 600,
                  color: color.navy,
                  margin: '4px 0 2px',
                }}
              >
                {m.value}
              </div>
              <div style={{ fontSize: '12px', color: color.muted }}>{m.caption}</div>
            </div>
          ))}
        </div>
      )}

      {/* Two-column region */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '18px' }}>
        <div style={{ ...cardStyle, padding: '18px 20px' }}>
          <ScheduleCard events={events} />
        </div>

        <div style={{ ...cardStyle, padding: '18px' }}>
          <div style={{ ...microLabelStyle, fontSize: '13px', fontWeight: 700, color: color.navy }}>
            Needs Attention
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '14px' }}>
            {attention.length === 0 && (
              <p style={{ fontSize: '13px', color: color.faint, margin: 0 }}>
                Nothing needs attention right now.
              </p>
            )}
            {attention.map((item, i) => {
              const body = (
                <span style={{ fontSize: '13px', color: color.body, lineHeight: 1.4 }}>
                  <span style={{ color: color.navy, fontWeight: 700 }}>{item.emphasis}</span>{' '}
                  {item.text}
                </span>
              );
              return (
                <div key={i} style={{ display: 'flex', gap: '9px', alignItems: 'flex-start' }}>
                  <span
                    style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      backgroundColor: DOT_COLORS[item.severity],
                      marginTop: '5px',
                      flexShrink: 0,
                    }}
                  />
                  {item.href ? (
                    <Link href={item.href} style={{ textDecoration: 'none' }}>
                      {body}
                    </Link>
                  ) : (
                    body
                  )}
                </div>
              );
            })}
          </div>
          <button
            title="Activity log arrives with a later module"
            style={{
              width: '100%',
              marginTop: '16px',
              padding: '9px',
              borderRadius: '8px',
              border: 'none',
              backgroundColor: color.blueTint,
              color: color.primary,
              fontFamily: font.sans,
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'default',
            }}
          >
            View all activity
          </button>
        </div>
      </div>
    </div>
  );
}
