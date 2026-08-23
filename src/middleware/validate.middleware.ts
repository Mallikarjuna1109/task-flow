import { NextFunction, Request, Response } from 'express';
import { AnyZodObject, ZodError } from 'zod';
import { ApiError } from '../utils/apiError';

export function validate(schema: AnyZodObject) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = schema.parse({ params: req.params, query: req.query, body: req.body });
      if (parsed.params) req.params = parsed.params;
      if (parsed.query) req.query = parsed.query;
      if (parsed.body) req.body = parsed.body;
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        next(
          ApiError.badRequest('VALIDATION_ERROR', 'Request validation failed', {
            issues: err.issues.map((issue) => ({
              path: issue.path.join('.'),
              message: issue.message,
            })),
          }),
        );
        return;
      }
      next(err);
    }
  };
}
