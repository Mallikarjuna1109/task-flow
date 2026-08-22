import jwt from 'jsonwebtoken';
import { Role } from '@prisma/client';
import { env } from '../config/env';
import { AccessTokenPayload, RefreshTokenPayload } from '../types';

export function signAccessToken(payload: Omit<AccessTokenPayload, 'type'>): string {
  const body: AccessTokenPayload = { ...payload, type: 'access' };
  const options: jwt.SignOptions = { expiresIn: env.jwtAccessTtl as jwt.SignOptions['expiresIn'] };
  return jwt.sign(body, env.jwtAccessSecret, options);
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const decoded = jwt.verify(token, env.jwtAccessSecret) as AccessTokenPayload;
  if (decoded.type !== 'access') {
    throw new Error('Not an access token');
  }
  return decoded;
}

export function signRefreshToken(payload: Omit<RefreshTokenPayload, 'type'>): string {
  const body: RefreshTokenPayload = { ...payload, type: 'refresh' };
  const options: jwt.SignOptions = { expiresIn: `${env.jwtRefreshTtlDays}d` as jwt.SignOptions['expiresIn'] };
  return jwt.sign(body, env.jwtRefreshSecret, options);
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  const decoded = jwt.verify(token, env.jwtRefreshSecret) as RefreshTokenPayload;
  if (decoded.type !== 'refresh') {
    throw new Error('Not a refresh token');
  }
  return decoded;
}

export type { Role };
