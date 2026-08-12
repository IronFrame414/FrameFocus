/**
 * ND-11 — surface-agnostic link keys, resolved per surface.
 *
 * Spec: docs/specs/notifications-architecture.md §5.4.
 *
 * ---------------------------------------------------------------------------
 * ONE ROW, TWO DESTINATIONS. NOT TWO ROWS.
 * ---------------------------------------------------------------------------
 * A notification stores a KEY plus params, never a path. The same row resolves
 * to `/m/...` on mobile and `/dashboard/...` on desktop. Writing two rows — one
 * per surface — would double every badge count, double every unread, and make
 * "mark read" mean half of what it says.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS LIVES IN lib/ AND NOT UNDER app/m/ OR app/dashboard/
 * ---------------------------------------------------------------------------
 * CLAUDE.md → PARITY: "A helper under `app/m/` or `app/dashboard/` implies that
 * surface owns it. If both need it, it belongs in `lib/`." Both need it, and
 * TECH_DEBT #129 is what happens when that rule is broken: two markup editors
 * that "did the same thing" silently disagreed about what a save produces, and a
 * desktop annotation rendered on mobile as an unannotated original.
 *
 * ---------------------------------------------------------------------------
 * THE SERVICE WORKERS DO NOT IMPORT THIS, AND DO NOT NEED TO
 * ---------------------------------------------------------------------------
 * A worker in public/ is plain JS and cannot import TypeScript (the same tax
 * that makes the 'm6m-queue-sync' literal a duplicated constant). It never has
 * to: a push is sent to ONE subscription, and `push_subscriptions.surface`
 * records which surface that subscription belongs to — so the SENDER resolves
 * the URL and puts it in the payload. The worker reads `data.url` and opens it.
 * No map is duplicated into either worker.
 */

export type Surface = 'mobile' | 'desktop';

export type LinkParams = Record<string, string | undefined>;

/**
 * A resolver per surface. `null` means "this key has no destination on this
 * surface" — a real answer, not a missing case.
 */
type Resolver = (p: LinkParams) => string | null;

interface LinkDef {
  mobile: Resolver;
  desktop: Resolver;
}

