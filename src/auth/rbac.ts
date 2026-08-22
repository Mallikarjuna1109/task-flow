import { Role } from '@prisma/client';
import { ApiError } from '../utils/apiError';
import { AuthContext } from '../types';

/** Throws 403 unless the authenticated user holds `org_admin` in their current org. */
export function requireOrgAdmin(auth: AuthContext): void {
  if (auth.role !== Role.org_admin) {
    throw ApiError.forbidden('FORBIDDEN', 'This action requires the org_admin role');
  }
}
