import request from 'supertest';
import { app, registerUser, createProject } from './helpers';

describe('Validation & consistent error responses', () => {
  it('returns a VALIDATION_ERROR with issue details for a malformed register payload', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'not-an-email', password: '123', name: '', organizationName: '' })
      .expect(400);

    expect(res.body).toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(res.body.error).toBeTruthy();
    expect(Array.isArray(res.body.details.issues)).toBe(true);
    expect(res.body.details.issues.length).toBeGreaterThan(0);
  });

  it('returns 404 with the { error, code, details } shape for a missing task', async () => {
    const user = await registerUser();
    const project = await createProject(user);

    const res = await request(app)
      .get(`/projects/${project.id}/tasks/00000000-0000-0000-0000-000000000000`)
      .set('Authorization', `Bearer ${user.accessToken}`)
      .expect(404);

    expect(res.body).toEqual({ error: 'Task not found', code: 'TASK_NOT_FOUND', details: {} });
  });

  it('rejects an invalid task status value', async () => {
    const user = await registerUser();
    const project = await createProject(user);

    const res = await request(app)
      .post(`/projects/${project.id}/tasks`)
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ title: 'Bad status task', status: 'not-a-real-status' })
      .expect(400);

    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('rejects a project update with no fields', async () => {
    const user = await registerUser();
    const project = await createProject(user);

    const res = await request(app)
      .patch(`/projects/${project.id}`)
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({})
      .expect(400);

    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('returns a helpful 404 with a machine-readable code for an unknown route', async () => {
    const res = await request(app).get('/this-route-does-not-exist').expect(404);
    expect(res.body.code).toBe('ROUTE_NOT_FOUND');
  });

  it('only an org_admin can delete a project', async () => {
    const admin = await registerUser({ email: 'proj-admin@delete-test.test' });
    const project = await createProject(admin);

    const memberAccount = await registerUser({ email: 'plain-member@delete-test.test' });
    await request(app)
      .post('/organizations/members')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ email: 'plain-member@delete-test.test', role: 'member' })
      .expect(201);

    // Re-login so the token's active org becomes admin's org (most-recently-joined membership).
    const memberLogin = await request(app)
      .post('/auth/login')
      .send({ email: 'plain-member@delete-test.test', password: 'Password123!' })
      .expect(200);

    const res = await request(app)
      .delete(`/projects/${project.id}`)
      .set('Authorization', `Bearer ${memberLogin.body.accessToken}`)
      .expect(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });
});
