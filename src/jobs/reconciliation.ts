import { assignmentRepository } from '../repositories/assignment.repository';
import { assignmentService } from '../services/assignment.service';
import { logger } from '../config/logger';

/**
 * Reconciliation sweep for the assignment/notification consistency strategy
 * documented in services/assignment.service.ts. Finds task_assignments whose
 * email notification job never successfully made it into Redis (either it
 * was never enqueued, or enqueueing failed) and retries enqueueing them.
 *
 * Runs on an interval inside the worker process - this is the mechanism
 * that makes the system eventually consistent after a transient Redis
 * outage, without ever blocking the original API request.
 */
export async function runNotificationReconciliationSweep(): Promise<number> {
  const pending = await assignmentRepository.findPendingNotifications();
  if (pending.length === 0) return 0;

  logger.info({ count: pending.length }, 'Reconciliation sweep: re-enqueueing pending assignment notifications');

  for (const assignment of pending) {
    const full = await assignmentRepository.findById(assignment.id);
    if (!full) continue;

    await assignmentService.enqueueNotification(full.id, {
      assignmentId: full.id,
      taskId: full.task.id,
      taskTitle: full.task.title,
      projectId: full.task.projectId,
      assigneeUserId: full.user.id,
      assigneeEmail: full.user.email,
      assigneeName: full.user.name,
      assignedByUserId: full.assignedById,
    });
  }

  return pending.length;
}

export function scheduleReconciliationSweep(intervalMs = 60_000): NodeJS.Timeout {
  return setInterval(() => {
    runNotificationReconciliationSweep().catch((err) => {
      logger.error({ err }, 'Reconciliation sweep failed');
    });
  }, intervalMs);
}
