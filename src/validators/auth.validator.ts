import { z } from 'zod';

// Registration always creates a brand new organization owned (org_admin) by
// the registering user - this keeps the auth surface self-contained without
// needing a separate "invite" flow, while still satisfying "users belong to
// organizations". Joining an *existing* org is handled by org_admins via the
// member-management endpoints, not by self-registration.
export const registerSchema = z.object({
  body: z.object({
    email: z.string().trim().toLowerCase().email(),
    password: z.string().min(8).max(128),
    name: z.string().trim().min(1).max(120),
    organizationName: z.string().trim().min(1).max(120),
  }),
});

export const loginSchema = z.object({
  body: z.object({
    email: z.string().trim().toLowerCase().email(),
    password: z.string().min(1),
  }),
});

export const refreshSchema = z.object({
  body: z.object({
    refreshToken: z.string().min(1),
  }),
});

export const logoutSchema = z.object({
  body: z.object({
    refreshToken: z.string().min(1),
    allDevices: z.boolean().optional(),
  }),
});

export type RegisterInput = z.infer<typeof registerSchema>['body'];
export type LoginInput = z.infer<typeof loginSchema>['body'];
