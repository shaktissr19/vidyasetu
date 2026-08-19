// controllers/school.controller.js
const schoolService = require('../services/school.service');
const schoolRosterService = require('../services/schoolRoster.service');
const R = require('../utils/response');

function getSchoolId(req) {
  return req.user.schoolId || req.query.schoolId;
}
function requireSchoolId(req, res) {
  const schoolId = getSchoolId(req);
  if (!schoolId) { R.badRequest(res, 'School ID required'); return null; }
  return schoolId;
}

async function getProfile(req, res, next) {
  try { const id=requireSchoolId(req,res); if(!id)return; return R.ok(res, await schoolService.getSchoolProfile(id)); } catch(e){next(e);}
}
async function updateProfile(req,res,next){try{const id=requireSchoolId(req,res);if(!id)return;return R.ok(res,await schoolService.updateSchoolProfile(id,req.user.userId,req.body));}catch(e){next(e);}}

async function getOverview(req, res, next) {
  try {
    const schoolId = requireSchoolId(req,res); if(!schoolId)return;
    const [data, roster] = await Promise.all([schoolService.getOverview(schoolId), schoolRosterService.getRosterCounts(schoolId)]);
    data.stats = { ...(data.stats||{}), total_students: roster.approvedStudents, pending_enrollment_requests: roster.pendingRequests };
    return R.ok(res,data);
  } catch(e){next(e);}
}

async function getStudents(req,res,next){try{const id=requireSchoolId(req,res);if(!id)return;const data=await schoolRosterService.getApprovedStudents(id,req.query,{classId:req.query.classId,search:req.query.search,status:req.query.status});return R.ok(res,data.students,data.meta);}catch(e){next(e);}}
async function addStudent(req,res,next){try{const id=requireSchoolId(req,res);if(!id)return;return R.created(res,await schoolService.addStudent(id,req.body));}catch(e){next(e);}}
async function bulkAddStudents(req,res,next){try{const id=requireSchoolId(req,res);if(!id)return;return R.created(res,{created:await schoolService.bulkAddStudents(id,req.body.students)});}catch(e){next(e);}}
async function getStudentDetail(req,res,next){try{const id=requireSchoolId(req,res);if(!id)return;return R.ok(res,await schoolService.getStudentDetail(id,req.params.studentId));}catch(e){next(e);}}
async function updateStudent(req,res,next){try{const id=requireSchoolId(req,res);if(!id)return;return R.ok(res,await schoolService.updateStudent(id,req.params.studentId,req.body));}catch(e){next(e);}}
async function linkParent(req,res,next){try{const id=requireSchoolId(req,res);if(!id)return;return R.ok(res,await schoolService.linkParent(id,req.params.studentId,req.body));}catch(e){next(e);}}

async function getClasses(req,res,next){try{const id=requireSchoolId(req,res);if(!id)return;return R.ok(res,await schoolService.getClasses(id,req.query.includeInactive==='true'));}catch(e){next(e);}}
async function createClass(req,res,next){try{const id=requireSchoolId(req,res);if(!id)return;return R.created(res,await schoolService.createClass(id,req.body));}catch(e){next(e);}}
async function updateClass(req,res,next){try{const id=requireSchoolId(req,res);if(!id)return;return R.ok(res,await schoolService.updateClass(id,req.params.classId,req.body));}catch(e){next(e);}}
async function archiveClass(req,res,next){try{const id=requireSchoolId(req,res);if(!id)return;return R.ok(res,await schoolService.archiveClass(id,req.params.classId));}catch(e){next(e);}}
async function getSubjects(req,res,next){try{return R.ok(res,await schoolService.getSubjects());}catch(e){next(e);}}

async function getTeachers(req,res,next){try{const id=requireSchoolId(req,res);if(!id)return;return R.ok(res,await schoolService.getTeachers(id));}catch(e){next(e);}}
async function addTeacher(req,res,next){try{const id=requireSchoolId(req,res);if(!id)return;return R.created(res,await schoolService.addTeacher(id,req.body));}catch(e){next(e);}}
async function updateTeacher(req,res,next){try{const id=requireSchoolId(req,res);if(!id)return;return R.ok(res,await schoolService.updateTeacher(id,req.params.teacherId,req.body));}catch(e){next(e);}}
async function deactivateTeacher(req,res,next){try{const id=requireSchoolId(req,res);if(!id)return;return R.ok(res,await schoolService.deactivateTeacher(id,req.params.teacherId));}catch(e){next(e);}}

async function getAttendanceRoster(req,res,next){try{const id=requireSchoolId(req,res);if(!id)return;return R.ok(res,await schoolService.getAttendanceRoster(id,req.query.classId,req.query.date));}catch(e){next(e);}}
async function markAttendance(req,res,next){try{const id=requireSchoolId(req,res);if(!id)return;const out=await schoolService.markAttendance(id,req.body.classId,req.body.date,req.body.records,req.user.userId);return R.ok(res,{marked:out.length,records:out});}catch(e){next(e);}}
async function getAttendanceSummary(req,res,next){try{const id=requireSchoolId(req,res);if(!id)return;return R.ok(res,await schoolService.getAttendanceSummary(id,req.query.date||new Date().toISOString().slice(0,10)));}catch(e){next(e);}}

