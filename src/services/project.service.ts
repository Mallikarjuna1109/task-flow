import { projectRepository } from '../repositories/project.repository';
import { requireOrgAdmin } from '../auth/rbac';
import { ApiError } from '../utils/apiError';
import { AuthContext } from '../types';
import { PaginationParams } from '../utils/pagination';

/**
 * Every method takes `auth.orgId` (from the verified JWT, never the client
 * body/query) and passes it straight through to the repository layer, which
 * folds it into the SQL `WHERE` clause. A project ID belonging to another
 * organization simply cannot match, so it 404s here and the controller maps
 * that to the required 403 for the cross-tenant case (see projectService.getOrThrow).
 */
export const projectService = {
  create(auth: AuthContext, data: { name: string; description?: string }) {
    return projectRepository.create(auth.orgId, { ...data, createdById: auth.userId });
  },

  async list(auth: AuthContext, pagination: PaginationParams) {
    const [data, total] = await projectRepository.list(auth.orgId, pagination);
    return { data, total };
  },

  async getOrThrow(auth: AuthContext, projectId: string) {
    const project = await projectRepository.findById(auth.orgId, projectId);
    if (project) return project;

    // Distinguish "truly does not exist" (404) from "exists in another
    // organization" (403, per the cross-tenant-access requirement) WITHOUT
    // ever returning the other org's project fields to the caller.
    const existsElsewhere = await projectRepository.findByIdUnscoped(projectId);
    if (existsElsewhere) {
      throw ApiError.forbidden('FORBIDDEN', 'You do not have access to this resource', {});
    }
    throw ApiError.notFound('PROJECT_NOT_FOUND', 'Project not found', {});
  },

  async update(auth: AuthContext, projectId: string, data: { name?: string; description?: string | null }) {
    await this.getOrThrow(auth, projectId);
    const result = await projectRepository.update(auth.orgId, projectId, data);
    if (result.count === 0) {
      throw ApiError.notFound('PROJECT_NOT_FOUND', 'Project not found', {});
    }
    return this.getOrThrow(auth, projectId);
  },

  async remove(auth: AuthContext, projectId: string) {
    // Spec: "Admins can manage members and delete projects".
    requireOrgAdmin(auth);
    await this.getOrThrow(auth, projectId);
    await projectRepository.softDelete(auth.orgId, projectId);
  },

  async dashboard(auth: AuthContext, projectId: string) {
    await this.getOrThrow(auth, projectId);
    const counts = await projectRepository.taskCountsByStatus(auth.orgId, projectId);
    const total = counts.reduce((sum, row) => sum + row.count, 0);
    return { projectId, total, byStatus: counts };
  },
};
