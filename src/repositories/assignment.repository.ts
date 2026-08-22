import { NotificationStatus, Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '../config/prisma';

type Tx = Prisma.TransactionClient | PrismaClient;

export const assignmentRepository = {
  findActive(taskId: string, userId: string, client: Tx = prisma) {
    return client.taskAssignment.findUnique({ where: { taskId_userId: { taskId, userId } } });
  },

  create(
    data: { taskId: string; userId: string; assignedById: string },
    client: Tx = prisma,
  ) {
    return client.taskAssignment.create({ data });
  },

  delete(taskId: string, userId: string, client: Tx = prisma) {
    return client.taskAssignment.deleteMany({ where: { taskId, userId } });
  },

  updateNotificationStatus(
    id: string,
    status: NotificationStatus,
    extra: { notificationJobId?: string | null; incrementAttempts?: boolean } = {},
    client: Tx = prisma,
  ) {
    return client.taskAssignment.update({
      where: { id },
      data: {
        notificationStatus: status,
        ...(extra.notificationJobId !== undefined ? { notificationJobId: extra.notificationJobId } : {}),
        ...(extra.incrementAttempts ? { notificationAttempts: { increment: 1 } } : {}),
      },
    });
  },

  findById(id: string, client: Tx = prisma) {
    return client.taskAssignment.findUnique({ where: { id }, include: { task: true, user: true } });
  },

  /** Used by the worker's reconciliation sweep to find assignments whose email job never made it into Redis. */
  findPendingNotifications(client: Tx = prisma, limit = 50) {
    return client.taskAssignment.findMany({
      where: {
        notificationStatus: { in: [NotificationStatus.pending, NotificationStatus.failed] },
        notificationAttempts: { lt: 5 },
      },
      take: limit,
      orderBy: { createdAt: 'asc' },
    });
  },

  listForTask(taskId: string, client: Tx = prisma) {
    return client.taskAssignment.findMany({
      where: { taskId },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
  },
};
