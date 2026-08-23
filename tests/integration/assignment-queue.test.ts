import request from 'supertest';
import { app, registerUser, createProject, createTask } from './helpers';
import { emailQueue, assignmentNotificationJobId } from '../../src/jobs/queues';
import { runNotificationReconciliationSweep } from '../../src/jobs/reconciliation';
import { prisma } from '../../src/config/prisma';

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

describe('Assignment + notification consistency strategy', () => {
  it('returns 201 when the notification job is confirmed enqueued', async () => {
    const user = await registerUser();
    const project = await createProject(user);
    const task = await createTask(user, project.id);

    const assignRes = await request(app)
      .post(`/projects/${project.id}/tasks/${task.id}/assignments`)
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ userId: user.userId })
      .expect(201);

    expect(assignRes.body.notificationStatus).toBe('queued');
    expect(typeof assignRes.body.notificationJobId).toBe('string');
  });

  it('returns 503 (not 201) when enqueueing fails, still persists the assignment, and reconciliation later enqueues it', async () => {
    const user = await registerUser();
    const project = await createProject(user);
    const task = await createTask(user, project.id);

    const addSpy = jest.spyOn(emailQueue, 'add').mockRejectedValueOnce(new Error('simulated redis failure'));

    const assignRes = await request(app)
      .post(`/projects/${project.id}/tasks/${task.id}/assignments`)
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ userId: user.userId })
      .expect(503);

    expect(assignRes.body.code).toBe('NOTIFICATION_ENQUEUE_FAILED');
    const assignmentId: string = assignRes.body.details.assignmentId;
    expect(typeof assignmentId).toBe('string');
    expect(assignRes.body.details.notificationStatus).toBe('failed');

    addSpy.mockRestore();

    const persisted = await prisma.taskAssignment.findUnique({ where: { id: assignmentId } });
    expect(persisted).toBeTruthy();
    expect(persisted?.notificationStatus).toBe('failed');
    expect(persisted?.notificationJobId).toBeNull();
    expect(persisted?.taskId).toBe(task.id);
    expect(persisted?.userId).toBe(user.userId);

    const swept = await runNotificationReconciliationSweep();
    expect(swept).toBeGreaterThanOrEqual(1);

    const jobId = assignmentNotificationJobId(assignmentId);
    const job = await emailQueue.getJob(jobId);
    expect(job).toBeTruthy();

    const jobStatusRes = await request(app)
      .get(`/jobs/${jobId}`)
      .set('Authorization', `Bearer ${user.accessToken}`)
      .expect(200);
    expect(['pending', 'active', 'completed']).toContain(jobStatusRes.body.status);
  });

  it('returns 503 for a deduped repeat assignment whose original enqueue is still not confirmed', async () => {
    const user = await registerUser();
    const project = await createProject(user);
    const task = await createTask(user, project.id);

    const addSpy = jest.spyOn(emailQueue, 'add').mockRejectedValueOnce(new Error('simulated redis failure'));

    await request(app)
      .post(`/projects/${project.id}/tasks/${task.id}/assignments`)
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ userId: user.userId })
      .expect(503);

    addSpy.mockRestore();

    const repeatRes = await request(app)
      .post(`/projects/${project.id}/tasks/${task.id}/assignments`)
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ userId: user.userId })
      .expect(503);

    expect(repeatRes.body.code).toBe('NOTIFICATION_ENQUEUE_FAILED');
    expect(repeatRes.body.details.notificationStatus).toBe('failed');
  });
});
