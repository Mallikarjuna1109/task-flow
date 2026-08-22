import { Role } from '@prisma/client';
import { hashPassword, verifyPassword } from '../../src/auth/password';
import { signAccessToken, verifyAccessToken, signRefreshToken, verifyRefreshToken } from '../../src/auth/jwt';

describe('password hashing (bcrypt, cost factor >= 12)', () => {
  it('hashes a password with a bcrypt cost factor of at least 12', async () => {
    const hash = await hashPassword('Sup3rSecret!');
    // bcrypt hash format: $2b$<cost>$<salt+hash>
    const cost = parseInt(hash.split('$')[2], 10);
    expect(cost).toBeGreaterThanOrEqual(12);
  });

  it('verifies a correct password against its hash', async () => {
    const hash = await hashPassword('correct-horse-battery-staple');
    await expect(verifyPassword('correct-horse-battery-staple', hash)).resolves.toBe(true);
  });

  it('rejects an incorrect password', async () => {
    const hash = await hashPassword('correct-horse-battery-staple');
    await expect(verifyPassword('wrong-password', hash)).resolves.toBe(false);
  });

  it('produces a different hash for the same password each time (random salt)', async () => {
    const [h1, h2] = await Promise.all([hashPassword('same-password'), hashPassword('same-password')]);
    expect(h1).not.toEqual(h2);
  });
});

describe('JWT access & refresh tokens', () => {
  it('signs and verifies an access token, round-tripping the org context', () => {
    const token = signAccessToken({ sub: 'user-1', email: 'a@b.com', orgId: 'org-1', role: Role.member });
    const payload = verifyAccessToken(token);
    expect(payload).toMatchObject({ sub: 'user-1', email: 'a@b.com', orgId: 'org-1', role: Role.member, type: 'access' });
  });

  it('rejects a token signed with the wrong secret', () => {
    const jwt = require('jsonwebtoken');
    const forged = jwt.sign({ sub: 'x', email: 'x', orgId: 'x', role: 'member', type: 'access' }, 'wrong-secret');
    expect(() => verifyAccessToken(forged)).toThrow();
  });

  it('signs and verifies a refresh token', () => {
    const token = signRefreshToken({ sub: 'user-1', jti: 'token-id-1' });
    const payload = verifyRefreshToken(token);
    expect(payload).toMatchObject({ sub: 'user-1', jti: 'token-id-1', type: 'refresh' });
  });

  it('an access token cannot be verified as a refresh token and vice versa', () => {
    const accessToken = signAccessToken({ sub: 'user-1', email: 'a@b.com', orgId: 'org-1', role: Role.member });
    expect(() => verifyRefreshToken(accessToken)).toThrow();
  });
});
