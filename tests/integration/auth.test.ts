import request from 'supertest';
import { app, registerUser } from './helpers';

describe('Auth flow', () => {
  it('registers a new user + organization and returns a token pair', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'alice@example.test', password: 'Password123!', name: 'Alice', organizationName: 'Alice Co' })
      .expect(201);

    expect(res.body.user).toMatchObject({ email: 'alice@example.test', role: 'org_admin' });
    expect(typeof res.body.accessToken).toBe('string');
    expect(typeof res.body.refreshToken).toBe('string');
  });

  it('rejects registering the same email twice', async () => {
    await registerUser({ email: 'dupe@example.test' });
    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'dupe@example.test', password: 'Password123!', name: 'Dupe', organizationName: 'Dupe Co' })
      .expect(409);
    expect(res.body.code).toBe('EMAIL_TAKEN');
  });

  it('logs in with correct credentials', async () => {
    await registerUser({ email: 'login@example.test', password: 'Password123!' });

    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'login@example.test', password: 'Password123!' })
      .expect(200);

    expect(res.body.user.email).toBe('login@example.test');
    expect(typeof res.body.accessToken).toBe('string');
  });

  it('rejects login with the wrong password', async () => {
    await registerUser({ email: 'wrongpw@example.test', password: 'Password123!' });

    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'wrongpw@example.test', password: 'not-the-password' })
      .expect(401);
    expect(res.body.code).toBe('INVALID_CREDENTIALS');
  });

  it('rejects login for an unknown email with the same error shape (no user enumeration)', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'nobody@example.test', password: 'Password123!' })
      .expect(401);
    expect(res.body.code).toBe('INVALID_CREDENTIALS');
  });

  it('refreshes the access token using a valid refresh token and rotates it', async () => {
    const user = await registerUser();

    const res = await request(app).post('/auth/refresh').send({ refreshToken: user.refreshToken }).expect(200);
    expect(typeof res.body.accessToken).toBe('string');
    expect(res.body.refreshToken).not.toBe(user.refreshToken);

    await request(app).post('/auth/refresh').send({ refreshToken: user.refreshToken }).expect(401);
  });

  it('logs out and revokes the refresh token', async () => {
    const user = await registerUser();

    await request(app).post('/auth/logout').send({ refreshToken: user.refreshToken }).expect(204);
    await request(app).post('/auth/refresh').send({ refreshToken: user.refreshToken }).expect(401);
  });

  it('rejects protected routes without a bearer token', async () => {
    const res = await request(app).get('/projects').expect(401);
    expect(res.body.code).toBe('UNAUTHENTICATED');
  });
});
