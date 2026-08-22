import { resolvePagination, buildOffsetPage, DEFAULT_LIMIT, DEFAULT_PAGE, MAX_LIMIT } from '../../src/utils/pagination';

describe('resolvePagination', () => {
  it('defaults to page 1 / limit 20 when nothing is provided', () => {
    expect(resolvePagination({})).toEqual({ page: DEFAULT_PAGE, limit: DEFAULT_LIMIT, skip: 0, take: DEFAULT_LIMIT });
  });

  it('computes the correct skip for a given page and limit', () => {
    expect(resolvePagination({ page: 3, limit: 10 })).toEqual({ page: 3, limit: 10, skip: 20, take: 10 });
  });

  it('falls back to defaults for invalid (non-numeric) input', () => {
    expect(resolvePagination({ page: NaN, limit: NaN })).toEqual({
      page: DEFAULT_PAGE,
      limit: DEFAULT_LIMIT,
      skip: 0,
      take: DEFAULT_LIMIT,
    });
  });

  it('falls back to defaults for page/limit below 1', () => {
    expect(resolvePagination({ page: 0, limit: -5 })).toEqual({
      page: DEFAULT_PAGE,
      limit: DEFAULT_LIMIT,
      skip: 0,
      take: DEFAULT_LIMIT,
    });
  });

  it('clamps limit to MAX_LIMIT', () => {
    const result = resolvePagination({ page: 1, limit: 10_000 });
    expect(result.limit).toBe(MAX_LIMIT);
    expect(result.take).toBe(MAX_LIMIT);
  });

  it('floors fractional page/limit values', () => {
    expect(resolvePagination({ page: 2.9, limit: 5.9 })).toEqual({ page: 2, limit: 5, skip: 5, take: 5 });
  });
});

describe('buildOffsetPage', () => {
  it('builds the { data, total, page, limit } response shape', () => {
    const params = resolvePagination({ page: 2, limit: 5 });
    const result = buildOffsetPage(['a', 'b'], 12, params);
    expect(result).toEqual({ data: ['a', 'b'], total: 12, page: 2, limit: 5 });
  });
});
