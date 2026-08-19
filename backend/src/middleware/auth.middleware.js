// middleware/auth.middleware.js
const { verifyAccessToken } = require('../utils/jwt');
const { isTokenBlacklisted } = require('../config/redis');
const { query } = require('../config/db');
const R = require('../utils/response');

/**
 * Verify JWT and attach decoded payload to req.user.
 * School context is resolved server-side for School Admin/Teacher so older
 * tokens and first Teacher sessions cannot bypass school scoping.
 */
async function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return R.unauthorized(res, 'No token provided');
    }
    const token = header.split(' ')[1];

    const { hashToken } = require('../utils/jwt');
    if (await isTokenBlacklisted(hashToken(token))) {
      return R.unauthorized(res, 'Token has been revoked');
    }

    const decoded = verifyAccessToken(token);

    if (!decoded.schoolId && decoded.role === 'SCHOOL_ADMIN') {
      const { rows: [school] } = await query(
        'SELECT id FROM schools WHERE admin_user_id = $1 LIMIT 1',
        [decoded.userId]
      );
      if (school) decoded.schoolId = school.id;
    }

    if (decoded.role === 'TEACHER') {
      const { rows: [teacher] } = await query(
        `SELECT t.school_id, t.id AS teacher_id
         FROM teachers t
         WHERE t.user_id = $1 AND t.status IN ('ACTIVE','ON_LEAVE')
         LIMIT 1`,
        [decoded.userId]
      );
      if (!teacher) return R.forbidden(res, 'Teacher profile is inactive or unavailable');
      decoded.schoolId = teacher.school_id;
      decoded.teacherId = teacher.teacher_id;
    }

    req.user = decoded;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return R.unauthorized(res, 'Token expired');
    }
    return R.unauthorized(res, 'Invalid token');
  }
}

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
