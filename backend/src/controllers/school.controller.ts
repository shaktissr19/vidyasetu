import type { NextFunction, Request, Response } from 'express';
import * as schoolService from '../services/school.service';
import * as schoolRosterService from '../services/schoolRoster.service';
import type { EnrollmentReviewInput } from '../services/enrollment.service';
import * as R from '../utils/response';

function queryString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function getSchoolId(req: Request): string | undefined {
  return req.user?.schoolId || queryString(req.query.schoolId);
}

function requireSchoolId(req: Request, res: Response): string | null {
  const schoolId = getSchoolId(req);
  if (!schoolId) {
    R.badRequest(res, 'School ID required');
    return null;
  }
  return schoolId;
}

function userId(req: Request, res: Response): string | null {
  if (!req.user) {
    R.unauthorized(res);
    return null;
  }
  return req.user.userId;
}

export async function getProfile(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try { const id = requireSchoolId(req, res); if (!id) return; return R.ok(res, await schoolService.getSchoolProfile(id)); }
  catch (err: unknown) { next(err); }
}

export async function updateProfile(
  req: Request<Record<string, string>, unknown, schoolService.SchoolProfileUpdateInput>,
  res: Response,
  next: NextFunction,
): Promise<Response | void> {
  try {
    const id = requireSchoolId(req, res); if (!id) return;
    const uid = userId(req, res); if (!uid) return;
    return R.ok(res, await schoolService.updateSchoolProfile(id, uid, req.body));
  } catch (err: unknown) { next(err); }
}

export async function getOverview(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const schoolId = requireSchoolId(req, res); if (!schoolId) return;
    const [data, roster] = await Promise.all([
      schoolService.getOverview(schoolId),
      schoolRosterService.getRosterCounts(schoolId),
    ]);
    data.stats = {
      ...data.stats,
      total_students: roster.approvedStudents,
      pending_enrollment_requests: roster.pendingRequests,
    };
    return R.ok(res, data);
  } catch (err: unknown) { next(err); }
}

export async function getStudents(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const id = requireSchoolId(req, res); if (!id) return;
    const data = await schoolRosterService.getApprovedStudents(id, req.query, {
      classId: queryString(req.query.classId),
      search: queryString(req.query.search),
      status: queryString(req.query.status),
    });
    return R.ok(res, data.students, data.meta);
  } catch (err: unknown) { next(err); }
}

export async function addStudent(
  req: Request<Record<string, string>, unknown, schoolService.StudentCreateInput>,
  res: Response,
  next: NextFunction,
): Promise<Response | void> {
  try { const id = requireSchoolId(req, res); if (!id) return; return R.created(res, await schoolService.addStudent(id, req.body)); }
  catch (err: unknown) { next(err); }
}

export async function bulkAddStudents(
  req: Request<Record<string, string>, unknown, { students: schoolService.StudentCreateInput[] }>,
  res: Response,
  next: NextFunction,
): Promise<Response | void> {
  try {
    const id = requireSchoolId(req, res); if (!id) return;
    return R.created(res, { created: await schoolService.bulkAddStudents(id, req.body.students) });
  } catch (err: unknown) { next(err); }
}

export async function getStudentDetail(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try { const id = requireSchoolId(req, res); if (!id) return; return R.ok(res, await schoolService.getStudentDetail(id, req.params.studentId)); }
  catch (err: unknown) { next(err); }
}

export async function updateStudent(
  req: Request<Record<string, string>, unknown, schoolService.StudentUpdateInput>,
  res: Response,
  next: NextFunction,
): Promise<Response | void> {
  try { const id = requireSchoolId(req, res); if (!id) return; return R.ok(res, await schoolService.updateStudent(id, req.params.studentId, req.body)); }
  catch (err: unknown) { next(err); }
}

export async function linkParent(
  req: Request<Record<string, string>, unknown, schoolService.ParentLinkInput>,
  res: Response,
  next: NextFunction,
): Promise<Response | void> {
  try { const id = requireSchoolId(req, res); if (!id) return; return R.ok(res, await schoolService.linkParent(id, req.params.studentId, req.body)); }
  catch (err: unknown) { next(err); }
}

export async function getClasses(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try { const id = requireSchoolId(req, res); if (!id) return; return R.ok(res, await schoolService.getClasses(id, queryString(req.query.includeInactive) === 'true')); }
  catch (err: unknown) { next(err); }
}

