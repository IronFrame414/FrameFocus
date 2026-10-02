import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { reachableFrom, walk, WEB_ROOT } from './support/m-i18n-scan';

// S122 Part 7 [Josh, 2026-10-02, report R2.10] — THE PORTAL NEVER REACHES THE
// CRITICAL PATH ENGINE. Float and the critical flag exist only where the engine
// runs; if nothing the portal mounts can reach it, no client page can compute
// them and serialize them into its RSC payload (#136: a gated read path, with
// the leak arriving through another).
//
// ⚠️ TRANSITIVE, not the route's own import list: a route imports a component,
// the component a service, and the engine arrives two hops down. Server AND
// client files: the leak is a Server Component computing float, which never
// ships as client JS, so a client-bundle check would miss it. And the shared
// package IS resolved — notify-text → critical-path-writes → critical-path is
// exactly the chain that made the disclaimer move to its own module.

const OPTS = { shared: true, dynamic: true } as const;
const PORTAL = reachableFrom(walk(join(WEB_ROOT, 'app/portal')), OPTS);
const ENGINE = '../../packages/shared/utils/critical-path.ts';

/** Anything that computes, loads or describes Critical Path — the client's view must reach none of it. */
function forbidden(files: string[]): string[] {
  return files.filter(
    (f) =>
      f.startsWith('../../packages/shared/utils/critical-path') ||
      (f.startsWith('lib/critical-path/') && f !== 'lib/critical-path/client-disclaimer.ts')
  );
}

describe('S122 Part 7 — the portal import graph never reaches the engine', () => {
  it('the walk reached the real portal: the page, its read service and the disclaimer (a walk that sees nothing passes vacuously)', () => {
    expect(PORTAL.length).toBeGreaterThan(10);
    expect(PORTAL).toContain('app/portal/[projectId]/page.tsx');
    expect(PORTAL).toContain('lib/services/portal.ts');
    expect(PORTAL).toContain('lib/critical-path/client-disclaimer.ts');
  });

  it('CONTROL — the same walk from the DESKTOP Critical Path page DOES reach the engine', () => {
    const desktop = reachableFrom([join(WEB_ROOT, 'app/dashboard/projects/[id]/critical-path/page.tsx')], OPTS);
    expect(desktop).toContain(ENGINE);
    expect(forbidden(desktop).length).toBeGreaterThan(0);
  });

  it('⚠️ nothing under app/portal reaches the engine, its writes, or any lib/critical-path module but the disclaimer', () => {
    expect(forbidden(PORTAL)).toEqual([]);
  });
});

// [S123 D-1a, Josh RULED] THE CLIENT GANTT IS ITS OWN DRAWING. The staff Gantt
// draws dependency arrows, slack ghosts and the red critical chain; a client
// version made from it "with a flag" would still carry that data into the
// payload (#136). So the portal must not reach the staff schedule components
// at all — enforced by the graph walk, not by review (stop rule 10).
const STAFF_GANTT = 'components/schedule/gantt.tsx';

describe('S123 D-1a — the portal never reaches the staff Gantt', () => {
  it('the walk reached the client Gantt (positive control)', () => {
    expect(PORTAL).toContain('app/portal/[projectId]/client-gantt.tsx');
  });

  it('CONTROL — the desktop Critical Path page DOES reach the staff Gantt', () => {
    const desktop = reachableFrom([join(WEB_ROOT, 'app/dashboard/projects/[id]/critical-path/page.tsx')], OPTS);
    expect(desktop).toContain(STAFF_GANTT);
  });

  it('⚠️ nothing under app/portal reaches components/schedule/ (the staff Gantt, its calendar, its sheet)', () => {
    expect(PORTAL.filter((f) => f.startsWith('components/schedule/'))).toEqual([]);
  });
});