const LINKS: Record<string, LinkDef> = {
  chat: {
    // ⚠️ A PARAM, NOT A ROUTE — CORRECTED [S126 slice 3] against ND-40/ND-37.
    // _Superseded, quoted not rewritten: `/m/p/${p.projectId}/chat`._
    //
    // The Chat slot opens an OVERLAY over the current screen and owns no route
    // (ND-37), so there is no `/m/p/{id}/chat` to land on and A-C42 requires
    // that there never be one. The old path was written from the key name — the
    // same way `incident` and `delivery` were wrong below — and it resolved to
    // a 404 for every mobile mention.
    //
    // `mention-notify.ts` has asserted this shape in a comment since slice 2
    // while this file still produced the other one; the comment was right and
    // the code was not.
    //
    // The overlay itself is slice 5. Until then this lands on the project
    // screen without opening chat — the correct project, one tap short — which
    // is a soft degradation rather than a dead link.
    mobile: (p) => (p.projectId ? `/m/p/${p.projectId}?chat=1` : null),
    desktop: (p) => (p.projectId ? `/dashboard/projects/${p.projectId}/chat` : null),
  },
  // ---------------------------------------------------------------------------
  // BOTH OF THE FOLLOWING WERE WRONG WHEN FIRST WRITTEN (slice 1) AND ARE
  // CORRECTED HERE AGAINST THE ACTUAL ROUTE TREE. The superseded paths are
  // quoted, not deleted, because they are the paths a reader would GUESS from
  // the key name — which is exactly how they got written.
  //
  //   incident  mobile  '/m/field/incidents/${id}'                    <- no such route
  //             desktop '/dashboard/field-ops/incidents/${id}'        <- no such route
  //   delivery  mobile  '/m/p/${projectId}/deliveries/${id}'          <- no such route
  //             desktop '/dashboard/projects/${projectId}/deliveries/${id}'  <- no such route
  //
  // Every one of them resolved to a well-formed URL that 404s, and the slice-1
  // suite passed over all four: it asserted each key resolves to SOMETHING on at
  // least one surface, never that the something exists. `every resolved path
  // matches a real route` in s123-incident-notify.test.ts is that missing check.
  incident: {
    // No mobile incident DETAIL screen exists — `/m/p/[projectId]/safety` is a
    // list (M6M §4.11.9, M-19), and A-39 deliberately keeps injured-person names
    // off it. The list is still the right landing: the recipient set is
    // Owner/Admin/PM/Foreman and Foreman is a mobile-first role.
    //
    // A shop/yard incident has NO project (`safety_incidents.project_id` is
    // nullable precisely to permit that, §3c) and therefore no mobile
    // destination at all. That null is a real answer: resolveClickTarget() puts
    // the tap on /m/notifications, where the row is readable.
    mobile: (p) => (p.projectId ? `/m/p/${p.projectId}/safety` : null),
    // Project-independent, and the SAME path the incident email has always used
    // (incident-notify.ts sendIncidentNotifications → `${origin}${...}`), so the
    // email and the notification now land a recipient in the same place.
    desktop: (p) => (p.id ? `/dashboard/field-ops/safety/${p.id}` : null),
  },
  delivery: {
    // Mobile has a deliveries LIST and a check-in screen, no per-delivery
    // detail — same shape as `incident` above.
    mobile: (p) => (p.projectId ? `/m/p/${p.projectId}/deliveries` : null),
    // Deliveries live under FIELD-OPS, not projects, and the detail route nests
    // under `/d/` to keep orderless check-ins clear of the PO-keyed `[poId]`
    // sibling. Both details matter: dropping `/d/` lands on the PO route, which
    // resolves for a PO id and 404s for a delivery id — a bug that would look
    // intermittent.
    desktop: (p) =>
      p.projectId && p.id
        ? `/dashboard/field-ops/${p.projectId}/deliveries/d/${p.id}`
        : null,
  },
  project: {
    mobile: (p) => (p.projectId ? `/m/p/${p.projectId}` : null),
    desktop: (p) => (p.projectId ? `/dashboard/projects/${p.projectId}` : null),
  },
  punch: {
    mobile: (p) => (p.projectId ? `/m/p/${p.projectId}/punch` : null),
    desktop: (p) => (p.projectId ? `/dashboard/projects/${p.projectId}/punch` : null),
  },
  timeclock: {
    mobile: () => '/m/timeclock',
    desktop: () => '/dashboard/timeclock',
  },

  // ---------------------------------------------------------------------------
  // DELIBERATELY DESKTOP-ONLY. These are not gaps.
  // ---------------------------------------------------------------------------
  // `co` — M6M D-26 cuts change-order money from mobile for EVERY role, Owner
  // and Admin included, and TECH_DEBT #117 records that the column is UI-gated
  // with no DB floor behind it. A mobile CO destination would be the leak D-26
  // exists to prevent.
  co: {
    mobile: () => null,
    desktop: (p) =>
      p.projectId && p.id ? `/dashboard/projects/${p.projectId}/changes/${p.id}` : null,
  },
  // `timesheet_week` — ND-9 addresses these to Owner/Admin only, who are desktop
  // roles, and no mobile timesheet screen exists to open.
  timesheet_week: {
    mobile: () => null,
    desktop: (p) =>
      p.week ? `/dashboard/timeclock/timesheets?week=${p.week}` : '/dashboard/timeclock/timesheets',
  },
  // `estimate` — no mobile estimating surface exists (M6M D-9 keeps Finance off
  // mobile; Estimates is Owner/Admin/PM on desktop).
  estimate: {
    mobile: () => null,
    desktop: (p) => (p.id ? `/dashboard/estimates/${p.id}` : null),
  },
  // `trial_warning` — REGISTERED [S138]. S137 shipped `linkKey: 'trial_warning'`
  // in lifecycle.ts with no entry here, so `resolveLink()` returned null for
  // every warning: the in-app notice rendered non-interactive and a push click
  // fell through to the notifications list. Not a crash, which is why it went
  // unnoticed — the key was written before the screen existed.
  //
  // Both surfaces resolve to the SAME desktop route, and that is the honest
  // answer rather than a parity violation: the warning is addressed to Owner
  // and Admin, `/m` has no trial surface to open, and the page is a plain
  // responsive document. Sending a phone to `null` would drop an Owner reading
  // notifications on their phone at the notifications list with no way to
  // reach the notice they just tapped.
  trial_warning: {
    mobile: () => '/dashboard/trial',
    desktop: () => '/dashboard/trial',
  },
};

/** Where a surface sends a notification that has no destination of its own. */
export const NOTIFICATIONS_HOME: Record<Surface, string> = {
  mobile: '/m/notifications',
  desktop: '/dashboard/notifications',
};

/**
 * Resolve a stored link key for one surface.
 *
 * Returns `null` when the notification is deliberately unlinked — ND-8 gives a
 * non-author PM a CO notification with NO link at all, because the S121 read
 * floor makes the row unreadable to them and a link would 404. A null here is
 * therefore a real state the UI must render as non-interactive (§10.1), not a
 * lookup failure to paper over.
 */
export function resolveLink(
  linkKey: string | null | undefined,
  params: LinkParams | null | undefined,
  surface: Surface
): string | null {
  if (!linkKey) return null;
  const def = LINKS[linkKey];
  if (!def) return null;
  return def[surface](params ?? {});
}

/**
 * Where a push notification's click should land on `surface`.
 *
 * Unlike resolveLink() this NEVER returns null: a push has already interrupted
 * the user, so opening the notifications list is the correct floor. Landing on a
 * dead route or doing nothing at all would both be worse (A-N20).
 */
export function resolveClickTarget(
  linkKey: string | null | undefined,
  params: LinkParams | null | undefined,
  surface: Surface
): string {
  return resolveLink(linkKey, params, surface) ?? NOTIFICATIONS_HOME[surface];
}

/** Every key the resolver knows. Exported so a test can assert the table's shape. */
export const LINK_KEYS = Object.keys(LINKS);
