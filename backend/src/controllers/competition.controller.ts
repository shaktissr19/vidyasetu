import type { NextFunction, Request, Response } from 'express';
import type { QueryResultRow } from 'pg';
import type { UUID } from '@vidyasetu/contracts';
import * as competitionService from '../services/competition.service';
import * as studentExamService from '../services/studentExam.service';
import type { ExamResponseInput, ExamQuestionInput, CreateExamInput } from '../services/competition.service';
import { query } from '../config/db';
import * as R from '../utils/response';

interface StudentContextRow extends QueryResultRow {
  id: UUID;
  school_id: UUID | null;
  school_link_status: string;
  class_name: string;
}
interface StatusBody { status: string; }
interface SubmitBody { responses?: ExamResponseInput[]; }
interface QuestionsBody { questions?: ExamQuestionInput[]; }
interface ExamStatusRow extends QueryResultRow { id: UUID; title: string; status: string; }

type CreateExamBody = CreateExamInput & { type?: string; schoolId?: UUID | null; };

function authenticated(req: Request, res: Response) {
  if (!req.user) { R.unauthorized(res); return null; }
  return req.user;
}

function queryInteger(value: unknown, fallback: number): number {
  const parsed = Number.parseInt(typeof value === 'string' ? value : '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function getStudent(req: Request): Promise<StudentContextRow | null> {
  if (!req.user) return null;
  const { rows: [student] } = await query<StudentContextRow>(
    `SELECT s.id, s.school_id, s.school_link_status,
            COALESCE(sc.class_name, s.grade_level) AS class_name
     FROM students s
     LEFT JOIN school_classes sc ON sc.id = s.class_id
     WHERE s.user_id = $1 AND s.status = 'ACTIVE'`,
    [req.user.userId],
  );
  return student || null;
}

async function assertExamAdministrationAccess(req: Request, examId: UUID): Promise<boolean> {
  const user = req.user;
  if (!user) return false;
  if (user.role === 'SUPER_ADMIN') return true;
  if (user.role !== 'SCHOOL_ADMIN' || !user.schoolId) return false;
  const { rows } = await query('SELECT 1 FROM exams WHERE id=$1 AND school_id=$2 LIMIT 1', [examId, user.schoolId]);
  return rows.length > 0;
}

export async function list(_req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const { rows } = await query(
      `SELECT id, title, title_hi, description, type, status, class_names, subject_codes,
              total_questions, duration_mins, marks_per_question, negative_marks,
              registration_start, registration_end, start_time, end_time,
              results_at, prize_pool, banner_url
       FROM exams
       WHERE status IN ('REGISTRATION_OPEN','REGISTRATION_CLOSED','LIVE','SCORING','COMPLETED')
         AND type IN ('OLYMPIAD','MOCK','PRACTICE')
       ORDER BY start_time ASC
       LIMIT 30`,
    );
    return R.ok(res, rows);
  } catch (err: unknown) { next(err); }
}

export async function listMine(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const student = await getStudent(req);
    if (!student) return R.notFound(res, 'Student profile not found');
    return R.ok(res, await competitionService.listForStudent(
      student.id,
      student.class_name,
      student.school_link_status === 'APPROVED' ? student.school_id : null,
    ));
  } catch (err: unknown) { next(err); }
}

export async function register(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const student = await getStudent(req);
    if (!student) return R.notFound(res, 'Student profile not found');
    return R.ok(res, await studentExamService.register(req.params.examId, student.id));
  } catch (err: unknown) { next(err); }
}

export async function startAttempt(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const student = await getStudent(req);
    if (!student) return R.notFound(res, 'Student profile not found');
    return R.ok(res, await studentExamService.startAttempt(req.params.examId, student.id));
  } catch (err: unknown) { next(err); }
}

export async function submit(
  req: Request<Record<string, string>, unknown, SubmitBody>,
  res: Response,
  next: NextFunction,
): Promise<Response | void> {
  try {
    const student = await getStudent(req);
    if (!student) return R.notFound(res, 'Student profile not found');
    return R.ok(res, await studentExamService.submitAttempt(req.params.attemptId, student.id, req.body.responses || []));
  } catch (err: unknown) { next(err); }
}

export async function getLeaderboard(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    return R.ok(res, await competitionService.getLeaderboard(
      req.params.examId,
      queryInteger(req.query.page, 1),
      queryInteger(req.query.limit, 50),
    ));
  } catch (err: unknown) { next(err); }
}

export async function createExam(
  req: Request<Record<string, string>, unknown, CreateExamBody>,
  res: Response,
  next: NextFunction,
): Promise<Response | void> {
  try {
    const user = authenticated(req, res); if (!user) return;
    const body: CreateExamBody = { ...req.body };
    if (user.role === 'SCHOOL_ADMIN') {
      if (!user.schoolId) return R.forbidden(res, 'School context is unavailable');
      body.schoolId = user.schoolId;
      body.type = 'SCHOOL_TEST';
    }
    return R.created(res, await competitionService.createExam(body, user.userId));
  } catch (err: unknown) { next(err); }
}

export async function addQuestions(
  req: Request<Record<string, string>, unknown, QuestionsBody>,
  res: Response,
  next: NextFunction,
): Promise<Response | void> {
  try {
    if (!(await assertExamAdministrationAccess(req, req.params.examId))) {
      return R.forbidden(res, 'You cannot modify an exam owned by another school');
    }
    return R.ok(res, await competitionService.addQuestions(req.params.examId, req.body.questions || []));
  } catch (err: unknown) { next(err); }
}

export async function updateStatus(
  req: Request<Record<string, string>, unknown, StatusBody>,
  res: Response,
  next: NextFunction,
): Promise<Response | void> {
  try {
    if (!(await assertExamAdministrationAccess(req, req.params.examId))) {
      return R.forbidden(res, 'You cannot modify an exam owned by another school');
    }
    const { rows: [exam] } = await query<ExamStatusRow>(
      'UPDATE exams SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING id, title, status',
      [req.body.status, req.params.examId],
    );
    if (!exam) return R.notFound(res, 'Exam not found');
    return R.ok(res, exam);
  } catch (err: unknown) { next(err); }
}
