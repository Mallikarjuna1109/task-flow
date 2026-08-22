import { prisma } from '../config/prisma';

export const refreshTokenRepository = {
  create(data: {
    id?: string;
    userId: string;
    tokenHash: string;
    expiresAt: Date;
    userAgent?: string | null;
    ipAddress?: string | null;
  }) {
    return prisma.refreshToken.create({ data });
  },

  findByTokenHash(tokenHash: string) {
    return prisma.refreshToken.findUnique({ where: { tokenHash } });
  },

  findById(id: string) {
    return prisma.refreshToken.findUnique({ where: { id } });
  },

  revoke(id: string, replacedByTokenHash?: string) {
    return prisma.refreshToken.update({
      where: { id },
      data: { revokedAt: new Date(), replacedByTokenHash: replacedByTokenHash ?? null },
    });
  },

  revokeAllForUser(userId: string) {
    return prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  },
};
