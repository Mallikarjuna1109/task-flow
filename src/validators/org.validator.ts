import { z } from 'zod';
import { Role } from '@prisma/client';
import { uuidSchema } from './common.validator';

export const addMemberSchema = z.object({
  body: z.object({
    email: z.string().trim().toLowerCase().email(),
    role: z.nativeEnum(Role).optional(),
  }),
});

export const updateMemberRoleSchema = z.object({
  params: z.object({ userId: uuidSchema }),
  body: z.object({ role: z.nativeEnum(Role) }),
});

export const memberIdParamSchema = z.object({
  params: z.object({ userId: uuidSchema }),
});
