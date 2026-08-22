import { NotificationStatus } from '@prisma/client';
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

/**
 * Assignment + notification consistency strategy
 * ------------------------------------------------
 * 1. The task_assignment row is written first, in its own DB transaction.
 *    Once that commits, the assignment is considered successful and durable
 *    - this is the source of truth the API responds with.
 * 2. We then attempt to enqueue the email job into BullMQ/Redis. This is a
 *    best-effort side effect, intentionally NOT part of the DB transaction
 *    (Postgres and Redis cannot share a transaction).
 * 3. If enqueueing fails (Redis down, network blip, etc.) we do NOT roll
 *    back or fail the API request - the assignment already happened and is
 *    real. Instead we mark `notification_status = 'failed'` on the row and
 *    log the error.
 * 4. A background reconciliation sweep, run by the worker process on an
 *    interval (see workers/index.ts), scans for assignments with
 *    notification_status in (pending, failed) and re-enqueues them. This
 *    makes the system eventually consistent without ever blocking or
 *    failing the user-facing assignment request on a Redis outage.
 *
 * This favors availability of the core assignment operation over strict
 * delivery guarantees for the (non-critical, mockable) email side effect,
 * which matches "must not leave the task assignment in an inconsistent
 * state" - the assignment is never rolled back due to a queue failure.
 */
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

    // Spec: "The assigned user must belong to the same organization as the task."
    const inOrg = await orgRepository.isUserInOrg(assigneeUserId, auth.orgId);
    if (!inOrg) {
      throw ApiError.badRequest('USER_NOT_IN_ORGANIZATION', 'Assignee must belong to the same organization as the task', {});
    }

    const existing = await assignmentRepository.findActive(taskId, assigneeUserId);
    if (existing) {
      const ageMs = Date.now() - existing.createdAt.getTime();
      if (ageMs <= DEDUPE_WINDOW_MS) {
        // Bonus: deduplicate assignments within 5 seconds - treat repeated
        // rapid calls (double submit, retry-on-timeout) as a no-op success.
        return existing;
      }
      throw ApiError.conflict('TASK_ALREADY_ASSIGNED', 'User is already assigned to this task', {});
    }

    const assignment = await prisma.$transaction((tx) =>
      assignmentRepository.create({ taskId, userId: assigneeUserId, assignedById: auth.userId }, tx),
    );

    await this.enqueueNotification(assignment.id, {
      assignmentId: assignment.id,
      taskId: task.id,
      taskTitle: task.title,
      projectId: task.projectId,
      assigneeUserId: assignee.id,
      assigneeEmail: assignee.email,
      assigneeName: assignee.name,
      assignedByUserId: auth.userId,
    });

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

  /** Enqueues the email job and records the outcome on the assignment row. Never throws. */
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
  ): Promise<void> {
    try {
      const job = await emailQueue.add('send-assignment-email', data, {
        jobId: assignmentNotificationJobId(assignmentId),
      });
      await assignmentRepository.updateNotificationStatus(assignmentId, NotificationStatus.queued, {
        notificationJobId: job.id,
      });
    } catch (err) {
      logger.error({ err, assignmentId }, 'Failed to enqueue assignment notification job - will be retried by reconciliation sweep');
      await assignmentRepository
        .updateNotificationStatus(assignmentId, NotificationStatus.failed, { incrementAttempts: true })
        .catch((updateErr) => logger.error({ err: updateErr, assignmentId }, 'Failed to record notification failure'));
    }
  },
};
