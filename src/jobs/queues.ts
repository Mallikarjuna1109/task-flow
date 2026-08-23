import { Queue } from 'bullmq';
import { redisConnection } from '../config/redis';
import { env } from '../config/env';

export { assignmentNotificationJobId, deadLetterJobId } from './jobIds';

export const EMAIL_QUEUE_NAME = 'email-notifications';
export const EMAIL_DLQ_NAME = 'email-notifications-dlq';

export interface AssignmentEmailJobData {
  assignmentId: string;
  taskId: string;
  taskTitle: string;
  projectId: string;
  assigneeUserId: string;
  assigneeEmail: string;
  assigneeName: string;
  assignedByUserId: string | null;
}

// Retry policy per spec: 3 attempts total, exponential backoff 1s -> 2s -> 4s.
export const emailQueue = new Queue<AssignmentEmailJobData>(EMAIL_QUEUE_NAME, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: env.emailMaxRetries,
    backoff: { type: 'exponential', delay: 1000 },
    // Kept (not removed) so GET /jobs/:id can still report "failed".
    removeOnFail: false,
  },
});

// Dead-letter queue: jobs that exhaust all retries are moved here by the
// worker's `failed` handler (workers/email.worker.ts).
export const emailDeadLetterQueue = new Queue(EMAIL_DLQ_NAME, {
  connection: redisConnection,
  defaultJobOptions: {
    removeOnComplete: false,
    removeOnFail: false,
  },
});
