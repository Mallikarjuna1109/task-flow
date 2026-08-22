import { randomUUID } from 'crypto';
import { Role } from '@prisma/client';
import { prisma } from '../config/prisma';
import { userRepository } from '../repositories/user.repository';
import { orgRepository } from '../repositories/org.repository';
import { refreshTokenRepository } from '../repositories/refreshToken.repository';
import { hashPassword, verifyPassword } from '../auth/password';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../auth/jwt';
import { hashToken } from '../auth/tokenHash';
import { env } from '../config/env';
import { ApiError } from '../utils/apiError';
import { RegisterInput } from '../validators/auth.validator';
import { logger } from '../config/logger';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
}

interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  orgId: string;
  orgName: string;
  role: Role;
}

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  return `${base || 'org'}-${randomUUID().slice(0, 8)}`;
}

/**
 * Resolves the org context to embed in a user's JWT. A user may belong to
 * more than one organization (an admin can invite them); we deterministically
 * pick their most-recently-joined membership as the "active" org context,
 * since there is no multi-org-switching endpoint in scope for this
 * assignment (see orgRepository.findMembershipsForUser for the rationale).
 */
async function resolvePrimaryMembership(userId: string) {
  const memberships = await orgRepository.findMembershipsForUser(userId);
  if (memberships.length === 0) {
    throw ApiError.unauthorized('NO_ORGANIZATION', 'User does not belong to any organization');
  }
  return memberships[0];
}

async function issueTokenPair(user: {
  id: string;
  email: string;
}, orgId: string, role: Role, meta: { userAgent?: string | null; ipAddress?: string | null }): Promise<AuthTokens> {
  const accessToken = signAccessToken({ sub: user.id, email: user.email, orgId, role });

  const tokenId = randomUUID();
  const rawRefreshToken = signRefreshToken({ sub: user.id, jti: tokenId });
  const expiresAt = new Date(Date.now() + env.jwtRefreshTtlDays * 24 * 60 * 60 * 1000);

  await refreshTokenRepository.create({
    id: tokenId,
    userId: user.id,
    tokenHash: hashToken(rawRefreshToken),
    expiresAt,
    userAgent: meta.userAgent ?? null,
    ipAddress: meta.ipAddress ?? null,
  });

  return { accessToken, refreshToken: rawRefreshToken, expiresIn: env.jwtAccessTtl };
}

export const authService = {
  async register(input: RegisterInput, meta: { userAgent?: string | null; ipAddress?: string | null }) {
    const existing = await userRepository.findByEmail(input.email);
    if (existing) {
      throw ApiError.conflict('EMAIL_TAKEN', 'An account with this email already exists');
    }

    const passwordHash = await hashPassword(input.password);
    const slug = slugify(input.organizationName);

    const { user, organization } = await prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: { email: input.email, passwordHash, name: input.name },
      });
      const createdOrg = await tx.organization.create({
        data: { name: input.organizationName, slug },
      });
      await tx.orgMember.create({
        data: { orgId: createdOrg.id, userId: createdUser.id, role: Role.org_admin },
      });
      return { user: createdUser, organization: createdOrg };
    });

    const tokens = await issueTokenPair(user, organization.id, Role.org_admin, meta);

    const authenticatedUser: AuthenticatedUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      orgId: organization.id,
      orgName: organization.name,
      role: Role.org_admin,
    };

    return { user: authenticatedUser, tokens };
  },

  async login(email: string, password: string, meta: { userAgent?: string | null; ipAddress?: string | null }) {
    const user = await userRepository.findByEmail(email);
    // Constant-shape response whether the email exists or not - avoids
    // leaking account existence via timing/response differences.
    const passwordHash = user?.passwordHash ?? '$2b$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinva';
    const passwordValid = await verifyPassword(password, passwordHash);

    if (!user || !passwordValid) {
      throw ApiError.unauthorized('INVALID_CREDENTIALS', 'Invalid email or password');
    }

    const membership = await resolvePrimaryMembership(user.id);
    const tokens = await issueTokenPair(user, membership.orgId, membership.role, meta);

    const authenticatedUser: AuthenticatedUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      orgId: membership.orgId,
      orgName: membership.organization.name,
      role: membership.role,
    };

    return { user: authenticatedUser, tokens };
  },

  async refresh(rawRefreshToken: string, meta: { userAgent?: string | null; ipAddress?: string | null }) {
    let payload;
    try {
      payload = verifyRefreshToken(rawRefreshToken);
    } catch {
      throw ApiError.unauthorized('INVALID_REFRESH_TOKEN', 'Refresh token is invalid or expired');
    }

    const stored = await refreshTokenRepository.findByTokenHash(hashToken(rawRefreshToken));
    if (!stored || stored.id !== payload.jti) {
      throw ApiError.unauthorized('INVALID_REFRESH_TOKEN', 'Refresh token is invalid or expired');
    }
    if (stored.revokedAt) {
      // Reuse of a revoked/rotated token is a strong signal of token theft -
      // revoke the whole session family defensively.
      logger.warn({ userId: stored.userId }, 'Refresh token reuse detected - revoking all sessions');
      await refreshTokenRepository.revokeAllForUser(stored.userId);
      throw ApiError.unauthorized('REFRESH_TOKEN_REUSED', 'Refresh token has already been used');
    }
    if (stored.expiresAt.getTime() < Date.now()) {
      throw ApiError.unauthorized('INVALID_REFRESH_TOKEN', 'Refresh token is invalid or expired');
    }

    const user = await userRepository.findById(stored.userId);
    if (!user) {
      throw ApiError.unauthorized('INVALID_REFRESH_TOKEN', 'Refresh token is invalid or expired');
    }

    const membership = await resolvePrimaryMembership(user.id);

    // Bonus: refresh token rotation - issue a brand new refresh token and
    // immediately revoke the presented one, chaining them via
    // replacedByTokenHash for auditability.
    const tokens = await issueTokenPair(user, membership.orgId, membership.role, meta);
    await refreshTokenRepository.revoke(stored.id, hashToken(tokens.refreshToken));

    const authenticatedUser: AuthenticatedUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      orgId: membership.orgId,
      orgName: membership.organization.name,
      role: membership.role,
    };

    return { user: authenticatedUser, tokens };
  },

  async logout(rawRefreshToken: string, allDevices: boolean) {
    const stored = await refreshTokenRepository.findByTokenHash(hashToken(rawRefreshToken));
    if (!stored) {
      // Logout is idempotent - an unknown/expired token is treated as "already logged out".
      return;
    }

    if (allDevices) {
      // Bonus: logout all devices.
      await refreshTokenRepository.revokeAllForUser(stored.userId);
      return;
    }

    if (!stored.revokedAt) {
      await refreshTokenRepository.revoke(stored.id);
    }
  },
};
