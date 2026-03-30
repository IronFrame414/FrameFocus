import { z } from 'zod';

// ── Auth Schemas ──

export const signUpSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  firstName: z.string().min(1, 'First name is required').max(100),
  lastName: z.string().min(1, 'Last name is required').max(100),
  companyName: z.string().min(1, 'Company name is required').max(200),
});

export const signInSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export type SignUpInput = z.infer<typeof signUpSchema>;
export type SignInInput = z.infer<typeof signInSchema>;

// ── Company Schemas ──

export const companySettingsSchema = z.object({
  name: z.string().min(1, 'Company name is required').max(200),
  tradeType: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  addressLine1: z.string().optional(),
  addressLine2: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zip: z.string().optional(),
});

export type CompanySettingsInput = z.infer<typeof companySettingsSchema>;

// ── Invite User Schema ──

export const inviteUserSchema = z.object({
  email: z.string().email('Invalid email address'),
  role: z.enum(['project_manager', 'foreman', 'crew_member']),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
});

export type InviteUserInput = z.infer<typeof inviteUserSchema>;
