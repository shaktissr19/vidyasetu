const enrollmentService = require('../services/enrollment.service');
const R = require('../utils/response');

function getSchoolId(req) {
  return req.user.schoolId || req.query.schoolId;
}

async function getSchoolRequests(req, res, next) {
  try {
    const schoolId = getSchoolId(req);
    if (!schoolId) return R.badRequest(res, 'School ID required');
    const rows = await enrollmentService.getSchoolEnrollmentRequests(schoolId, req.query.status || 'PENDING');
    return R.ok(res, rows);
  } catch (err) { next(err); }
}

async function reviewSchoolRequest(req, res, next) {
  try {
    const schoolId = getSchoolId(req);
    if (!schoolId) return R.badRequest(res, 'School ID required');
    const result = await enrollmentService.reviewSchoolEnrollmentRequest(
      schoolId,
      req.params.requestId,
      req.user.userId,
      req.body
    );
    return R.ok(res, result);
  } catch (err) { next(err); }
}

async function getStudentLinkSummary(req, res, next) {
  try {
    const result = await enrollmentService.getStudentLinkSummary(req.user.userId);
    if (!result) return R.notFound(res, 'Student profile not found');
    return R.ok(res, result);
  } catch (err) { next(err); }
}

module.exports = { getSchoolRequests, reviewSchoolRequest, getStudentLinkSummary };
