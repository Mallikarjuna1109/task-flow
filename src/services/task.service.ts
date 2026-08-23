import { TaskPriority, TaskStatus } from '@prisma/client';
import { taskRepository, TaskFilters } from '../repositories/task.repository';
import { projectService } from './project.service';
import { commentRepository } from '../repositories/comment.repository';
import { ApiError } from '../utils/apiError';
import { AuthContext } from '../types';
import { PaginationParams } from '../utils/pagination';

export interface CreateTaskInput {
  title: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  dueDate?: Date;
}

export const taskService = {
  async create(auth: AuthContext, projectId: string, data: CreateTaskInput) {
    await projectService.getOrThrow(auth, projectId);
    return taskRepository.create(projectId, { ...data, createdById: auth.userId });
  },

  async list(auth: AuthContext, projectId: string, filters: TaskFilters, pagination: PaginationParams) {
    await projectService.getOrThrow(auth, projectId);
    return taskRepository.list(auth.orgId, projectId, filters, pagination);
  },

  async getOrThrow(auth: AuthContext, projectId: string, taskId: string) {
    await projectService.getOrThrow(auth, projectId);

    const task = await taskRepository.findById(auth.orgId, taskId);
    if (task && task.projectId === projectId) return task;

    const existsElsewhere = await taskRepository.findByIdUnscoped(taskId);
    if (existsElsewhere) {
      throw ApiError.forbidden('FORBIDDEN', 'You do not have access to this resource', {});
    }
    throw ApiError.notFound('TASK_NOT_FOUND', 'Task not found', {});
  },

  async update(
    auth: AuthContext,
    projectId: string,
    taskId: string,
    data: Partial<CreateTaskInput & { dueDate: Date | null; description: string | null }>,
  ) {
    await this.getOrThrow(auth, projectId, taskId);
    const result = await taskRepository.update(auth.orgId, taskId, data);
    if (result.count === 0) {
      throw ApiError.notFound('TASK_NOT_FOUND', 'Task not found', {});
    }
    return this.getOrThrow(auth, projectId, taskId);
  },

  async remove(auth: AuthContext, projectId: string, taskId: string) {
    await this.getOrThrow(auth, projectId, taskId);
    await taskRepository.softDelete(auth.orgId, taskId);
  },

  async bulkUpdateStatus(auth: AuthContext, projectId: string, taskIds: string[], status: TaskStatus) {
    await projectService.getOrThrow(auth, projectId);
    const result = await taskRepository.bulkUpdateStatus(auth.orgId, projectId, taskIds, status);
    return { updated: result.count };
  },

  async search(auth: AuthContext, query: string, pagination: PaginationParams) {
    return taskRepository.fullTextSearch(auth.orgId, query, pagination);
  },

  async addComment(auth: AuthContext, projectId: string, taskId: string, body: string) {
    await this.getOrThrow(auth, projectId, taskId);
    return commentRepository.create({ taskId, authorId: auth.userId, body });
  },

  async listComments(auth: AuthContext, projectId: string, taskId: string) {
    await this.getOrThrow(auth, projectId, taskId);
    return commentRepository.listForTask(taskId);
  },
};
