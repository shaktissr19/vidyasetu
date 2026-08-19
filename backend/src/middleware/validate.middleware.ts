import type { NextFunction, Request, Response } from 'express';
import type { ZodTypeAny } from 'zod';
import * as R from '../utils/response';

type ValidationSource = 'body' | 'params' | 'query';

export function validate(schema: ZodTypeAny, source: ValidationSource = 'body') {
  return (req: Request, res: Response, next: NextFunction): void | Response => {
    const input = source === 'body'
      ? req.body
      : source === 'params'
        ? req.params
        : req.query;

    const result = schema.safeParse(input);
    if (!result.success) {
      const errors = result.error.errors.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      }));
      return R.badRequest(res, 'Validation failed', errors);
    }

    if (source === 'body') {
      req.body = result.data;
    } else if (source === 'params') {
      req.params = result.data as Request['params'];
    } else {
      req.query = result.data as Request['query'];
    }

    next();
  };
}
