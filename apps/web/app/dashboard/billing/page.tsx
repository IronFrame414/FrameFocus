import { permanentRedirect } from 'next/navigation';

// /dashboard/billing MOVED to a Settings tab [Josh, "move Billing into Settings"].
// The overview now lives at /dashboard/settings?tab=billing (see
// ../settings/billing-settings-tab.tsx). This route stays as a PERMANENT (308)
// redirect.
//
// ⚠️ DO NOT DELETE THIS FILE, AND DO NOT MAKE IT TEMPORARY. Ruled PERMANENT by
// Josh. The reasoning, recorded here so it is not "tidied away" later:
//
//   · /dashboard/billing was a long-lived product URL — the sidebar's Billing
//     item since S130, and Stripe's billing-portal return_url. It can be
//     bookmarked, in browser history, or linked from contexts already sent that
//     cannot be edited after the fact.
//   · The cost of keeping this redirect is one route file. The cost of removing
//     it is a 404 on a billing URL — i.e. a customer who WANTS TO PAY US cannot.
//     That trade is why it is permanent, not a six-month courtesy.
//
//   · Scope note (checked against the tree, not assumed): today's retention /
//     lock recovery EMAILS point at /resubscribe?token=… (session-free,
//     lib/trial/retention-warnings.ts), NOT here — so those are unaffected by
//     the move regardless. This redirect covers the portal return_url, bookmarks
//     and history. It is defensive; permanence is the ruling, not a load-bearing
//     dependency on a specific emailed link.
//
// ?tab=billing is a query param, not a /billing path segment: the URL is for
// humans and a segment would imply a hierarchy that does not exist, and this way
// the redirect is a trivial rewrite rather than a mapping.
//
// No role check here: the Settings page and the Stripe APIs enforce owner-only
// themselves. A subcontractor/client never reaches this route — middleware's
// dashboard-role guard bounces them off /dashboard before this renders.
export default function BillingRedirectPage() {
  permanentRedirect('/dashboard/settings?tab=billing');
}
