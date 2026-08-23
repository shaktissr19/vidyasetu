import type { NextFunction, Request, Response } from 'express';
import type { QueryResultRow } from 'pg';
import type { UUID } from '@vidyasetu/contracts';
import * as studentService from '../services/student.service';
import * as studentProfileService from '../services/studentProfile.service';
import * as studentPortalService from '../services/studentPortal.service';
import * as studentOverviewService from '../services/studentOverview.service';
import * as studentLearningService from '../services/studentLearning.service';
import * as studentLearningHubService from '../services/studentLearningHub.service';
import * as enrollmentService from '../services/enrollment.service';
import * as notificationService from '../services/notification.service';
import { query } from '../config/db';
import * as R from '../utils/response';

interface IdentityRow extends QueryResultRow {
  student_code: string;
}

interface NotificationRow extends QueryResultRow {
  id: UUID;
  type: string;
  channel: string;
  title: string;
  body: string;
  reference_type: string | null;
  reference_id: string | null;
  is_read: boolean;
  read_at: string | Date | null;
  delivery_status: string | null;
  created_at: string | Date;
}

function queryString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

export async function getProfileStatus(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const user = req.user;
    if (!user) return R.unauthorized(res);
    return R.ok(res, await studentProfileService.getProfileStatus(user.userId));
  } catch (err: unknown) { next(err); }
}

export async function getProfileSetupOptions(_req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try { return R.ok(res, await studentProfileService.getSetupOptions()); }
  catch (err: unknown) { next(err); }
}

export async function completeProfile(
  req: Request<Record<string, string>, unknown, studentProfileService.CompleteStudentProfileInput>,
  res: Response,
  next: NextFunction,
): Promise<Response | void> {
  try {
    const user = req.user;
    if (!user) return R.unauthorized(res);
    const data = await studentProfileService.completeProfile(user.userId, req.body);
    return R.ok(res, { message: 'Student profile completed', student: data });
  } catch (err: unknown) { next(err); }
}

export async function getDashboard(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const user = req.user;
    if (!user) return R.unauthorized(res);
    return R.ok(res, await studentOverviewService.getDashboard(user.userId));
  } catch (err: unknown) { next(err); }
}

export async function getSchoolLink(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const user = req.user;
    if (!user) return R.unauthorized(res);
    const data = await enrollmentService.getStudentLinkSummary(user.userId);
    if (!data) return R.notFound(res, 'Student profile not found');
    return R.ok(res, data);
  } catch (err: unknown) { next(err); }
}

export async function getAttendance(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const user = req.user;
    if (!user) return R.unauthorized(res);
    const year = Number.parseInt(req.params.year || String(new Date().getFullYear()), 10);
    const month = Number.parseInt(req.params.month || String(new Date().getMonth() + 1), 10);
    return R.ok(res, await studentService.getAttendance(user.userId, year, month));
  } catch (err: unknown) { next(err); }
}

export async function getReportCard(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const user = req.user;
    if (!user) return R.unauthorized(res);
    const term = queryString(req.query.term);
    const year = queryString(req.query.year);
    const data = await studentService.getReportCard(user.userId, term, year);
    const { rows: [identity] } = await query<IdentityRow>(
      `SELECT student_code FROM students WHERE user_id = $1`,
      [user.userId],
    );
    const reportStudent: typeof data.student & { student_code?: string | null } = data.student;
    reportStudent.student_code = identity?.student_code || null;
    return R.ok(res, data);
  } catch (err: unknown) { next(err); }
}

export async function markContentComplete(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const user = req.user;
    if (!user) return R.unauthorized(res);
    return R.ok(res, await studentLearningService.markContentComplete(user.userId, req.params.contentItemId));
  } catch (err: unknown) { next(err); }
}

export async function getLearningHome(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const user = req.user;
    if (!user) return R.unauthorized(res);
    return R.ok(res, await studentLearningHubService.getLearningHome(user.userId));
  } catch (err: unknown) { next(err); }
}

export async function updateLearningResourceProgress(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const user = req.user;
    if (!user) return R.unauthorized(res);
    return R.ok(res, await studentLearningHubService.updateResourceProgress(user.userId, req.params.resourceId, Number(req.body.progressPct)));
  } catch (err: unknown) { next(err); }
}

export async function addLearningBookmark(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const user = req.user;
    if (!user) return R.unauthorized(res);
    return R.ok(res, await studentLearningHubService.addBookmark(user.userId, req.params.resourceId));
  } catch (err: unknown) { next(err); }
}

export async function removeLearningBookmark(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const user = req.user;
    if (!user) return R.unauthorized(res);
    return R.ok(res, await studentLearningHubService.removeBookmark(user.userId, req.params.resourceId));
  } catch (err: unknown) { next(err); }
}

export async function getLearningAssessments(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const user = req.user;
    if (!user) return R.unauthorized(res);
    return R.ok(res, await studentLearningHubService.listAssessments(user.userId));
  } catch (err: unknown) { next(err); }
}

export async function getLearningAssessment(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const user = req.user;
    if (!user) return R.unauthorized(res);
    return R.ok(res, await studentLearningHubService.getAssessment(user.userId, req.params.assessmentId));
  } catch (err: unknown) { next(err); }
}

export async function startLearningAssessment(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const user = req.user;
    if (!user) return R.unauthorized(res);
    return R.ok(res, await studentLearningHubService.startAssessment(user.userId, req.params.assessmentId));
  } catch (err: unknown) { next(err); }
}

export async function submitLearningAssessment(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const user = req.user;
    if (!user) return R.unauthorized(res);
    return R.ok(res, await studentLearningHubService.submitAssessment(user.userId, req.params.attemptId, req.body.answers || [], req.body.timeSpentSecs));
  } catch (err: unknown) { next(err); }
}

export async function getNotifications(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const user = req.user;
    if (!user) return R.unauthorized(res);
    const { rows } = await query<NotificationRow>(
      `SELECT id, type, channel, title, body, reference_type, reference_id,
              is_read, read_at, delivery_status, sent_at AS created_at
       FROM notifications
       WHERE user_id = $1
       ORDER BY sent_at DESC
       LIMIT 50`,
      [user.userId],
    );
    return R.ok(res, rows);
  } catch (err: unknown) { next(err); }
}

export async function markNotifRead(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const user = req.user;
    if (!user) return R.unauthorized(res);
    await notificationService.markNotificationRead(req.params.id, user.userId);
    return R.ok(res, { message: 'Marked as read' });
  } catch (err: unknown) { next(err); }
}

export async function getOfflineDownloads(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const user = req.user;
    if (!user) return R.unauthorized(res);
    return R.ok(res, await studentPortalService.getOfflineDownloads(user.userId));
  } catch (err: unknown) { next(err); }
}

export async function removeOfflineDownload(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const user = req.user;
    if (!user) return R.unauthorized(res);
    return R.ok(res, await studentPortalService.removeOfflineDownload(user.userId, req.params.contentItemId));
  } catch (err: unknown) { next(err); }
}
