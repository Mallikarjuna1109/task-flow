import request from 'supertest';
import { app, registerUser, createProject, createTask } from './helpers';
import { emailQueue, assignmentNotificationJobId } from '../../src/jobs/queues';

// Bonus: verify that assigning a task actually creates a BullMQ job on the
// email-notifications queue (not just that the DB row exists).
//
// Regression coverage for a real bug: BullMQ rejects any custom jobId that
// contains ':' unless it splits into exactly 3 parts (its own legacy
// repeatable-job key format - see jobs/queues.ts for the full explanation).
// `assignment-email:<uuid>` always tripped that check, so the job was never
// actually created and this test - and the real endpoint - would fail. The
// jobId is now built exclusively via `assignmentNotificationJobId` (hyphen
// separator) rather than re-hardcoded here, so this test can't silently
// drift from the real convention again.
describe('Task assignment creates a BullMQ notification job', () => {
  it('enqueues a real job, and the assignment response reflects it after enqueueing (not the stale pre-enqueue state)', async () => {
    const user = await registerUser();
    const project = await createProject(user);
    const task = await createTask(user, project.id);

    const assignRes = await request(app)
      .post(`/projects/${project.id}/tasks/${task.id}/assignments`)
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ userId: user.userId })
      .expect(201);

    const assignmentId: string = assignRes.body.id;
    const jobId = assignmentNotificationJobId(assignmentId);
    expect(jobId).not.toContain(':');

    // The assignment response itself must expose the real outcome of
    // enqueueing (jobId + status), not the pending snapshot from before the
    // enqueue was attempted.
    expect(assignRes.body.notificationJobId).toBe(jobId);
    expect(assignRes.body.notificationStatus).toBe('queued');

    const job = await emailQueue.getJob(jobId);
    expect(job).toBeTruthy();
    expect(job?.id).toBe(jobId);
    expect(job?.data).toMatchObject({ assignmentId, taskId: task.id, assigneeUserId: user.userId });

    const jobStatusRes = await request(app)
      .get(`/jobs/${jobId}`)
      .set('Authorization', `Bearer ${user.accessToken}`)
      .expect(200);

    expect(jobStatusRes.body).toMatchObject({ id: jobId });
    expect(['pending', 'active', 'completed', 'failed']).toContain(jobStatusRes.body.status);
  });

  it('does not enqueue a duplicate job when the same assignment is reconciled twice', async () => {
    const user = await registerUser();
    const project = await createProject(user);
    const task = await createTask(user, project.id);

    const assignRes = await request(app)
      .post(`/projects/${project.id}/tasks/${task.id}/assignments`)
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ userId: user.userId })
      .expect(201);

    const jobId = assignmentNotificationJobId(assignRes.body.id);
    const jobBefore = await emailQueue.getJob(jobId);
    expect(jobBefore).toBeTruthy();

    // Re-adding with the same deterministic jobId must not throw and must
    // not create a second job - BullMQ resolves it against the existing job.
    await expect(
      emailQueue.add('send-assignment-email', jobBefore!.data, { jobId }),
    ).resolves.toBeTruthy();

    const jobAfter = await emailQueue.getJob(jobId);
    expect(jobAfter?.id).toBe(jobId);
  });

  it('returns 404 for an unknown job id', async () => {
    const user = await registerUser();
    const res = await request(app)
      .get('/jobs/does-not-exist')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .expect(404);
    expect(res.body.code).toBe('JOB_NOT_FOUND');
  });
});
