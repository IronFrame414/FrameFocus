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
    mobile: (p) => (p.projectId ? `/m/p/${p.projectId}/chat` : null),
    desktop: (p) => (p.projectId ? `/dashboard/projects/${p.projectId}/chat` : null),
  },
  incident: {
    mobile: (p) => (p.id ? `/m/field/incidents/${p.id}` : null),
    desktop: (p) => (p.id ? `/dashboard/field-ops/incidents/${p.id}` : null),
  },
  delivery: {
    mobile: (p) =>
      p.projectId && p.id ? `/m/p/${p.projectId}/deliveries/${p.id}` : null,
    desktop: (p) =>
      p.projectId && p.id ? `/dashboard/projects/${p.projectId}/deliveries/${p.id}` : null,
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
