import request from 'supertest';
import { createApp } from '../../src/app';

export const app = createApp();

export interface RegisteredUser {
  accessToken: string;
  refreshToken: string;
  userId: string;
  orgId: string;
}

let counter = 0;

export async function registerUser(overrides: Partial<{ email: string; password: string; name: string; organizationName: string }> = {}): Promise<RegisteredUser> {
  counter += 1;
  const res = await request(app)
    .post('/auth/register')
    .send({
      email: overrides.email ?? `user${counter}@example.test`,
      password: overrides.password ?? 'Password123!',
      name: overrides.name ?? `Test User ${counter}`,
      organizationName: overrides.organizationName ?? `Org ${counter}`,
    })
    .expect(201);

  return {
    accessToken: res.body.accessToken,
    refreshToken: res.body.refreshToken,
    userId: res.body.user.id,
    orgId: res.body.user.orgId,
  };
}

export async function createProject(user: RegisteredUser, overrides: Partial<{ name: string; description: string }> = {}) {
  const res = await request(app)
    .post('/projects')
    .set('Authorization', `Bearer ${user.accessToken}`)
    .send({ name: overrides.name ?? 'Test Project', description: overrides.description })
    .expect(201);
  return res.body;
}

export async function createTask(user: RegisteredUser, projectId: string, overrides: Record<string, unknown> = {}) {
  const res = await request(app)
    .post(`/projects/${projectId}/tasks`)
    .set('Authorization', `Bearer ${user.accessToken}`)
    .send({ title: 'Test Task', ...overrides })
    .expect(201);
  return res.body;
}
