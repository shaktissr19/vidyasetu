// middleware/auth.middleware.js
const { verifyAccessToken } = require('../utils/jwt');
const { isTokenBlacklisted } = require('../config/redis');
const R = require('../utils/response');

/**
 * Verify JWT and attach decoded payload to req.user.
 */
async function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return R.unauthorized(res, 'No token provided');
    }
    const token = header.split(' ')[1];

    // Check blacklist (logged-out tokens)
    const { hashToken } = require('../utils/jwt');
    if (await isTokenBlacklisted(hashToken(token))) {
      return R.unauthorized(res, 'Token has been revoked');
    }

    const decoded = verifyAccessToken(token);
    req.user = decoded; // { userId, role, schoolId?, iat, exp }
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return R.unauthorized(res, 'Token expired');
    }
    return R.unauthorized(res, 'Invalid token');
  }
}

/**
 * Role-based access guard factory.
 * Usage: authorize('SUPER_ADMIN') or authorize('SCHOOL_ADMIN', 'SUPER_ADMIN')
 */
function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user) return R.unauthorized(res);
    if (!roles.includes(req.user.role)) {
      return R.forbidden(res, `Role ${req.user.role} is not allowed here`);
    }
    next();
  };
}

module.exports = { authenticate, authorize };
