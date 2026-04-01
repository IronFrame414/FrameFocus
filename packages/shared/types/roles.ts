// ============================================================
// Role type definitions — shared across web + mobile
// ============================================================

/** All company-level roles */
export type CompanyRole =
  | 'owner'
  | 'admin'
  | 'project_manager'
  | 'foreman'
  | 'crew_member'
  | 'client';

/** Roles that can be assigned via invitation (owner excluded — only created at sign-up) */
export type InvitableRole = 'admin' | 'project_manager' | 'foreman' | 'crew_member' | 'client';

/** Internal team roles (excludes client) */
export type TeamRole = 'owner' | 'admin' | 'project_manager' | 'foreman' | 'crew_member';

/** Invitation status */
export type InvitationStatus = 'pending' | 'accepted' | 'expired' | 'cancelled';
