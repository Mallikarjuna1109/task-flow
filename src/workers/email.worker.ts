import { Worker, Job } from 'bullmq';
import { createRedisConnection } from '../config/redis';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { EMAIL_QUEUE_NAME, emailDeadLetterQueue, AssignmentEmailJobData, deadLetterJobId } from '../jobs/queues';
import { processAssignmentEmailJob } from '../jobs/email.job';

export function createEmailWorker(): Worker<AssignmentEmailJobData> {
  const worker = new Worker<AssignmentEmailJobData>(EMAIL_QUEUE_NAME, processAssignmentEmailJob, {
    connection: createRedisConnection(),
    concurrency: 5,
    limiter: {
      max: env.emailRateLimitMax,
      duration: env.emailRateLimitDurationMs,
    },
  });

  worker.on('completed', (job) => {
    logger.info({ jobId: job.id, assignmentId: job.data.assignmentId }, 'Assignment email job completed');
  });

  worker.on('failed', async (job: Job<AssignmentEmailJobData> | undefined, err: Error) => {
    if (!job) return;

    const attempts = job.opts.attempts ?? env.emailMaxRetries;
    logger.warn(
      { jobId: job.id, attemptsMade: job.attemptsMade, attempts, err: err.message },
      'Assignment email job attempt failed',
    );

    // Retries exhausted -> move to the dead-letter queue and report failed.
    if (job.attemptsMade >= attempts) {
      logger.error({ jobId: job.id, assignmentId: job.data.assignmentId }, 'Assignment email job exhausted retries - moving to DLQ');
      await emailDeadLetterQueue.add(
        'dead-letter',
        { originalJobId: job.id, data: job.data, failedReason: err.message },
        { jobId: deadLetterJobId(job.id as string) },
      );
    }
  });

  worker.on('error', (err) => {
    logger.error({ err }, 'Email worker error');
  });

  return worker;
}
