// middleware/error.middleware.js
const logger = require('../utils/logger');

function notFound(req, res) {
  res.status(404).json({
    success: false,
    error: { code: 'NOT_FOUND', message: `Route ${req.method} ${req.originalUrl} not found` },
  });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  logger.error(err);

  if (err.code === '23505') {
    return res.status(409).json({
      success: false,
      error: { code: 'CONFLICT', message: 'A record with these details already exists' },
    });
  }

  if (err.code === '23503') {
    return res.status(400).json({
      success: false,
      error: { code: 'BAD_REQUEST', message: 'Referenced record does not exist' },
    });
  }

  const status = err.statusCode || err.status || 500;
  const isServerError = status >= 500;
  const message = process.env.NODE_ENV === 'production' && isServerError
    ? 'Internal server error'
    : err.message || 'Internal server error';
  const code = err.apiCode
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
}

module.exports = { notFound, errorHandler };
