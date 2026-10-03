import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { CompanyRole } from '@framefocus/shared/types/roles';
import { forEveryRole, JUNK_ROLES } from '@/test-support/role-matrix';
import {
  canBulkDeletePhotos,
  canDeletePhoto,
  canSharePhotoWithClient,
  canSharePhotosWithClient,
} from '@/lib/photos/delete-permission';

// ============================================================================
// S127 item 4d (A-1) — bulk actions on a SELECTION of photos. TOTAL maps.
//
// RULED A-1a [Josh, 2026-10-02, option A]: bulk delete is OWNER/ADMIN ONLY,
// SOFT, recoverable — narrower than one-photo delete (Owner/Admin/PM/PE) on
// purpose. "Show to client" is Owner/Admin because the database refuses
// `client_visible` to everyone else (enforce_files_column_scope).
// ============================================================================

const OWNER_ADMIN: Record<CompanyRole, boolean> = {
  owner: true,
  admin: true,
  project_executive: false,
  project_manager: false,
  foreman: false,
  crew_member: false,
  client: false,
  subcontractor: false,
};

describe('canBulkDeletePhotos — the multi-select "Delete" / "Move to Trash"', () => {
  forEveryRole(OWNER_ADMIN, (role, allowed) => {
    it(`${role} → ${allowed ? 'offered' : 'not offered'}`, () => {
      expect(canBulkDeletePhotos(role)).toBe(allowed);
    });
  });
  it('fails closed on anything that is not a role', () => {
    for (const junk of [...JUNK_ROLES, null, undefined])
      expect(canBulkDeletePhotos(junk)).toBe(false);
  });
  it('is NARROWER than one-photo delete: a PM and a PE keep single delete, lose bulk', () => {
    for (const role of ['project_manager', 'project_executive'] as const) {
      expect(canDeletePhoto(role)).toBe(true);
      expect(canBulkDeletePhotos(role)).toBe(false);
    }
  });
});

// [S127, RULED Josh 2026-10-03] THE FINAL MATRIX — all four rows, one file.
// Bulk share widened to PE. _Superseded, quoted:_ `forEveryRole(OWNER_ADMIN, …)`
// for canSharePhotosWithClient (was: project_executive → not offered).
const BULK_SHARE: Record<CompanyRole, boolean> = { ...OWNER_ADMIN, project_executive: true };
const SINGLE_SHARE: Record<CompanyRole, boolean> = {
  ...OWNER_ADMIN,
  project_executive: true,
  project_manager: true,
};
const SINGLE_DELETE: Record<CompanyRole, boolean> = {
  ...OWNER_ADMIN,
  project_executive: true,
  project_manager: true,
};

describe('canSharePhotoWithClient — ONE photo\'s "Shared with client" toggle', () => {
  forEveryRole(SINGLE_SHARE, (role, allowed) => {
    it(`${role} → ${allowed ? 'offered' : 'not offered'}`, () => {
      expect(canSharePhotoWithClient(role)).toBe(allowed);
    });
  });
  it('fails closed on anything that is not a role', () => {
    for (const junk of [...JUNK_ROLES, null, undefined])
      expect(canSharePhotoWithClient(junk)).toBe(false);
  });
});

describe("canDeletePhoto — ONE photo's delete, pinned UNCHANGED by the share widening", () => {
  forEveryRole(SINGLE_DELETE, (role, allowed) => {
    it(`${role} → ${allowed ? 'offered' : 'not offered'}`, () => {
      expect(canDeletePhoto(role)).toBe(allowed);
    });
  });
});

describe('bulk share and bulk delete DIFFER ON PURPOSE (sharing is reversible, deleting is not)', () => {
  it('PE may bulk-share but not bulk-delete; PM neither', () => {
    expect(canSharePhotosWithClient('project_executive')).toBe(true);
    expect(canBulkDeletePhotos('project_executive')).toBe(false);
    expect(canSharePhotosWithClient('project_manager')).toBe(false);
    expect(canBulkDeletePhotos('project_manager')).toBe(false);
  });
});

describe('canSharePhotosWithClient — the multi-select "Show to client"', () => {
  forEveryRole(BULK_SHARE, (role, allowed) => {
    it(`${role} → ${allowed ? 'offered' : 'not offered'}`, () => {
      expect(canSharePhotosWithClient(role)).toBe(allowed);
    });
  });
  it('fails closed on anything that is not a role', () => {
    for (const junk of [...JUNK_ROLES, null, undefined])
      expect(canSharePhotosWithClient(junk)).toBe(false);
  });
});

describe('ONE mechanism, both surfaces [PARITY]', () => {
  const src = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');
  const M_GRID = src('../app/m/p/[projectId]/photos/photo-grid.tsx');
  const M_PAGE = src('../app/m/p/[projectId]/photos/page.tsx');
  const D_SEL = src('../app/dashboard/projects/[id]/photos/photo-selection.tsx');
  const D_PAGE = src('../app/dashboard/projects/[id]/photos/page.tsx');

  it('both selection bars write through lib/photos/bulk-actions', () => {
    for (const [name, s] of [
      ['/m grid', M_GRID],
      ['desktop selection', D_SEL],
    ] as const) {
      expect(s, name).toContain("from '@/lib/photos/bulk-actions'");
      expect(s, name).toContain('trashPhotos(');
      expect(s, name).toContain('setPhotosClientVisible(');
      expect(s, name).not.toContain('softDeleteFile(');
    }
  });

  it('both pages gate the bulk controls on the Owner/Admin rules, not canDeletePhoto', () => {
    for (const [name, s] of [
      ['/m page', M_PAGE],
      ['desktop page', D_PAGE],
    ] as const) {
      expect(s, name).toContain('canBulkDeletePhotos(profile?.role)');
      expect(s, name).toContain('canSharePhotosWithClient(profile?.role)');
    }
    expect(M_PAGE).not.toMatch(/<PhotoGrid[^>]*canDelete=\{canDelete\}/);
  });

  it('every single-photo share toggle is drawn on canSharePhotoWithClient, never on "is staff"', () => {
    expect(D_PAGE).toContain('const canShareOne = canSharePhotoWithClient(profile?.role);');
    expect(D_PAGE.replace(/\{\/\*[\s\S]*?\*\/\}/g, '')).toMatch(
      /\{canShareOne && \(\s*<PhotoVisibilityToggle/
    );
    expect(D_PAGE.replace(/\{\/\*[\s\S]*?\*\/\}/g, '')).not.toMatch(
      /isStaff && \(\s*<PhotoVisibilityToggle/
    );
    const LOG = src('../app/dashboard/field-ops/[projectId]/daily-logs/[logId]/page.tsx');
    expect(LOG).toContain('canShare={canSharePhotoWithClient(profile.role)}');
  });

  it('both confirmations say where deleted photos go and who will not see shared ones', () => {
    expect(D_SEL).toContain('Photos → Trash');
    expect(D_SEL).toContain('a documents-only client sees');
    expect(M_GRID).toContain("t('photos.grid.deleteToTrash')");
    expect(M_GRID).toContain("t('photos.grid.clientCaveat')");
  });
});
