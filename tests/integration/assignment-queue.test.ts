import request from 'supertest';
import { app, registerUser, createProject, createTask } from './helpers';
import { emailQueue } from '../../src/jobs/queues';

// Bonus: verify that assigning a task actually creates a BullMQ job on the
// email-notifications queue (not just that the DB row exists).
describe('Task assignment creates a BullMQ notification job', () => {
  it('enqueues a job whose GET /jobs/:id reflects a real, trackable state', async () => {
    const user = await registerUser();
    const project = await createProject(user);
    const task = await createTask(user, project.id);

    const assignRes = await request(app)
      .post(`/projects/${project.id}/tasks/${task.id}/assignments`)
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ userId: user.userId })
      .expect(201);

    const assignmentId: string = assignRes.body.id;
    const jobId = `assignment-email:${assignmentId}`;

    const job = await emailQueue.getJob(jobId);
    expect(job).toBeTruthy();
    expect(job?.data).toMatchObject({ assignmentId, taskId: task.id, assigneeUserId: user.userId });

    const jobStatusRes = await request(app)
      .get(`/jobs/${jobId}`)
      .set('Authorization', `Bearer ${user.accessToken}`)
      .expect(200);

    expect(jobStatusRes.body).toMatchObject({ id: jobId });
    expect(['pending', 'active', 'completed', 'failed']).toContain(jobStatusRes.body.status);
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
