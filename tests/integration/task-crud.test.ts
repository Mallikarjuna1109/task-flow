import request from 'supertest';
import { app, registerUser, createProject, createTask } from './helpers';

describe('Task CRUD', () => {
  it('creates, reads, updates, filters and deletes a task within a project', async () => {
    const user = await registerUser();
    const project = await createProject(user);

    const created = await createTask(user, project.id, {
      title: 'Write tests',
      description: 'Cover the task CRUD endpoints',
      priority: 'high',
      status: 'todo',
    });
    expect(created).toMatchObject({ title: 'Write tests', priority: 'high', status: 'todo' });

    const getRes = await request(app)
      .get(`/projects/${project.id}/tasks/${created.id}`)
      .set('Authorization', `Bearer ${user.accessToken}`)
      .expect(200);
    expect(getRes.body.id).toBe(created.id);

    const updateRes = await request(app)
      .patch(`/projects/${project.id}/tasks/${created.id}`)
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ status: 'in_progress' })
      .expect(200);
    expect(updateRes.body.status).toBe('in_progress');

    const listRes = await request(app)
      .get(`/projects/${project.id}/tasks`)
      .query({ status: 'in_progress' })
      .set('Authorization', `Bearer ${user.accessToken}`)
      .expect(200);
    expect(listRes.body).toMatchObject({ total: 1, page: 1, limit: 20 });
    expect(listRes.body.data).toHaveLength(1);

    const emptyFilterRes = await request(app)
      .get(`/projects/${project.id}/tasks`)
      .query({ status: 'done' })
      .set('Authorization', `Bearer ${user.accessToken}`)
      .expect(200);
    expect(emptyFilterRes.body.data).toHaveLength(0);

    await request(app)
      .delete(`/projects/${project.id}/tasks/${created.id}`)
      .set('Authorization', `Bearer ${user.accessToken}`)
      .expect(204);

    // Soft-deleted task is no longer returned.
    const afterDelete = await request(app)
      .get(`/projects/${project.id}/tasks/${created.id}`)
      .set('Authorization', `Bearer ${user.accessToken}`)
      .expect(404);
    expect(afterDelete.body.code).toBe('TASK_NOT_FOUND');
  });

  it('returns the project dashboard grouped by status', async () => {
    const user = await registerUser();
    const project = await createProject(user);
    await createTask(user, project.id, { title: 'A', status: 'todo' });
    await createTask(user, project.id, { title: 'B', status: 'todo' });
    await createTask(user, project.id, { title: 'C', status: 'done' });

    const res = await request(app)
      .get(`/projects/${project.id}/dashboard`)
      .set('Authorization', `Bearer ${user.accessToken}`)
      .expect(200);

    expect(res.body.total).toBe(3);
    const todo = res.body.byStatus.find((row: { status: string }) => row.status === 'todo');
    const done = res.body.byStatus.find((row: { status: string }) => row.status === 'done');
    expect(todo.count).toBe(2);
    expect(done.count).toBe(1);
  });

  it('assigns and unassigns a task to a user in the same organization', async () => {
    const admin = await registerUser({ email: 'admin@same-org.test' });
    const project = await createProject(admin);
    const task = await createTask(admin, project.id);

    // Add a second member to the same org so we have a valid assignee.
    const member = await registerUser({ email: 'member@another-org.test' });

    // Assigning a user from a different org must fail.
    const crossOrgAssign = await request(app)
      .post(`/projects/${project.id}/tasks/${task.id}/assignments`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ userId: member.userId })
      .expect(400);
    expect(crossOrgAssign.body.code).toBe('USER_NOT_IN_ORGANIZATION');

    // Assigning the admin themself (same org) succeeds.
    const assignRes = await request(app)
      .post(`/projects/${project.id}/tasks/${task.id}/assignments`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ userId: admin.userId })
      .expect(201);
    expect(assignRes.body).toMatchObject({ taskId: task.id, userId: admin.userId });

    await request(app)
      .delete(`/projects/${project.id}/tasks/${task.id}/assignments/${admin.userId}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(204);
  });
});
