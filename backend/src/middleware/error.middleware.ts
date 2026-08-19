import type { ErrorRequestHandler, Request, Response } from 'express';
import logger = require('../utils/logger');

interface AppErrorLike {
  code?: string;
  statusCode?: number;
  status?: number;
  apiCode?: string;
  message?: string;
}

function errorLike(err: unknown): AppErrorLike {
  if (err instanceof Error) return err as Error & AppErrorLike;
  if (typeof err === 'object' && err !== null) return err as AppErrorLike;
  return { message: String(err) };
}

export function notFound(req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    error: { code: 'NOT_FOUND', message: `Route ${req.method} ${req.originalUrl} not found` },
  });
}

export const errorHandler: ErrorRequestHandler = (err: unknown, _req, res, _next) => {
  logger.error(err);
  const appError = errorLike(err);

  if (appError.code === '23505') {
    res.status(409).json({
      success: false,
      error: { code: 'CONFLICT', message: 'A record with these details already exists' },
    });
    return;
  }

  if (appError.code === '23503') {
    res.status(400).json({
      success: false,
      error: { code: 'BAD_REQUEST', message: 'Referenced record does not exist' },
    });
    return;
  }

  const status = appError.statusCode || appError.status || 500;
  const isServerError = status >= 500;
  const message = process.env.NODE_ENV === 'production' && isServerError
    ? 'Internal server error'
    : appError.message || 'Internal server error';
  const code = appError.apiCode
    || (status === 400 ? 'BAD_REQUEST'
      : status === 401 ? 'UNAUTHORIZED'
        : status === 403 ? 'FORBIDDEN'
          : status === 404 ? 'NOT_FOUND'
            : status === 409 ? 'CONFLICT'
              : 'SERVER_ERROR');

  res.status(status).json({
    success: false,
    error: { code, message },
  });
};