export async function createClass(
  req: Request<Record<string, string>, unknown, schoolService.ClassInput>, res: Response, next: NextFunction,
): Promise<Response | void> {
  try { const id = requireSchoolId(req, res); if (!id) return; return R.created(res, await schoolService.createClass(id, req.body)); }
  catch (err: unknown) { next(err); }
}

export async function updateClass(
  req: Request<Record<string, string>, unknown, schoolService.ClassUpdateInput>, res: Response, next: NextFunction,
): Promise<Response | void> {
  try { const id = requireSchoolId(req, res); if (!id) return; return R.ok(res, await schoolService.updateClass(id, req.params.classId, req.body)); }
  catch (err: unknown) { next(err); }
}

export async function archiveClass(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try { const id = requireSchoolId(req, res); if (!id) return; return R.ok(res, await schoolService.archiveClass(id, req.params.classId)); }
  catch (err: unknown) { next(err); }
}

export async function getSubjects(_req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try { return R.ok(res, await schoolService.getSubjects()); }
  catch (err: unknown) { next(err); }
}

export async function getTeachers(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try { const id = requireSchoolId(req, res); if (!id) return; return R.ok(res, await schoolService.getTeachers(id)); }
  catch (err: unknown) { next(err); }
}

export async function addTeacher(
  req: Request<Record<string, string>, unknown, schoolService.TeacherInput>, res: Response, next: NextFunction,
): Promise<Response | void> {
  try { const id = requireSchoolId(req, res); if (!id) return; return R.created(res, await schoolService.addTeacher(id, req.body)); }
  catch (err: unknown) { next(err); }
}

export async function updateTeacher(
  req: Request<Record<string, string>, unknown, Partial<schoolService.TeacherInput>>, res: Response, next: NextFunction,
): Promise<Response | void> {
  try { const id = requireSchoolId(req, res); if (!id) return; return R.ok(res, await schoolService.updateTeacher(id, req.params.teacherId, req.body)); }
  catch (err: unknown) { next(err); }
}

export async function deactivateTeacher(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try { const id = requireSchoolId(req, res); if (!id) return; return R.ok(res, await schoolService.deactivateTeacher(id, req.params.teacherId)); }
  catch (err: unknown) { next(err); }
}

export async function getAttendanceRoster(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const id = requireSchoolId(req, res); if (!id) return;
    const classId = queryString(req.query.classId);
    const date = queryString(req.query.date);
    if (!classId || !date) return R.badRequest(res, 'classId and date are required');
    return R.ok(res, await schoolService.getAttendanceRoster(id, classId, date));
  } catch (err: unknown) { next(err); }
}

export async function markAttendance(
  req: Request<Record<string, string>, unknown, { classId: string; date: string; records: schoolService.AttendanceInput[] }>,
  res: Response,
  next: NextFunction,
): Promise<Response | void> {
  try {
    const id = requireSchoolId(req, res); if (!id) return;
    const uid = userId(req, res); if (!uid) return;
    const out = await schoolService.markAttendance(id, req.body.classId, req.body.date, req.body.records, uid);
    return R.ok(res, { marked: out.length, records: out });
  } catch (err: unknown) { next(err); }
}

export async function getAttendanceSummary(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const id = requireSchoolId(req, res); if (!id) return;
    return R.ok(res, await schoolService.getAttendanceSummary(id, queryString(req.query.date) || new Date().toISOString().slice(0, 10)));
  } catch (err: unknown) { next(err); }
}

export async function getFeeOverview(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try { const id = requireSchoolId(req, res); if (!id) return; return R.ok(res, await schoolService.getFeeOverview(id, queryString(req.query.year))); }
  catch (err: unknown) { next(err); }
}

export async function getFeeStructures(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try { const id = requireSchoolId(req, res); if (!id) return; return R.ok(res, await schoolService.getFeeStructures(id, queryString(req.query.year))); }
  catch (err: unknown) { next(err); }
}

export async function upsertFeeStructure(
  req: Request<Record<string, string>, unknown, schoolService.FeeStructureInput>, res: Response, next: NextFunction,
): Promise<Response | void> {
  try { const id = requireSchoolId(req, res); if (!id) return; return R.created(res, await schoolService.upsertFeeStructure(id, req.body)); }
  catch (err: unknown) { next(err); }
}

export async function generateFeeInvoices(
  req: Request<Record<string, string>, unknown, schoolService.GenerateInvoicesInput>, res: Response, next: NextFunction,
): Promise<Response | void> {
  try { const id = requireSchoolId(req, res); if (!id) return; return R.ok(res, await schoolService.generateFeeInvoices(id, req.body)); }
  catch (err: unknown) { next(err); }
}

