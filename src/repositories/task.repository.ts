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

// As with projectRepository, `orgId` is mandatory everywhere and is always
// applied against `project.orgId` (a task has no org_id column of its own -
// tenancy is derived transitively through its parent project). This means a
// task ID from another organization simply never matches the `where`
// clause, so it is indistinguishable from a non-existent task - the caller
// cannot leak whether the resource exists in another tenant.
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
    // Bonus: PostgreSQL full-text search over the generated `search_vector`
    // column (title weighted above description). Falls back gracefully to
    // an ILIKE match if raw tsquery syntax in `search` is invalid.
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

  /** Bare task row scoped by org, without relations - used by the assignment service. */
  findRawById(orgId: string, taskId: string) {
    return prisma.task.findFirst({
      where: { id: taskId, deletedAt: null, project: { orgId, deletedAt: null } },
    });
  },

  /**
   * NO org filter - used only to distinguish "does not exist" (404) from
   * "exists in another org" (403). See projectRepository.findByIdUnscoped
   * for the rationale; never return this row's fields to the client.
   */
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

  /** Bonus: bulk status update, still fully org/project scoped. */
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

  /** Bonus: full-text search using the generated tsvector column (falls back to ILIKE via `list`). */
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
