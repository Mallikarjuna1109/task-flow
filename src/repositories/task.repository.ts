import { Prisma, TaskPriority, TaskStatus } from '@prisma/client';
import { prisma } from '../config/prisma';

export interface TaskFilters {
  status?: TaskStatus;
  priority?: TaskPriority;
  assigneeId?: string;
  dueBefore?: Date;
  dueAfter?: Date;
  search?: string;
}

function scopedWhere(orgId: string, projectId: string, filters: TaskFilters = {}): Prisma.TaskWhereInput {
  const where: Prisma.TaskWhereInput = {
    projectId,
    deletedAt: null,
    project: { orgId, deletedAt: null },
  };

  if (filters.status) where.status = filters.status;
  if (filters.priority) where.priority = filters.priority;
  if (filters.assigneeId) {
    where.assignments = { some: { userId: filters.assigneeId } };
  }
  if (filters.dueBefore || filters.dueAfter) {
    where.dueDate = {
      ...(filters.dueAfter ? { gte: filters.dueAfter } : {}),
      ...(filters.dueBefore ? { lte: filters.dueBefore } : {}),
    };
  }
  if (filters.search) {
    where.OR = [
      { title: { contains: filters.search, mode: 'insensitive' } },
      { description: { contains: filters.search, mode: 'insensitive' } },
    ];
  }

  return where;
}

export const taskRepository = {
  create(
    projectId: string,
    data: {
      title: string;
      description?: string | null;
      status?: TaskStatus;
      priority?: TaskPriority;
      dueDate?: Date | null;
      createdById: string;
    },
  ) {
    return prisma.task.create({ data: { projectId, ...data } });
  },

  findById(orgId: string, taskId: string) {
    return prisma.task.findFirst({
      where: { id: taskId, deletedAt: null, project: { orgId, deletedAt: null } },
      include: { assignments: { include: { user: { select: { id: true, name: true, email: true } } } } },
    });
  },

  findRawById(orgId: string, taskId: string) {
    return prisma.task.findFirst({
      where: { id: taskId, deletedAt: null, project: { orgId, deletedAt: null } },
    });
  },

  findByIdUnscoped(taskId: string) {
    return prisma.task.findFirst({ where: { id: taskId, deletedAt: null } });
  },

  async list(
    orgId: string,
    projectId: string,
    filters: TaskFilters,
    params: { skip: number; take: number },
  ) {
    const where = scopedWhere(orgId, projectId, filters);
    const [data, total] = await prisma.$transaction([
      prisma.task.findMany({
        where,
        skip: params.skip,
        take: params.take,
        orderBy: { createdAt: 'desc' },
        include: { assignments: { include: { user: { select: { id: true, name: true, email: true } } } } },
      }),
      prisma.task.count({ where }),
    ]);
    return { data, total };
  },

  update(
    orgId: string,
    taskId: string,
    data: Partial<{
      title: string;
      description: string | null;
      status: TaskStatus;
      priority: TaskPriority;
      dueDate: Date | null;
    }>,
  ) {
    return prisma.task.updateMany({
      where: { id: taskId, deletedAt: null, project: { orgId, deletedAt: null } },
      data,
    });
  },

  softDelete(orgId: string, taskId: string) {
    return prisma.task.updateMany({
      where: { id: taskId, deletedAt: null, project: { orgId, deletedAt: null } },
      data: { deletedAt: new Date() },
    });
  },

  bulkUpdateStatus(orgId: string, projectId: string, taskIds: string[], status: TaskStatus) {
    return prisma.task.updateMany({
      where: {
        id: { in: taskIds },
        projectId,
        deletedAt: null,
        project: { orgId, deletedAt: null },
      },
      data: { status },
    });
  },

  async fullTextSearch(orgId: string, query: string, params: { skip: number; take: number }) {
    const rows = await prisma.$queryRaw<
      Array<{ id: string; title: string; description: string | null; project_id: string; rank: number }>
    >`
      SELECT t.id, t.title, t.description, t.project_id, ts_rank(t.search_vector, websearch_to_tsquery('english', ${query})) AS rank
      FROM tasks t
      INNER JOIN projects p ON p.id = t.project_id
      WHERE p.org_id = ${orgId}
        AND p.deleted_at IS NULL
        AND t.deleted_at IS NULL
        AND t.search_vector @@ websearch_to_tsquery('english', ${query})
      ORDER BY rank DESC
      OFFSET ${params.skip} LIMIT ${params.take}
    `;
    return rows;
  },
};
