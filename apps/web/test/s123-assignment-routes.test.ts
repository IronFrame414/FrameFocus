import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  projectAssignmentCreateSchema,
  punchItemCreateSchema,
} from '@framefocus/shared/validation/assignments';
import { resolveLink } from '@/lib/notify/links';

// ============================================================================
// SLICE 7 — ND-18, §3b's two assignment writes behind server routes.
// Spec: docs/specs/notifications-architecture.md §3b, §13.2, §16. No migration.
// ============================================================================
//
// ---------------------------------------------------------------------------
// THE SERVICE-ROLE SWEEP IS THE POINT OF THIS FILE
// ---------------------------------------------------------------------------
// ND-18's whole risk is one line. Moving a client-direct write to a server
// route hands you `getSupabaseAdmin()` for free, and using it for the WRITE
// silently deletes every policy that used to gate the operation — while every
// functional test keeps passing, because the write still succeeds. It succeeds
// MORE, for people who should not be able to do it at all.
//
// So the assertion is structural: in each route, the service role reaches the
// notification and nothing else.

function read(rel: string): string {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
}
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const ROUTES = {
  punch: '../app/api/punch-items/route.ts',
  assignment: '../app/api/project-assignments/route.ts',
} as const;

describe('ND-18 — the routes do not weaken RLS', () => {
  for (const [name, path] of Object.entries(ROUTES)) {
    const code = strip(read(path));

    it(`${name}: the WRITE takes the caller's client`, () => {
      expect(code).toContain("import { createClient } from '@/lib/supabase-server'");
      // The write half is handed `supabase` — the request-scoped client — and
      // never `admin`. This is the line that carries the authorisation.
      expect(code).toMatch(/(insertPunchItemAsCaller|upsertProjectAssignmentAsCaller)\(\s*supabase,/);
    });

    it(`${name}: the service role is used ONLY for the notification`, () => {
      // getSupabaseAdmin() must appear exactly once, inside the notify call.
      const occurrences = code.match(/getSupabaseAdmin\(\)/g) ?? [];
      expect(occurrences).toHaveLength(1);
      expect(code).toMatch(/notify(PunchAssigned|ProjectAssigned)\(getSupabaseAdmin\(\)/);
    });

    it(`${name}: refuses an unauthenticated caller before touching anything`, () => {
      expect(code).toContain("{ error: 'Not authenticated' }, { status: 401 }");
      expect(code.indexOf('auth.getUser()')).toBeLessThan(code.indexOf('safeParse'));
    });

    it(`${name}: an RLS refusal is a 403 with its own message, never a 404`, () => {
      // CLAUDE.md: auth/permission failures return 401/403 with their own
      // message and never fall through to a "not found" path; the real cause is
      // logged server-side even when the client message is generic.
      expect(code).toContain('result.denied');
      expect(code).toContain('status: 403');
      expect(code).toContain('console.error');
      expect(code).not.toContain('status: 404');
    });

    it(`${name}: a notify failure cannot undo the write`, () => {
      const afterWrite = code.slice(code.indexOf('result.success'));
      expect(afterWrite).toContain('catch');
    });
  }
});

describe('ND-18 — no suppression switch exists', () => {
  it('neither route accepts a notify flag', () => {
    // A public endpoint that accepts "do not tell anyone" is a suppression
    // switch on the one trace where silence means somebody does not know they
    // have work. Non-notifying callers use the write half instead.
    for (const path of Object.values(ROUTES)) {
      const code = strip(read(path));
      expect(code).not.toMatch(/notify\s*[:=]\s*(false|body\.|parsed\.data\.notify)/);
    }
    for (const schema of [punchItemCreateSchema, projectAssignmentCreateSchema]) {
      expect(Object.keys(schema.shape)).not.toContain('notify');
    }
  });

  it('the write half is documented as NOT notifying', () => {
    // The residual risk ND-18 accepted: a new UI path calling the write half
    // directly loses its notification. The banner is the mitigation, so the
    // banner is asserted.
    const server = read('../lib/services/assignments-server.ts');
    expect(server).toContain('THESE FUNCTIONS DO NOT NOTIFY');
    expect(server).toContain('NEVER THE SERVICE ROLE');
  });

  it('the write half never reaches for the service role either', () => {
    const server = strip(read('../lib/services/assignments-server.ts'));
    expect(server).not.toContain('getSupabaseAdmin');
  });
});

describe('ND-18 — the callers that must not notify', () => {
  it('the s118 harness no longer imports createPunchItem from punch-client', () => {
    // It POSTs now, and a relative-URL fetch has no origin node can resolve.
    // Calling the write half is also what keeps the harness out of the
    // notification path structurally rather than by a flag.
    const harness = read('../test/s118-m6m-write-criteria.live.ts');
    expect(harness).toContain('insertPunchItemAsCaller');
    expect(strip(harness)).not.toMatch(/createPunchItem\s*}\s*=\s*await import/);
  });

  it('unassignMember stays a client-direct write', () => {
    // Removal has no trace. Moving it would be churn on a working path — and
    // the asymmetry being deliberate is exactly what a future reader needs.
    const client = strip(read('../lib/services/project-assignments-client.ts'));
    expect(client).toContain('export async function unassignMember');
    expect(client.slice(client.indexOf('unassignMember'))).toContain('supabase');
  });

  it('reassignMember delegates so the revive branch still notifies', () => {
    // A client-direct un-delete is still a real assignment. Left behind, it
    // would have made re-assigning after an unassign the ONE assignment that
    // notifies nobody.
    const client = strip(read('../lib/services/project-assignments-client.ts'));
    const body = client.slice(client.indexOf('export async function reassignMember'));
    expect(body).toContain('return assignMember(projectId, memberId)');
    expect(body.slice(0, body.indexOf('assignMember(projectId'))).not.toContain('.from(');
  });
});

describe('ND-18 — the client functions post, and keep their contract', () => {
  it('createPunchItem POSTs to the route', () => {
    const code = strip(read('../lib/services/punch-client.ts'));
    const body = code.slice(code.indexOf('export async function createPunchItem'));
    const next = body.indexOf('export async function updatePunchItemFields');
    const fn = body.slice(0, next);
    expect(fn).toContain("fetch('/api/punch-items'");
    // The old direct insert must be GONE, not merely bypassed.
    expect(fn).not.toContain("from('punch_list_items')");
  });

  it('assignMember POSTs to the route', () => {
    const code = strip(read('../lib/services/project-assignments-client.ts'));
    const fn = code.slice(
      code.indexOf('export async function assignMember'),
      code.indexOf('export async function unassignMember')
    );
    expect(fn).toContain("fetch('/api/project-assignments'");
    expect(fn).not.toContain("from('project_assignments').insert");
  });

  it('a network failure reads as a network failure', () => {
    // The client-direct write had this failure mode too. Reporting it as a
    // validation error would send someone hunting the wrong bug.
    for (const path of [
      '../lib/services/punch-client.ts',
      '../lib/services/project-assignments-client.ts',
    ]) {
      expect(read(path)).toContain('Could not reach the server');
    }
  });
});

describe('§3b — what the notification says and where it goes', () => {
  it('the punch destination resolves on both surfaces', () => {
    expect(resolveLink('punch', { projectId: 'p1', id: 'i1' }, 'desktop')).toBe(
      '/dashboard/projects/p1/punch'
    );
    expect(resolveLink('punch', { projectId: 'p1', id: 'i1' }, 'mobile')).toBe('/m/p/p1/punch');
  });

  it('the project destination resolves on both surfaces', () => {
    expect(resolveLink('project', { projectId: 'p1' }, 'desktop')).toBe('/dashboard/projects/p1');
    expect(resolveLink('project', { projectId: 'p1' }, 'mobile')).toBe('/m/p/p1');
  });

  it('self-assignment is silent on both traces', () => {
    const code = strip(read('../lib/notify/assignment-notify.ts'));
    const matches = code.match(/profileId === params\.assignerProfileId/g) ?? [];
    expect(matches).toHaveLength(2);
  });

  it('§13.2 — a member with no profile gets no row, and is REPORTED', () => {
    const code = strip(read('../lib/notify/assignment-notify.ts'));
    // ND-2 forbids a row without a profile. The states must not collapse into
    // a silent early return — the surface has to be able to say so.
    expect(code).toContain("state: 'email-only'");
    expect(code).toContain("state: 'unreachable'");
    expect(code).toContain("if (reach.state !== 'profile') return UNNOTIFIED(reach)");
  });
});

describe('the request schemas re-establish the floor the DB used to hold alone', () => {
  it('rejects a non-uuid assignee', () => {
    const bad = punchItemCreateSchema.safeParse({
      punch_list_id: '11111111-1111-1111-1111-111111111111',
      project_id: '11111111-1111-1111-1111-111111111111',
      title: 'x',
      assignee_id: 'not-a-uuid',
    });
    expect(bad.success).toBe(false);
  });

  it('rejects an empty title', () => {
    const bad = punchItemCreateSchema.safeParse({
      punch_list_id: '11111111-1111-1111-1111-111111111111',
      project_id: '11111111-1111-1111-1111-111111111111',
      title: '   ',
    });
    expect(bad.success).toBe(false);
  });

  it('accepts the shape the two forms actually send', () => {
    const ok = punchItemCreateSchema.safeParse({
      punch_list_id: '11111111-1111-1111-1111-111111111111',
      project_id: '22222222-2222-2222-2222-222222222222',
      title: 'Cracked tile',
      assignee_id: null,
      priority: 'high',
    });
    expect(ok.success, JSON.stringify(ok.error?.errors)).toBe(true);
  });

  it('project assignment requires both ids', () => {
    expect(
      projectAssignmentCreateSchema.safeParse({
        project_id: '11111111-1111-1111-1111-111111111111',
      }).success
    ).toBe(false);
  });
});
