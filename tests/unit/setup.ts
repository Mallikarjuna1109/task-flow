process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'test-access-secret';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-refresh-secret';
process.env.DATABASE_URL_TEST = process.env.DATABASE_URL_TEST || 'postgresql://unused:unused@localhost:5432/unused';
process.env.REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
