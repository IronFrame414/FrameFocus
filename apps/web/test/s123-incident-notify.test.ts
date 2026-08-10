import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { LINK_KEYS, NOTIFICATIONS_HOME, resolveClickTarget, resolveLink } from '@/lib/notify/links';
import { INCIDENT_TYPE_LABEL, incidentTypeLabel } from '@/lib/services/incident-notify';

// ============================================================================
// SLICE 3 — incident-notify.ts, the first notify() consumer.
// Spec: docs/specs/notifications-architecture.md §3c, ND-5, ND-11.
// ============================================================================
//
// ---------------------------------------------------------------------------
// THE SWEEP AT THE BOTTOM IS THE POINT OF THIS FILE
// ---------------------------------------------------------------------------
// Slice 1 shipped FOUR link resolvers pointing at routes that do not exist —
// `incident` and `delivery`, both surfaces. Every one produced a well-formed URL
// that 404s, and the slice-1 suite passed over all four, because what it
// asserted was "every key resolves to SOMETHING on at least one surface". A
// wrong path is a something.
//
// `every resolved path matches a real route` closes it by walking app/ and
// matching against the routes that are actually on disk. It is the only
// assertion here that could have caught the bug it was written for, which is the
// test worth having.

const appDir = fileURLToPath(new URL('../app', import.meta.url));

/** Every route the App Router actually serves, as segment arrays. */
function collectRoutes(dir: string, segments: string[] = []): string[][] {
  const routes: string[][] = [];
  for (const entry of readdirSync(dir)) {
    const full = `${dir}/${entry}`;
    if (statSync(full).isDirectory()) {
      // `(group)` folders are organisational and contribute NO url segment;
      // `_private` folders are not routes at all.
      if (entry.startsWith('_')) continue;
      const next = entry.startsWith('(') && entry.endsWith(')') ? segments : [...segments, entry];
      routes.push(...collectRoutes(full, next));
    } else if (/^page\.(tsx|ts|jsx|js)$/.test(entry)) {
      routes.push(segments);
    }
  }
  return routes;
}

const ROUTES = collectRoutes(appDir);

function routeExists(path: string): boolean {
  const wanted = path.split('?')[0].split('/').filter(Boolean);
  return ROUTES.some((route) => {
    // A catch-all absorbs everything from its position onward.
    const catchAll = route.findIndex((s) => s.startsWith('[...'));
    if (catchAll === -1 && route.length !== wanted.length) return false;
    if (catchAll !== -1 && wanted.length < catchAll) return false;
    return route.every((segment, i) => {
      if (segment.startsWith('[...')) return true;
      if (segment.startsWith('[')) return Boolean(wanted[i]);
      return segment === wanted[i];
    });
  });
}

describe('the route matcher itself', () => {
  // A matcher that says yes to everything would make the sweep below vacuous,
  // and a matcher that says no to everything would make it unpassable. Both
  // directions are pinned before anything is judged by it.
  it('matches a real static route and a real dynamic one', () => {
    expect(routeExists('/dashboard/notifications')).toBe(true);
    expect(routeExists('/dashboard/field-ops/safety/abc-123')).toBe(true);
    expect(routeExists('/m/p/p1/safety')).toBe(true);
  });

  it('rejects a route that does not exist', () => {
    expect(routeExists('/dashboard/field-ops/incidents/abc-123')).toBe(false);
    expect(routeExists('/dashboard/nope')).toBe(false);
    // A dynamic segment must not swallow a longer path.
    expect(routeExists('/dashboard/field-ops/safety/abc-123/extra/deeper')).toBe(false);
  });

  it('found a plausible number of routes at all', () => {
    // Guards the sweep against a collectRoutes() that silently returned [] —
    // which would make every assertion below pass by having nothing to check.
    expect(ROUTES.length).toBeGreaterThan(50);
  });
});

// ---------------------------------------------------------------------------
// ✅ EMPTY — CHAT SHIPPED. A-C29 cleared [S126 slice 3].
// ---------------------------------------------------------------------------
// _Superseded, quoted not rewritten:_
//   "// `chat` is specced (§10.5) and is a LATER slice — /m/p/[projectId]/chat
//    // and /dashboard/projects/[id]/chat are not built. …
//    const PENDING_ROUTES = new Set(['chat']);"
//
// The guard did its job and did it awkwardly, which is worth recording. Slice 3
// builds `/dashboard/projects/[id]/chat`, so the desktop arm now resolves to a
// real route and `expect(routeExists(resolved)).toBe(false)` began FAILING —
// the reminder firing exactly as designed.
//
// ⚠️ BUT CLEARING THE SET ALONE WOULD HAVE BROKEN THE MOBILE ARM, and that is
// the part worth reading. `links.ts` resolved mobile chat to
// `/m/p/${projectId}/chat` — a route ND-37 says must NEVER exist, because the
// mobile Chat slot opens an overlay and owns no route, and A-C42 asserts its
// absence. So `chat` was in a state where neither leaving it here nor removing
// it could pass: the desktop arm demanded removal and the mobile arm demanded a
// route the spec forbids.
//
// The resolution is not in this file. `links.ts` was corrected to ND-40's ruled
// destination, `/m/p/{id}?chat=1` — a PARAM on a route that already exists —
// after which both arms resolve to real routes and the set empties honestly
// rather than by suppressing one half.
const PENDING_ROUTES = new Set<string>([]);

