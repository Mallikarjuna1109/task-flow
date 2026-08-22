import pino from 'pino';
import { env } from './env';

// Safe logging: never log request bodies/headers by default (they may
// contain passwords or tokens) and redact known-sensitive paths defensively.
export const logger = pino({
  level: env.logLevel,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'password',
      'passwordHash',
      'token',
      'refreshToken',
      'accessToken',
      '*.password',
      '*.passwordHash',
      '*.token',
      '*.refreshToken',
      '*.accessToken',
    ],
    censor: '[redacted]',
  },
});
