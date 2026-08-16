/**
 * Standard API response helpers.
 * All responses follow: { success, data?, error?, meta? }
 */

function ok(res, data = null, meta = null, status = 200) {
  const body = { success: true };
  if (data !== null) body.data = data;
  if (meta !== null) body.meta = meta;
  return res.status(status).json(body);
}

function created(res, data = null) {
  return ok(res, data, null, 201);
}

function noContent(res) {
  return res.status(204).send();
}

function badRequest(res, message = 'Bad request', errors = null) {
  const body = { success: false, error: { code: 'BAD_REQUEST', message } };
  if (errors) body.error.details = errors;
  return res.status(400).json(body);
}

function unauthorized(res, message = 'Unauthorized') {
  return res.status(401).json({
    success: false,
    error: { code: 'UNAUTHORIZED', message },
  });
}

function forbidden(res, message = 'Forbidden') {
  return res.status(403).json({
    success: false,
    error: { code: 'FORBIDDEN', message },
  });
}

function notFound(res, message = 'Resource not found') {
  return res.status(404).json({
    success: false,
    error: { code: 'NOT_FOUND', message },
  });
}

function conflict(res, message = 'Conflict') {
  return res.status(409).json({
    success: false,
    error: { code: 'CONFLICT', message },
  });
}

function serverError(res, message = 'Internal server error') {
  return res.status(500).json({
    success: false,
    error: { code: 'SERVER_ERROR', message },
  });
}

module.exports = { ok, created, noContent, badRequest, unauthorized, forbidden, notFound, conflict, serverError };
