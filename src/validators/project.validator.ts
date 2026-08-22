import { z } from 'zod';
import { paginationQuerySchema, uuidSchema } from './common.validator';

export const createProjectSchema = z.object({
  body: z.object({
    name: z.string().trim().min(1).max(200),
    description: z.string().trim().max(2000).optional(),
  }),
});

export const updateProjectSchema = z.object({
  params: z.object({ projectId: uuidSchema }),
  body: z
    .object({
      name: z.string().trim().min(1).max(200).optional(),
      description: z.string().trim().max(2000).nullable().optional(),
    })
    .refine((data) => Object.keys(data).length > 0, { message: 'At least one field must be provided' }),
});

export const projectIdParamSchema = z.object({
  params: z.object({ projectId: uuidSchema }),
});

export const listProjectsSchema = z.object({
  query: paginationQuerySchema,
});
