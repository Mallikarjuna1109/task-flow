import { prisma } from '../config/prisma';

export const commentRepository = {
  create(data: { taskId: string; authorId: string; body: string }) {
    return prisma.comment.create({ data });
  },

  listForTask(taskId: string) {
    return prisma.comment.findMany({
      where: { taskId },
      include: { author: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: 'asc' },
    });
  },
};
