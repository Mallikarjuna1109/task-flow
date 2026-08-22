import { emailQueue, AssignmentEmailJobData } from '../jobs/queues';
import { taskRepository } from '../repositories/task.repository';
import { ApiError } from '../utils/apiError';
import { AuthContext } from '../types';

// BullMQ's internal states are richer than the spec's 4 statuses -
// collapse them into the required { pending | active | completed | failed }.
function toPublicStatus(bullState: string): 'pending' | 'active' | 'completed' | 'failed' {
  switch (bullState) {
    case 'completed':
      return 'completed';
    case 'failed':
      return 'failed';
    case 'active':
      return 'active';
    case 'waiting':
    case 'delayed':
    case 'waiting-children':
    case 'paused':
    default:
      return 'pending';
  }
}

export const jobService = {
  async getJobStatus(auth: AuthContext, jobId: string) {
    const job = await emailQueue.getJob(jobId);
    if (!job) {
      throw ApiError.notFound('JOB_NOT_FOUND', 'Job not found', {});
    }

    // Multi-tenant isolation: this job's payload references a task that
    // must belong to the caller's org, otherwise it's cross-tenant data -
    // even though job ids are effectively unguessable UUIDs, we don't rely
    // on obscurity alone. Mirrors the 403-for-cross-org / 404-for-unknown
    // convention used by projectService/taskService.getOrThrow.
    const data = job.data as AssignmentEmailJobData;
    if (data?.taskId) {
      const task = await taskRepository.findRawById(auth.orgId, data.taskId);
      if (!task) {
        throw ApiError.forbidden('FORBIDDEN', 'You do not have access to this resource', {});
      }
    }

    const state = await job.getState();

    return {
      id: job.id,
      status: toPublicStatus(state),
      attemptsMade: job.attemptsMade,
      maxAttempts: job.opts.attempts ?? null,
      data: job.data,
      failedReason: job.failedReason ?? null,
      createdAt: job.timestamp ? new Date(job.timestamp).toISOString() : null,
      processedAt: job.processedOn ? new Date(job.processedOn).toISOString() : null,
      finishedAt: job.finishedOn ? new Date(job.finishedOn).toISOString() : null,
    };
  },
};
