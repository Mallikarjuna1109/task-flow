import { OffsetPage } from '../types';

export interface PaginationInput {
  page?: number;
  limit?: number;
}

export interface PaginationParams {
  page: number;
  limit: number;
  skip: number;
  take: number;
}

export const DEFAULT_PAGE = 1;
export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;

/**
 * Normalizes raw (possibly missing/invalid) page & limit query values into
 * safe, bounded pagination parameters plus the Prisma `skip`/`take` pair.
 *
 * Pure function - no I/O - so it is directly unit-testable.
 */
export function resolvePagination(input: PaginationInput): PaginationParams {
  let page = Number(input.page);
  let limit = Number(input.limit);

  if (!Number.isFinite(page) || page < 1) page = DEFAULT_PAGE;
  if (!Number.isFinite(limit) || limit < 1) limit = DEFAULT_LIMIT;

  page = Math.floor(page);
  limit = Math.min(Math.floor(limit), MAX_LIMIT);

  const skip = (page - 1) * limit;

  return { page, limit, skip, take: limit };
}

/** Builds the `{ data, total, page, limit }` response shape required by the spec. */
export function buildOffsetPage<T>(data: T[], total: number, params: PaginationParams): OffsetPage<T> {
  return {
    data,
    total,
    page: params.page,
    limit: params.limit,
  };
}
