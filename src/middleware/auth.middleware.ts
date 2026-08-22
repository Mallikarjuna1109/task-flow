import { NextFunction, Request, Response } from 'express';
import { verifyAccessToken } from '../auth/jwt';
import { ApiError } from '../utils/apiError';

/**
 * Verifies the JWT access token and attaches `{ userId, email, orgId, role }`
 * to `req.auth`. `orgId`/`role` come straight from the signed token (which
 * the server itself issued after resolving org membership at login) - the
 * client cannot influence them, satisfying "do not trust client-provided org_id".
 */
export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    next(ApiError.unauthorized('UNAUTHENTICATED', 'Missing or malformed Authorization header'));
    return;
  }

  const token = header.slice('Bearer '.length).trim();

  try {
    const payload = verifyAccessToken(token);
    req.auth = {
      userId: payload.sub,
      email: payload.email,
      orgId: payload.orgId,
      role: payload.role,
    };
    next();
  } catch {
    next(ApiError.unauthorized('INVALID_TOKEN', 'Access token is invalid or expired'));
  }
}