describe('ND-11 — every link key points at a route that exists', () => {
  const params = { projectId: 'p1', id: 'i1', week: '2026-08-09' };

  for (const key of LINK_KEYS) {
    for (const surface of ['mobile', 'desktop'] as const) {
      it(`${key} → ${surface}`, () => {
        const resolved = resolveLink(key, params, surface);
        // A deliberate null is a real answer (co on mobile, ND-8), not a gap.
        if (resolved === null) return;
        if (PENDING_ROUTES.has(key)) {
          expect(routeExists(resolved)).toBe(false);
          return;
        }
        expect(routeExists(resolved), `${key}/${surface} → ${resolved}`).toBe(true);
      });
    }
  }

  it('the pending list contains only what is genuinely unbuilt', () => {
    for (const key of PENDING_ROUTES) {
      expect(LINK_KEYS).toContain(key);
    }
    // Every link key now points at a route that exists. The sweep above is what
    // enforces that; this line only records that nothing is being excused.
    expect([...PENDING_ROUTES]).toEqual([]);
  });

  // A-C42's negative half, asserted at the point the destination is chosen
  // rather than only in a Playwright walk (ND-37, ND-40). The positive half —
  // that the overlay actually opens — is slice 5's, but the route's ABSENCE is
  // a property of the app tree and is true now.
  it('ND-40 — mobile chat is a PARAM on the project screen, and /m/p/{id}/chat does not exist', () => {
    expect(resolveLink('chat', { projectId: 'p1' }, 'mobile')).toBe('/m/p/p1?chat=1');
    expect(ROUTES.some((r) => r.join('/') === 'm/p/[projectId]/chat')).toBe(false);
  });
});

describe('§3c — the incident destination', () => {
  it('desktop lands on the incident, and needs no project to do it', () => {
    // Shop/yard incidents have no project (project_id is nullable precisely to
    // permit them), so a project-scoped desktop route would strand exactly the
    // case §3c calls out.
    expect(resolveLink('incident', { id: 'i1' }, 'desktop')).toBe(
      '/dashboard/field-ops/safety/i1'
    );
  });

  it('the email and the notification now land in the same place', () => {
    // sendIncidentNotifications() builds `${origin}/dashboard/field-ops/safety/${id}`.
    // Two channels about one event that open two different screens is the kind
    // of drift nobody reports as a bug; they just stop trusting one of them.
    const emailSource = readFileSync(
      fileURLToPath(new URL('../lib/services/incident-notify.ts', import.meta.url)),
      'utf8'
    );
    expect(emailSource).toContain('/dashboard/field-ops/safety/${incident.id}');
    expect(resolveLink('incident', { id: 'X' }, 'desktop')).toBe('/dashboard/field-ops/safety/X');
  });

  it('mobile lands on the project safety list — there is no detail screen', () => {
    expect(resolveLink('incident', { id: 'i1', projectId: 'p1' }, 'mobile')).toBe(
      '/m/p/p1/safety'
    );
  });

  it('a shop/yard incident has no mobile destination, and the tap still works', () => {
    expect(resolveLink('incident', { id: 'i1' }, 'mobile')).toBeNull();
    expect(resolveClickTarget('incident', { id: 'i1' }, 'mobile')).toBe(
      NOTIFICATIONS_HOME.mobile
    );
  });
});

describe('the incident type label', () => {
  it('covers exactly the three CHECK-constrained types', () => {
    expect(Object.keys(INCIDENT_TYPE_LABEL).sort()).toEqual([
      'injury',
      'near_miss',
      'property_damage',
    ]);
  });

  it('does NOT label an unknown type as a near miss', () => {
    // The superseded ternary ended in `: 'Near miss'`, so anything unrecognised
    // was reported as the least alarming of the three. Unreachable while the
    // CHECK holds; wrong in the one direction that matters if it ever does not.
    expect(incidentTypeLabel('something_new')).toBe('Incident');
    expect(incidentTypeLabel('injury')).toBe('INJURY');
  });
});

describe('the retry route stays email-only', () => {
  const retrySource = readFileSync(
    fileURLToPath(new URL('../app/api/safety-incidents/[id]/notify/route.ts', import.meta.url)),
    'utf8'
  );
  const createSource = readFileSync(
    fileURLToPath(new URL('../app/api/safety-incidents/route.ts', import.meta.url)),
    'utf8'
  );

  // Comments stripped: this file's rule is DISCUSSED at length in the retry
  // route's header, so an absence assertion over the raw text would read the
  // prose that explains the rule and conclude the rule was broken.
  const strip = (s: string) =>
    s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

  it('A retry writes no second notification row', () => {
    // The in-app rows were written at CREATE time and are still unread. A
    // failed email says nothing about them; re-notifying would double the badge
    // and re-push an incident everyone has already been told about.
    expect(strip(retrySource)).not.toContain('notifyIncident');
  });

  it('paired positive — the CREATE route does call it', () => {
    // Without this, the assertion above passes on a build where notifyIncident
    // is never called anywhere and no incident ever reaches a phone.
    expect(strip(createSource)).toContain('notifyIncident');
  });

  it('both routes exclude the submitter by profile id, not by email', () => {
    expect(strip(createSource)).toContain('profile.id');
    expect(strip(retrySource)).toContain('reporterProfile?.id');
  });
});
