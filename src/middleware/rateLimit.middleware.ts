import rateLimit from 'express-rate-limit';
import { env } from '../config/env';

// Auth endpoints must be rate-limited to 10 requests/minute/IP per spec.
export const authRateLimiter = rateLimit({
  windowMs: env.authRateLimitWindowMs,
  max: env.authRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  // Skip in test runs so integration tests aren't flaky/throttled by shared IP.
  skip: () => env.isTest,
  handler: (_req, res) => {
    res.status(429).json({
      error: 'Too many requests, please try again later',
      code: 'RATE_LIMITED',
      details: {},
    });
  },
});
