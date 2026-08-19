import type { NextFunction, Request, Response } from 'express';
import type { QueryResultRow } from 'pg';
import type { UUID } from '@vidyasetu/contracts';
import * as contentService from '../services/content.service';
import * as academicLearningService from '../services/academicLearning.service';
import type { QuizAnswerInput } from '../services/academicLearning.service';
import { query } from '../config/db';
import * as R from '../utils/response';

interface StudentIdRow extends QueryResultRow { id: UUID; }
interface QuizSubmitBody { answers: QuizAnswerInput[]; }

function queryString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function authenticated(req: Request, res: Response) {
  if (!req.user) { R.unauthorized(res); return null; }
  return req.user;
}

export async function getSubjects(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    return R.ok(res, await contentService.getSubjectsForClass(queryString(req.query.class) || '8'));
  } catch (err: unknown) { next(err); }
}

export async function getChapters(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    return R.ok(res, await contentService.getChapters(req.params.subjectId, queryString(req.query.class) || '8'));
  } catch (err: unknown) { next(err); }
}

export async function getContentItems(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    let studentId: UUID | null = null;
    if (req.user?.role === 'STUDENT') {
      const { rows: [student] } = await query<StudentIdRow>('SELECT id FROM students WHERE user_id = $1', [req.user.userId]);
      studentId = student?.id || null;
    }
    return R.ok(res, await contentService.getContentItems(
      req.params.chapterId,
      studentId,
      queryString(req.query.lang) || 'hi',
    ));
  } catch (err: unknown) { next(err); }
}

export async function getContentUrl(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const user = authenticated(req, res); if (!user) return;
    const { rows: [student] } = await query<StudentIdRow>('SELECT id FROM students WHERE user_id = $1', [user.userId]);
    return R.ok(res, await contentService.getContentUrl(req.params.itemId, student?.id || null));
  } catch (err: unknown) { next(err); }
}

export async function markComplete(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const user = authenticated(req, res); if (!user) return;
    return R.ok(res, await academicLearningService.markContentComplete(user.userId, req.params.itemId));
  } catch (err: unknown) { next(err); }
}

export async function getQuizQuestions(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    return R.ok(res, await contentService.getQuizQuestions(req.params.itemId));
  } catch (err: unknown) { next(err); }
}

export async function submitQuiz(
  req: Request<Record<string, string>, unknown, QuizSubmitBody>,
  res: Response,
  next: NextFunction,
): Promise<Response | void> {
  try {
    const user = authenticated(req, res); if (!user) return;
    return R.ok(res, await academicLearningService.submitQuiz(req.params.itemId, user.userId, req.body.answers));
  } catch (err: unknown) { next(err); }
}

export async function downloadOffline(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const user = authenticated(req, res); if (!user) return;
    const { rows: [student] } = await query<StudentIdRow>('SELECT id FROM students WHERE user_id = $1', [user.userId]);
    if (!student) return R.notFound(res, 'Student not found');
    return R.ok(res, await contentService.markForOfflineDownload(req.params.itemId, student.id));
  } catch (err: unknown) { next(err); }
}

export async function getUploadUrl(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const fileName = queryString(req.query.fileName);
    const contentType = queryString(req.query.contentType);
    const chapterId = queryString(req.query.chapterId);
    const type = queryString(req.query.type);
    if (!fileName || !contentType || !chapterId || !type) {
      return R.badRequest(res, 'fileName, contentType, chapterId and type are required');
    }
    return R.ok(res, await contentService.getUploadPresignedUrl(fileName, contentType, chapterId, type));
  } catch (err: unknown) { next(err); }
}

export async function saveContentItem(
  req: Request<Record<string, string>, unknown, contentService.SaveContentItemInput>,
  res: Response,
  next: NextFunction,
): Promise<Response | void> {
  try {
    const user = authenticated(req, res); if (!user) return;
    return R.created(res, await contentService.saveContentItem(req.body, user.userId));
  } catch (err: unknown) { next(err); }
}
