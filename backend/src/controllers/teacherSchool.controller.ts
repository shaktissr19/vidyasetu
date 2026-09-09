import type { NextFunction, Request, Response } from 'express';
import type { UUID } from '@vidyasetu/contracts';
import * as teacherService from '../services/teacherSchool.service';
import * as schoolService from '../services/school.service';
import * as R from '../utils/response';

interface TeacherActor {
  schoolId: UUID;
  userId: UUID;
  teacherId?: UUID;
}

function actor(req: Request, res: Response): TeacherActor | null {
  const user = req.user;
  if (!user) { R.unauthorized(res); return null; }
  if (user.role !== 'TEACHER') { R.forbidden(res, 'Teacher access is required'); return null; }
  if (!user.schoolId) { R.forbidden(res, 'School context is required'); return null; }
  return { schoolId: user.schoolId, userId: user.userId, teacherId: user.teacherId };
}

function queryString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function queryUuid(value: unknown): UUID | undefined {
  const text = queryString(value);
  return text as UUID | undefined;
}

export async function getProfile(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const current = actor(req, res); if (!current) return;
    return R.ok(res, await teacherService.getTeacherProfile(current.schoolId, current.userId, current.teacherId));
  } catch (error: unknown) { next(error); }
}

export async function getOverview(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const current = actor(req, res); if (!current) return;
    return R.ok(res, await teacherService.getTeacherOverview(current.schoolId, current.userId, current.teacherId));
  } catch (error: unknown) { next(error); }
}

export async function getStudents(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const current = actor(req, res); if (!current) return;
    const result = await teacherService.getAssignedStudents(
      current.schoolId,
      current.userId,
      current.teacherId,
      req.query,
      {
        status: queryString(req.query.status),
        classId: queryUuid(req.query.classId),
        search: queryString(req.query.search),
      },
    );
    return R.list(res, result.students, result.meta);
  } catch (error: unknown) { next(error); }
}

export async function getStudentDetail(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const current = actor(req, res); if (!current) return;
    return R.ok(res, await teacherService.getAssignedStudentDetail(
      current.schoolId,
      current.userId,
      req.params.studentId as UUID,
      current.teacherId,
    ));
  } catch (error: unknown) { next(error); }
}

export async function getClasses(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const current = actor(req, res); if (!current) return;
    return R.ok(res, await teacherService.getAssignedClasses(current.schoolId, current.userId, current.teacherId));
  } catch (error: unknown) { next(error); }
}

export async function getSubjects(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const current = actor(req, res); if (!current) return;
    return R.ok(res, await teacherService.getAssignedSubjects(current.schoolId, current.userId, current.teacherId));
  } catch (error: unknown) { next(error); }
}

export async function getAttendanceRoster(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const current = actor(req, res); if (!current) return;
    const classId = queryUuid(req.query.classId);
    const date = queryString(req.query.date);
    if (!classId || !date) return R.validationError(res, 'classId and date are required');
    return R.ok(res, await teacherService.getAttendanceRoster(
      current.schoolId,
      current.userId,
      classId,
      date,
      current.teacherId,
    ));
  } catch (error: unknown) { next(error); }
}

export async function getAttendanceSummary(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const current = actor(req, res); if (!current) return;
    const date = queryString(req.query.date) || new Date().toISOString().slice(0, 10);
    return R.ok(res, await teacherService.getAttendanceSummary(
      current.schoolId,
      current.userId,
      date,
      current.teacherId,
    ));
  } catch (error: unknown) { next(error); }
}

export async function markAttendance(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const current = actor(req, res); if (!current) return;
    const body = req.body as { classId: UUID; date: string; records: schoolService.AttendanceInput[] };
    return R.ok(res, await teacherService.markAttendance(
      current.schoolId,
      current.userId,
      body.classId,
      body.date,
      body.records,
      current.teacherId,
    ));
  } catch (error: unknown) { next(error); }
}

export async function getTimetable(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const current = actor(req, res); if (!current) return;
    return R.ok(res, await teacherService.getTeacherTimetable(
      current.schoolId,
      current.userId,
      req.params.classId as UUID,
      current.teacherId,
    ));
  } catch (error: unknown) { next(error); }
}

export async function getResults(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const current = actor(req, res); if (!current) return;
    return R.ok(res, await teacherService.getTeacherResults(current.schoolId, current.userId, current.teacherId));
  } catch (error: unknown) { next(error); }
}

export async function getResultDetail(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const current = actor(req, res); if (!current) return;
    return R.ok(res, await teacherService.getTeacherResultDetail(
      current.schoolId,
      current.userId,
      req.params.examId as UUID,
      current.teacherId,
    ));
  } catch (error: unknown) { next(error); }
}

export async function getAnnouncements(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const current = actor(req, res); if (!current) return;
    return R.ok(res, await schoolService.getAnnouncements(current.schoolId));
  } catch (error: unknown) { next(error); }
}
