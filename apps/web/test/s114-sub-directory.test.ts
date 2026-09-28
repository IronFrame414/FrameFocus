import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';

// detail-access.ts is a server module (redirect + a profile read); only its
// pure role predicate is under test here.
vi.mock('next/navigation', () => ({ redirect: vi.fn(), notFound: vi.fn() }));
vi.mock('@/lib/services/profiles', () => ({ getMyProfile: vi.fn() }));

import { editsSubDirectory } from '@framefocus/shared/constants/roles';
import { canEdit } from '@/app/m/detail-access';
import { forEveryRole, JUNK_ROLES } from '@/test-support/role-matrix';

// ===========================================================================
// S114 C-10 [RULED Josh 2026-09-28] — the subcontractor directory: every
// dashboard role READS the profile; Owner/Admin/PM WRITE. One predicate, both
// surfaces. The desktop profile used to redirect the Project Executive (and
// foreman and crew) while /m let them read the same row.
// ===========================================================================

describe('S114 C-10 — editsSubDirectory, every role answered', () => {
  it('Owner/Admin/PM edit; the Project Executive, foreman and crew do not', () => {
    forEveryRole(
      {
        owner: true,
        admin: true,
        project_executive: false,
        project_manager: true,
        foreman: false,
        crew_member: false,
        subcontractor: false,
        client: false,
      },
      (role, want) => expect(editsSubDirectory(role), role).toBe(want)
    );
  });

  it('junk and missing roles fail closed', () => {
    for (const junk of [...JUNK_ROLES, 'constructor', 'toString']) {
      expect(editsSubDirectory(junk), JSON.stringify(junk)).toBe(false);
    }
    expect(editsSubDirectory(null)).toBe(false);
    expect(editsSubDirectory(undefined)).toBe(false);
  });

  it('PARITY: /m canEdit("sub") gives the same answer for every role', () => {
    forEveryRole(
      {
        owner: null,
        admin: null,
        project_executive: null,
        project_manager: null,
        foreman: null,
        crew_member: null,
        subcontractor: null,
        client: null,
      },
      (role) => expect(canEdit('sub', role), role).toBe(editsSubDirectory(role))
    );
  });
});

// The desktop profile's two gates, read from source: the view admits every
// dashboard role, and the Edit link sits behind the shared predicate. (The
// page is a server component with a live Supabase read; its source is what
// can be pinned offline.)
describe('S114 C-10 — the desktop profile page', () => {
  const src = readFileSync(
    fileURLToPath(new URL('../app/dashboard/subcontractors/[id]/page.tsx', import.meta.url)),
    'utf8'
  );

  it('the view gate is isDashboardRole, not a hand list', () => {
    expect(src).toContain('!isDashboardRole(profile.role)');
    expect(src).not.toMatch(/\['owner', 'admin', 'project_manager'\]\.includes/);
  });

  it('the Edit link renders only behind editsSubDirectory', () => {
    expect(src).toContain('const canEdit = editsSubDirectory(profile.role);');
    expect(src).toMatch(
      /\{canEdit && \(\s*<Link href=\{`\/dashboard\/subcontractors\/\$\{id\}\/edit`\}/
    );
  });
});
