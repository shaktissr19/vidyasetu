import type { Response } from 'express';
import type { ApiError } from '@vidyasetu/contracts';

interface SuccessBody<T, TMeta> {
  success: true;
  data?: T;
  meta?: TMeta;
}

interface ErrorBody {
  success: false;
  error: ApiError;
}

export function ok<T = unknown, TMeta = unknown>(
  res: Response,
  data: T | null = null,
  meta: TMeta | null = null,
  status = 200,
): Response {
  const body: SuccessBody<T, TMeta> = { success: true };
  if (data !== null) body.data = data;
  if (meta !== null) body.meta = meta;
  return res.status(status).json(body);
}

export function created<T = unknown>(res: Response, data: T | null = null): Response {
  return ok(res, data, null, 201);
}

export function noContent(res: Response): Response {
  return res.status(204).send();
}

function errorResponse(
  res: Response,
  status: number,
  code: string,
  message: string,
  details?: unknown,
): Response {
  const error: ApiError = { code, message };
  if (details !== undefined && details !== null) error.details = details;
  const body: ErrorBody = { success: false, error };
  return res.status(status).json(body);
}

export function badRequest(
  res: Response,
  message = 'Bad request',
  errors: unknown = null,
): Response {
  return errorResponse(res, 400, 'BAD_REQUEST', message, errors);
}

export function validationError(
  res: Response,
  message = 'Validation failed',
  errors: unknown = null,
): Response {
  return errorResponse(res, 400, 'VALIDATION_ERROR', message, errors);
}

export function unauthorized(res: Response, message = 'Unauthorized'): Response {
  return errorResponse(res, 401, 'UNAUTHORIZED', message);
}

export function forbidden(res: Response, message = 'Forbidden'): Response {
  return errorResponse(res, 403, 'FORBIDDEN', message);
}

export function notFound(res: Response, message = 'Resource not found'): Response {
  return errorResponse(res, 404, 'NOT_FOUND', message);
}

export function conflict(res: Response, message = 'Conflict'): Response {
  return errorResponse(res, 409, 'CONFLICT', message);
}

export function serverError(res: Response, message = 'Internal server error'): Response {
  return errorResponse(res, 500, 'SERVER_ERROR', message);
}
