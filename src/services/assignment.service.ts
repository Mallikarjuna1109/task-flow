import { NotificationStatus, TaskAssignment } from '@prisma/client';
import { prisma } from '../config/prisma';
import { taskRepository } from '../repositories/task.repository';
import { assignmentRepository } from '../repositories/assignment.repository';
import { orgRepository } from '../repositories/org.repository';
import { userRepository } from '../repositories/user.repository';
import { emailQueue, assignmentNotificationJobId } from '../jobs/queues';
import { ApiError } from '../utils/apiError';
import { AuthContext } from '../types';
import { logger } from '../config/logger';

const DEDUPE_WINDOW_MS = 5000;

export const assignmentService = {
  async assign(auth: AuthContext, projectId: string, taskId: string, assigneeUserId: string) {
    const task = await taskRepository.findRawById(auth.orgId, taskId);
    if (!task || task.projectId !== projectId) {
      const existsElsewhere = await taskRepository.findByIdUnscoped(taskId);
      if (existsElsewhere) throw ApiError.forbidden('FORBIDDEN', 'You do not have access to this resource', {});
      throw ApiError.notFound('TASK_NOT_FOUND', 'Task not found', {});
    }

    const assignee = await userRepository.findById(assigneeUserId);
    if (!assignee) {
      throw ApiError.notFound('USER_NOT_FOUND', 'User not found', {});
    }

    const inOrg = await orgRepository.isUserInOrg(assigneeUserId, auth.orgId);
    if (!inOrg) {
      throw ApiError.badRequest('USER_NOT_IN_ORGANIZATION', 'Assignee must belong to the same organization as the task', {});
    }

    const existing = await assignmentRepository.findActive(taskId, assigneeUserId);
    if (existing) {
      const ageMs = Date.now() - existing.createdAt.getTime();
      if (ageMs <= DEDUPE_WINDOW_MS) {
        return this.assertEnqueued(existing);
      }
      throw ApiError.conflict('TASK_ALREADY_ASSIGNED', 'User is already assigned to this task', {});
    }

    const assignment = await prisma.$transaction((tx) =>
      assignmentRepository.create({ taskId, userId: assigneeUserId, assignedById: auth.userId }, tx),
    );

    const updated = await this.enqueueNotification(assignment.id, {
      assignmentId: assignment.id,
      taskId: task.id,
      taskTitle: task.title,
      projectId: task.projectId,
      assigneeUserId: assignee.id,
      assigneeEmail: assignee.email,
      assigneeName: assignee.name,
      assignedByUserId: auth.userId,
    });

    return this.assertEnqueued(updated ?? assignment);
  },

  assertEnqueued(assignment: TaskAssignment): TaskAssignment {
    if (assignment.notificationStatus !== NotificationStatus.queued) {
      throw ApiError.serviceUnavailable(
        'NOTIFICATION_ENQUEUE_FAILED',
        'The task assignment was persisted, but the notification job could not be enqueued. It will be retried automatically.',
        {
          assignmentId: assignment.id,
          taskId: assignment.taskId,
          userId: assignment.userId,
          notificationStatus: assignment.notificationStatus,
        },
      );
    }
    return assignment;
  },

  async unassign(auth: AuthContext, projectId: string, taskId: string, userId: string) {
    const task = await taskRepository.findRawById(auth.orgId, taskId);
    if (!task || task.projectId !== projectId) {
      const existsElsewhere = await taskRepository.findByIdUnscoped(taskId);
      if (existsElsewhere) throw ApiError.forbidden('FORBIDDEN', 'You do not have access to this resource', {});
      throw ApiError.notFound('TASK_NOT_FOUND', 'Task not found', {});
    }

    const result = await assignmentRepository.delete(taskId, userId);
    if (result.count === 0) {
      throw ApiError.notFound('ASSIGNMENT_NOT_FOUND', 'This user is not assigned to the task', {});
    }
  },

  async enqueueNotification(
    assignmentId: string,
    data: {
      assignmentId: string;
      taskId: string;
      taskTitle: string;
      projectId: string;
      assigneeUserId: string;
      assigneeEmail: string;
      assigneeName: string;
      assignedByUserId: string | null;
    },
  ): Promise<TaskAssignment | null> {
    try {
      const job = await emailQueue.add('send-assignment-email', data, {
        jobId: assignmentNotificationJobId(assignmentId),
      });
      return await assignmentRepository.updateNotificationStatus(assignmentId, NotificationStatus.queued, {
        notificationJobId: job.id,
      });
    } catch (err) {
      logger.error({ err, assignmentId }, 'Failed to enqueue assignment notification job - will be retried by reconciliation sweep');
      return await assignmentRepository
        .updateNotificationStatus(assignmentId, NotificationStatus.failed, { incrementAttempts: true })
        .catch((updateErr) => {
          logger.error({ err: updateErr, assignmentId }, 'Failed to record notification failure');
          return null;
        });
    }
  },
};
