import { z } from 'zod';
import { TaskPriority, TaskStatus } from '@prisma/client';
import { paginationQuerySchema, uuidSchema } from './common.validator';

const statusEnum = z.nativeEnum(TaskStatus);
const priorityEnum = z.nativeEnum(TaskPriority);

export const createTaskSchema = z.object({
  params: z.object({ projectId: uuidSchema }),
  body: z.object({
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(5000).optional(),
    status: statusEnum.optional(),
    priority: priorityEnum.optional(),
    dueDate: z.coerce.date().optional(),
  }),
});

export const updateTaskSchema = z.object({
  params: z.object({ projectId: uuidSchema, taskId: uuidSchema }),
  body: z
    .object({
      title: z.string().trim().min(1).max(200).optional(),
      description: z.string().trim().max(5000).nullable().optional(),
      status: statusEnum.optional(),
      priority: priorityEnum.optional(),
      dueDate: z.coerce.date().nullable().optional(),
    })
    .refine((data) => Object.keys(data).length > 0, { message: 'At least one field must be provided' }),
});

export const taskIdParamSchema = z.object({
  params: z.object({ projectId: uuidSchema, taskId: uuidSchema }),
});

export const listTasksSchema = z.object({
  params: z.object({ projectId: uuidSchema }),
  query: paginationQuerySchema.extend({
    status: statusEnum.optional(),
    priority: priorityEnum.optional(),
    assigneeId: uuidSchema.optional(),
    dueBefore: z.coerce.date().optional(),
    dueAfter: z.coerce.date().optional(),
  }),
});

export const assignTaskSchema = z.object({
  params: z.object({ projectId: uuidSchema, taskId: uuidSchema }),
  body: z.object({ userId: uuidSchema }),
});

export const unassignTaskSchema = z.object({
  params: z.object({ projectId: uuidSchema, taskId: uuidSchema, userId: uuidSchema }),
});

export const bulkUpdateStatusSchema = z.object({
  params: z.object({ projectId: uuidSchema }),
  body: z.object({
    taskIds: z.array(uuidSchema).min(1).max(200),
    status: statusEnum,
  }),
});

export const searchTasksSchema = z.object({
  query: paginationQuerySchema.extend({
    q: z.string().trim().min(1).max(200),
  }),
});

export const createCommentSchema = z.object({
  params: z.object({ projectId: uuidSchema, taskId: uuidSchema }),
  body: z.object({ body: z.string().trim().min(1).max(5000) }),
});
