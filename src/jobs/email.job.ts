import { Job } from 'bullmq';
import { logger } from '../config/logger';
import { AssignmentEmailJobData } from './queues';

/**
 * Mock email delivery. Structured the way a real provider integration
 * (SendGrid, SES, Postmark, ...) would be: build a message, "send" it, and
 * throw on failure so BullMQ's retry/backoff machinery kicks in. Swapping
 * this body for a real HTTP call to an email provider is the only change
 * needed to go to production.
 */
export async function processAssignmentEmailJob(job: Job<AssignmentEmailJobData>): Promise<{ delivered: true; to: string }> {
  const { assigneeEmail, assigneeName, taskTitle, taskId } = job.data;

  logger.info({ jobId: job.id, to: assigneeEmail, taskId }, 'Sending task assignment email (mock)');

  // Simulate a real provider call. Any injected/simulated failure below
  // throws, which BullMQ counts as a failed attempt and retries per the
  // queue's backoff configuration (1s -> 2s -> 4s, 3 attempts total).
  const message = {
    to: assigneeEmail,
    subject: `You have been assigned to "${taskTitle}"`,
    body: `Hi ${assigneeName},\n\nYou were assigned to the task "${taskTitle}".\n\n- TaskFlow`,
  };

  await mockSendEmail(message);

  return { delivered: true, to: assigneeEmail };
}

async function mockSendEmail(message: { to: string; subject: string; body: string }): Promise<void> {
  // Simulated network latency for a provider call.
  await new Promise((resolve) => setTimeout(resolve, 25));

  // Deliberately deterministic (no randomness) - the mock always succeeds so
  // the demo/test suite is stable. A real integration would surface
  // provider errors here instead.
  logger.debug({ message }, 'Mock email sent');
}
