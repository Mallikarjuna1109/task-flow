import { Role } from '@prisma/client';

// Identity attached to `req.auth` by the JWT middleware. `orgId` and `role`
// come from the org_members row resolved server-side at login/refresh time -
// they are NEVER read from client input, per the multi-tenant requirement.
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
