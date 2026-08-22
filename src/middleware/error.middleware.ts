import { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { ApiError } from '../utils/apiError';
import { logger } from '../config/logger';
import { env } from '../config/env';

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: 'Route not found',
    code: 'ROUTE_NOT_FOUND',
    details: { method: req.method, path: req.originalUrl },
  });
}

// Centralized error handler - every thrown/forwarded error ends up here so
// the API always responds with the consistent { error, code, details }
// shape and never leaks stack traces to the client.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ApiError) {
    if (err.statusCode >= 500) {
      logger.error({ err, path: req.originalUrl }, 'Unhandled API error');
    }
    res.status(err.statusCode).json({ error: err.message, code: err.code, details: err.details });
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      res.status(409).json({
        error: 'A record with these unique fields already exists',
        code: 'DUPLICATE_RECORD',
        details: { target: err.meta?.target ?? [] },
      });
      return;
    }
    if (err.code === 'P2025') {
      res.status(404).json({ error: 'Record not found', code: 'NOT_FOUND', details: {} });
      return;
    }
  }

  logger.error({ err, path: req.originalUrl }, 'Unexpected error');

  res.status(500).json({
    error: 'Internal server error',
    code: 'INTERNAL_ERROR',
    details: env.isProduction ? {} : { message: err instanceof Error ? err.message : String(err) },
  });
}
