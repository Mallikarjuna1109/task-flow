import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';

export const projectRepository = {
  create(orgId: string, data: { name: string; description?: string | null; createdById: string }) {
    return prisma.project.create({
      data: { orgId, name: data.name, description: data.description, createdById: data.createdById },
    });
  },

  findById(orgId: string, projectId: string) {
    return prisma.project.findFirst({
      where: { id: projectId, orgId, deletedAt: null },
    });
  },

  findByIdUnscoped(projectId: string) {
    return prisma.project.findFirst({ where: { id: projectId, deletedAt: null } });
  },

  list(orgId: string, params: { skip: number; take: number }) {
    const where: Prisma.ProjectWhereInput = { orgId, deletedAt: null };
    return prisma.$transaction([
      prisma.project.findMany({
        where,
        skip: params.skip,
        take: params.take,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.project.count({ where }),
    ]);
  },

  update(orgId: string, projectId: string, data: { name?: string; description?: string | null }) {
    return prisma.project.updateMany({
      where: { id: projectId, orgId, deletedAt: null },
      data,
    });
  },

  softDelete(orgId: string, projectId: string) {
    return prisma.project.updateMany({
      where: { id: projectId, orgId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
  },

  async taskCountsByStatus(orgId: string, projectId: string) {
    const grouped = await prisma.task.groupBy({
      by: ['status'],
      where: { projectId, deletedAt: null, project: { orgId, deletedAt: null } },
      _count: { _all: true },
    });
    return grouped.map((row) => ({ status: row.status, count: row._count._all }));
  },
};
