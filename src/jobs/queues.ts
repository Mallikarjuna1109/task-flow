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

export const emailQueue = new Queue<AssignmentEmailJobData>(EMAIL_QUEUE_NAME, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: env.emailMaxRetries,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: { age: 24 * 60 * 60, count: 1000 },
    removeOnFail: false,
  },
});

export const emailDeadLetterQueue = new Queue(EMAIL_DLQ_NAME, {
  connection: redisConnection,
  defaultJobOptions: {
    removeOnComplete: false,
    removeOnFail: false,
  },
});
