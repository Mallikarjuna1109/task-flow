import { config as loadDotenv } from 'dotenv';
import path from 'path';

// Load .env before anything else reads process.env. In test mode we still
// load `.env` (for shared defaults) but individual test env vars set by the
// test runner / CI take precedence since dotenv never overrides existing
// process.env values.
loadDotenv({ path: path.resolve(process.cwd(), '.env') });

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optionalInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = parseInt(raw, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  isTest: process.env.NODE_ENV === 'test',
  isProduction: process.env.NODE_ENV === 'production',
  port: optionalInt('PORT', 3000),

  databaseUrl:
    process.env.NODE_ENV === 'test'
      ? required('DATABASE_URL_TEST', process.env.DATABASE_URL)
      : required('DATABASE_URL'),

  redisUrl: required('REDIS_URL', 'redis://localhost:6379'),

  jwtAccessSecret: required('JWT_ACCESS_SECRET'),
  jwtRefreshSecret: required('JWT_REFRESH_SECRET'),
  jwtAccessTtl: process.env.JWT_ACCESS_TTL ?? '15m',
  jwtRefreshTtlDays: optionalInt('JWT_REFRESH_TTL_DAYS', 7),

  bcryptSaltRounds: Math.max(optionalInt('BCRYPT_SALT_ROUNDS', 12), 12),

  authRateLimitWindowMs: optionalInt('AUTH_RATE_LIMIT_WINDOW_MS', 60_000),
  authRateLimitMax: optionalInt('AUTH_RATE_LIMIT_MAX', 10),

  emailMaxRetries: optionalInt('EMAIL_MAX_RETRIES', 3),
  emailRateLimitMax: optionalInt('EMAIL_RATE_LIMIT_MAX', 50),
  emailRateLimitDurationMs: optionalInt('EMAIL_RATE_LIMIT_DURATION_MS', 60_000),

  corsOrigin: process.env.CORS_ORIGIN ?? '*',
  logLevel: process.env.LOG_LEVEL ?? 'info',
};