export async function recordPayment(
  req: Request<Record<string, string>, unknown, Omit<schoolService.FeePaymentInput, 'collectedBy'>>,
  res: Response,
  next: NextFunction,
): Promise<Response | void> {
  try {
    const id = requireSchoolId(req, res); if (!id) return;
    const uid = userId(req, res); if (!uid) return;
    return R.created(res, await schoolService.recordFeePayment(id, { ...req.body, collectedBy: uid }));
  } catch (err: unknown) { next(err); }
}

export async function getFeePayments(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try { const id = requireSchoolId(req, res); if (!id) return; return R.ok(res, await schoolService.getFeePayments(id, queryString(req.query.invoiceId))); }
  catch (err: unknown) { next(err); }
}

export async function sendFeeReminders(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try { const id = requireSchoolId(req, res); if (!id) return; return R.ok(res, await schoolService.sendFeeReminders(id)); }
  catch (err: unknown) { next(err); }
}

export async function getTimetable(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try { const id = requireSchoolId(req, res); if (!id) return; return R.ok(res, await schoolService.getTimetable(id, req.params.classId)); }
  catch (err: unknown) { next(err); }
}

export async function saveTimetable(
  req: Request<Record<string, string>, unknown, { periods: schoolService.TimetableInput[] }>, res: Response, next: NextFunction,
): Promise<Response | void> {
  try {
    const id = requireSchoolId(req, res); if (!id) return;
    await schoolService.saveTimetable(req.params.classId, id, req.body.periods);
    return R.ok(res, await schoolService.getTimetable(id, req.params.classId));
  } catch (err: unknown) { next(err); }
}

export async function getExams(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try { const id = requireSchoolId(req, res); if (!id) return; return R.ok(res, await schoolService.getExams(id)); }
  catch (err: unknown) { next(err); }
}

export async function getExamDetail(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try { const id = requireSchoolId(req, res); if (!id) return; return R.ok(res, await schoolService.getExamDetail(id, req.params.examId)); }
  catch (err: unknown) { next(err); }
}

export async function createExam(
  req: Request<Record<string, string>, unknown, schoolService.SchoolExamInput>, res: Response, next: NextFunction,
): Promise<Response | void> {
  try {
    const id = requireSchoolId(req, res); if (!id) return;
    const uid = userId(req, res); if (!uid) return;
    return R.created(res, await schoolService.createSchoolExam(id, uid, req.body));
  } catch (err: unknown) { next(err); }
}

export async function addExamQuestions(
  req: Request<Record<string, string>, unknown, { questions: Parameters<typeof schoolService.addExamQuestions>[2] }>,
  res: Response,
  next: NextFunction,
): Promise<Response | void> {
  try { const id = requireSchoolId(req, res); if (!id) return; return R.ok(res, await schoolService.addExamQuestions(id, req.params.examId, req.body.questions)); }
  catch (err: unknown) { next(err); }
}

export async function updateExamStatus(
  req: Request<Record<string, string>, unknown, { status: string }>, res: Response, next: NextFunction,
): Promise<Response | void> {
  try { const id = requireSchoolId(req, res); if (!id) return; return R.ok(res, await schoolService.updateExamStatus(id, req.params.examId, req.body.status)); }
  catch (err: unknown) { next(err); }
}

export async function getResults(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try { const id = requireSchoolId(req, res); if (!id) return; return R.ok(res, await schoolService.getResults(id)); }
  catch (err: unknown) { next(err); }
}

export async function getResultDetail(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try { const id = requireSchoolId(req, res); if (!id) return; return R.ok(res, await schoolService.getResultDetail(id, req.params.examId)); }
  catch (err: unknown) { next(err); }
}

export async function getAnnouncements(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try { const id = requireSchoolId(req, res); if (!id) return; return R.ok(res, await schoolService.getAnnouncements(id)); }
  catch (err: unknown) { next(err); }
}

export async function publishAnnouncement(
  req: Request<Record<string, string>, unknown, schoolService.AnnouncementInput>, res: Response, next: NextFunction,
): Promise<Response | void> {
  try {
    const id = requireSchoolId(req, res); if (!id) return;
    const uid = userId(req, res); if (!uid) return;
    return R.created(res, await schoolService.publishAnnouncement(id, uid, req.body));
  } catch (err: unknown) { next(err); }
}

// Retain the imported type in this adapter boundary for the School enrollment routes.
export type SchoolEnrollmentReviewInput = EnrollmentReviewInput;
