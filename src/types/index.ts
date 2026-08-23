import { Role } from '@prisma/client';

export interface AuthContext {
  userId: string;
  email: string;
  orgId: string;
  role: Role;
}

export interface AccessTokenPayload {
  sub: string;
  email: string;
  orgId: string;
  role: Role;
  type: 'access';
}

export interface RefreshTokenPayload {
  sub: string;
  jti: string;
  type: 'refresh';
}

export interface OffsetPage<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}
