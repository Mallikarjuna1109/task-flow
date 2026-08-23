import { Job } from 'bullmq';
import { logger } from '../config/logger';
import { AssignmentEmailJobData } from './queues';

export async function processAssignmentEmailJob(job: Job<AssignmentEmailJobData>): Promise<{ delivered: true; to: string }> {
  const { assigneeEmail, assigneeName, taskTitle, taskId } = job.data;

  logger.info({ jobId: job.id, to: assigneeEmail, taskId }, 'Sending task assignment email (mock)');

  const message = {
    to: assigneeEmail,
    subject: `You have been assigned to "${taskTitle}"`,
    body: `Hi ${assigneeName},\n\nYou were assigned to the task "${taskTitle}".\n\n- TaskFlow`,
  };

  await mockSendEmail(message);

  return { delivered: true, to: assigneeEmail };
}

async function mockSendEmail(message: { to: string; subject: string; body: string }): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 25));
  logger.debug({ message }, 'Mock email sent');
}
