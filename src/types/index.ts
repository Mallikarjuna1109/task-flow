import { Role } from '@prisma/client';

// orgId/role are resolved server-side and attached to req.auth - never read from client input.
export interface AuthContext {
  userId: string;
  email: string;
  orgId: string;
  role: Role;
}

export interface AccessTokenPayload {
  sub: string; // userId
  email: string;
  orgId: string;
  role: Role;
  type: 'access';
}

export interface RefreshTokenPayload {
  sub: string; // userId
  jti: string; // refresh token id (matches refresh_tokens.id)
  type: 'refresh';
}

export interface OffsetPage<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}
