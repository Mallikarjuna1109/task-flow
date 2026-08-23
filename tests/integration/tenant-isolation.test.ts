import request from 'supertest';
import { app, registerUser, createProject, createTask } from './helpers';

describe('Cross-tenant isolation', () => {
  it('returns 403 (not the resource) when accessing another organization\'s project', async () => {
    const orgA = await registerUser({ email: 'a-admin@org-a.test', organizationName: 'Org A' });
    const orgB = await registerUser({ email: 'b-admin@org-b.test', organizationName: 'Org B' });

    const projectA = await createProject(orgA, { name: 'Org A Secret Project' });

    const res = await request(app)
      .get(`/projects/${projectA.id}`)
      .set('Authorization', `Bearer ${orgB.accessToken}`)
      .expect(403);

    expect(res.body.code).toBe('FORBIDDEN');
    expect(res.body).not.toHaveProperty('name');
    expect(JSON.stringify(res.body)).not.toContain('Org A Secret Project');
  });

  it('returns 403 when accessing another organization\'s task', async () => {
    const orgA = await registerUser({ email: 'a2-admin@org-a2.test', organizationName: 'Org A2' });
    const orgB = await registerUser({ email: 'b2-admin@org-b2.test', organizationName: 'Org B2' });

    const projectA = await createProject(orgA);
    const taskA = await createTask(orgA, projectA.id, { title: 'Org A Secret Task' });

    const res = await request(app)
      .get(`/projects/${projectA.id}/tasks/${taskA.id}`)
      .set('Authorization', `Bearer ${orgB.accessToken}`)
      .expect(403);

    expect(res.body.code).toBe('FORBIDDEN');
    expect(JSON.stringify(res.body)).not.toContain('Org A Secret Task');
  });

  it('returns 404 for a project id that does not exist at all (not 403)', async () => {
    const user = await registerUser();
    const res = await request(app)
      .get('/projects/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .expect(404);
    expect(res.body.code).toBe('PROJECT_NOT_FOUND');
  });

  it('does not allow a client-supplied org_id to override the authenticated org context', async () => {
    const orgA = await registerUser({ email: 'a3-admin@org-a3.test', organizationName: 'Org A3' });
    const orgB = await registerUser({ email: 'b3-admin@org-b3.test', organizationName: 'Org B3' });

    const res = await request(app)
      .post('/projects')
      .set('Authorization', `Bearer ${orgA.accessToken}`)
      .send({ name: 'Sneaky Project', orgId: orgB.orgId })
      .expect(201);

    expect(res.body.orgId).toBe(orgA.orgId);
    expect(res.body.orgId).not.toBe(orgB.orgId);
  });
});