async function getFeeOverview(req,res,next){try{const id=requireSchoolId(req,res);if(!id)return;return R.ok(res,await schoolService.getFeeOverview(id,req.query.year));}catch(e){next(e);}}
async function getFeeStructures(req,res,next){try{const id=requireSchoolId(req,res);if(!id)return;return R.ok(res,await schoolService.getFeeStructures(id,req.query.year));}catch(e){next(e);}}
async function upsertFeeStructure(req,res,next){try{const id=requireSchoolId(req,res);if(!id)return;return R.created(res,await schoolService.upsertFeeStructure(id,req.body));}catch(e){next(e);}}
async function generateFeeInvoices(req,res,next){try{const id=requireSchoolId(req,res);if(!id)return;return R.ok(res,await schoolService.generateFeeInvoices(id,req.body));}catch(e){next(e);}}
async function recordPayment(req,res,next){try{const id=requireSchoolId(req,res);if(!id)return;return R.created(res,await schoolService.recordFeePayment(id,{...req.body,collectedBy:req.user.userId}));}catch(e){next(e);}}
async function getFeePayments(req,res,next){try{const id=requireSchoolId(req,res);if(!id)return;return R.ok(res,await schoolService.getFeePayments(id,req.query.invoiceId));}catch(e){next(e);}}
async function sendFeeReminders(req,res,next){try{const id=requireSchoolId(req,res);if(!id)return;return R.ok(res,await schoolService.sendFeeReminders(id));}catch(e){next(e);}}

async function getTimetable(req,res,next){try{const id=requireSchoolId(req,res);if(!id)return;return R.ok(res,await schoolService.getTimetable(id,req.params.classId));}catch(e){next(e);}}
async function saveTimetable(req,res,next){try{const id=requireSchoolId(req,res);if(!id)return;return R.ok(res,await schoolService.saveTimetable(req.params.classId,id,req.body.periods));}catch(e){next(e);}}

async function getExams(req,res,next){try{const id=requireSchoolId(req,res);if(!id)return;return R.ok(res,await schoolService.getExams(id));}catch(e){next(e);}}
async function getExamDetail(req,res,next){try{const id=requireSchoolId(req,res);if(!id)return;return R.ok(res,await schoolService.getExamDetail(id,req.params.examId));}catch(e){next(e);}}
async function createExam(req,res,next){try{const id=requireSchoolId(req,res);if(!id)return;return R.created(res,await schoolService.createSchoolExam(id,req.user.userId,req.body));}catch(e){next(e);}}
async function addExamQuestions(req,res,next){try{const id=requireSchoolId(req,res);if(!id)return;return R.ok(res,await schoolService.addExamQuestions(id,req.params.examId,req.body.questions));}catch(e){next(e);}}
async function updateExamStatus(req,res,next){try{const id=requireSchoolId(req,res);if(!id)return;return R.ok(res,await schoolService.updateExamStatus(id,req.params.examId,req.body.status));}catch(e){next(e);}}
async function getResults(req,res,next){try{const id=requireSchoolId(req,res);if(!id)return;return R.ok(res,await schoolService.getResults(id));}catch(e){next(e);}}
async function getResultDetail(req,res,next){try{const id=requireSchoolId(req,res);if(!id)return;return R.ok(res,await schoolService.getResultDetail(id,req.params.examId));}catch(e){next(e);}}

async function getAnnouncements(req,res,next){try{const id=requireSchoolId(req,res);if(!id)return;return R.ok(res,await schoolService.getAnnouncements(id));}catch(e){next(e);}}
async function publishAnnouncement(req,res,next){try{const id=requireSchoolId(req,res);if(!id)return;return R.created(res,await schoolService.publishAnnouncement(id,req.user.userId,req.body));}catch(e){next(e);}}

module.exports={
  getProfile,updateProfile,getOverview,
  getStudents,addStudent,bulkAddStudents,getStudentDetail,updateStudent,linkParent,
  getClasses,createClass,updateClass,archiveClass,getSubjects,
  getTeachers,addTeacher,updateTeacher,deactivateTeacher,
  getAttendanceRoster,markAttendance,getAttendanceSummary,
  getFeeOverview,getFeeStructures,upsertFeeStructure,generateFeeInvoices,recordPayment,getFeePayments,sendFeeReminders,
  getTimetable,saveTimetable,
  getExams,getExamDetail,createExam,addExamQuestions,updateExamStatus,getResults,getResultDetail,
  getAnnouncements,publishAnnouncement,
};
