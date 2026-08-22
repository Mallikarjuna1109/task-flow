import { Role } from '@prisma/client';
import { prisma } from '../config/prisma';

export const orgRepository = {
  findBySlug(slug: string) {
    return prisma.organization.findUnique({ where: { slug } });
  },

  findById(id: string) {
    return prisma.organization.findUnique({ where: { id } });
  },

  create(data: { name: string; slug: string }) {
    return prisma.organization.create({ data });
  },

  addMember(orgId: string, userId: string, role: Role) {
    return prisma.orgMember.create({ data: { orgId, userId, role } });
  },

  /** Membership row for a specific (user, org) pair - the source of truth for role + tenant scoping. */
  findMembership(userId: string, orgId: string) {
    return prisma.orgMember.findUnique({
      where: { orgId_userId: { orgId, userId } },
    });
  },

  /**
   * All memberships for a user, used to resolve which org context to attach
   * at login/refresh - ordered most-recently-joined first, since a freshly
   * registered user is always org_admin of their own newly-created org, and
   * being invited into another org afterwards should become their active
   * context (mirrors "last workspace you joined/switched to" in tools like
   * Slack/GitHub, and avoids a separate org-switching endpoint being needed
   * for this assignment's scope).
   */
  findMembershipsForUser(userId: string) {
    return prisma.orgMember.findMany({
      where: { userId },
      include: { organization: true },
      orderBy: { createdAt: 'desc' },
    });
  },

  listMembers(orgId: string) {
    return prisma.orgMember.findMany({
      where: { orgId },
      include: { user: { select: { id: true, email: true, name: true, createdAt: true } } },
      orderBy: { createdAt: 'asc' },
    });
  },

  isUserInOrg(userId: string, orgId: string) {
    return prisma.orgMember.findUnique({ where: { orgId_userId: { orgId, userId } } }).then(Boolean);
  },

  updateMemberRole(orgId: string, userId: string, role: Role) {
    return prisma.orgMember.update({ where: { orgId_userId: { orgId, userId } }, data: { role } });
  },

  removeMember(orgId: string, userId: string) {
    return prisma.orgMember.delete({ where: { orgId_userId: { orgId, userId } } });
  },
};
