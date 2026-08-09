import { z } from 'zod';

/**
 * ND-18 — request bodies for the two assignment routes.
 *
 * These exist because the writes moved from client-direct Supabase calls to API
 * routes. A client-direct insert was validated by the DATABASE alone (NOT NULL,
 * FK, CHECK); a route accepts JSON from the network and must re-establish that
 * floor before it reaches the caller's Supabase client. RLS still decides
 * whether the write is ALLOWED — this only decides whether it is well-formed.
 */

const uuid = z.string().uuid();

export const punchItemCreateSchema = z.object({
  punch_list_id: uuid,
  project_id: uuid,
  title: z.string().trim().min(1, 'A title is required').max(200),
  description: z.string().trim().max(5000).nullable().optional(),
  priority: z.enum(['low', 'medium', 'high']).nullable().optional(),
  location: z.string().trim().max(200).nullable().optional(),
  trade: z.string().trim().max(100).nullable().optional(),
  // `company_members.id`, never a profile id and never a user id (§13.3).
  assignee_id: uuid.nullable().optional(),
  reference_photo_file_id: uuid.nullable().optional(),
  requires_completion_photo: z.boolean().optional(),
  requires_verification: z.boolean().optional(),
});

export type PunchItemCreateInput = z.infer<typeof punchItemCreateSchema>;

export const projectAssignmentCreateSchema = z.object({
  project_id: uuid,
  member_id: uuid,
  role_on_project: z.string().trim().max(100).nullable().optional(),
});

export type ProjectAssignmentCreateInput = z.infer<typeof projectAssignmentCreateSchema>;
