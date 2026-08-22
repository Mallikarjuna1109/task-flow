import { Role } from '@prisma/client';
import { orgRepository } from '../repositories/org.repository';
import { userRepository } from '../repositories/user.repository';
import { requireOrgAdmin } from '../auth/rbac';
import { ApiError } from '../utils/apiError';
import { AuthContext } from '../types';

export const orgService = {
  listMembers(auth: AuthContext) {
    return orgRepository.listMembers(auth.orgId);
  },

  async addMember(auth: AuthContext, email: string, role: Role = Role.member) {
    requireOrgAdmin(auth);

    const user = await userRepository.findByEmail(email);
    if (!user) {
      throw ApiError.notFound('USER_NOT_FOUND', 'No registered user with this email was found', {});
    }

    const existing = await orgRepository.findMembership(user.id, auth.orgId);
    if (existing) {
      throw ApiError.conflict('ALREADY_MEMBER', 'User is already a member of this organization', {});
    }

    return orgRepository.addMember(auth.orgId, user.id, role);
  },

  async updateMemberRole(auth: AuthContext, targetUserId: string, role: Role) {
    requireOrgAdmin(auth);

    const membership = await orgRepository.findMembership(targetUserId, auth.orgId);
    if (!membership) {
      throw ApiError.notFound('MEMBER_NOT_FOUND', 'This user is not a member of your organization', {});
    }

    return orgRepository.updateMemberRole(auth.orgId, targetUserId, role);
  },

  async removeMember(auth: AuthContext, targetUserId: string) {
    requireOrgAdmin(auth);

    if (targetUserId === auth.userId) {
      throw ApiError.badRequest('CANNOT_REMOVE_SELF', 'You cannot remove your own membership', {});
    }

    const membership = await orgRepository.findMembership(targetUserId, auth.orgId);
    if (!membership) {
      throw ApiError.notFound('MEMBER_NOT_FOUND', 'This user is not a member of your organization', {});
    }

    await orgRepository.removeMember(auth.orgId, targetUserId);
  },
};
