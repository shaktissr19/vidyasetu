import type { NextFunction, Request, Response } from 'express';
import * as adminService from '../services/admin.service';
import { query } from '../config/db';
import * as R from '../utils/response';

interface StatusBody { status: string; }
interface ConfigBody { key: string; value: unknown; }
interface ConfigValueBody { value: unknown; }
interface TicketBody { status?: string; resolution?: string | null; }
interface CompetitionBody {
  title: string;
  title_hi?: string | null;
  description?: string | null;
  class_names?: string[];
  subject_codes?: string[];
  total_questions?: number;
  duration_mins?: number;
  marks_per_question?: number;
  negative_marks?: number;
  start_time: string;
  end_time: string;
  prize_pool?: number;
}

function queryString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function authenticated(req: Request, res: Response) {
  if (!req.user) { R.unauthorized(res); return null; }
  return req.user;
}

export async function getAnalytics(_req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try { return R.ok(res, await adminService.getPlatformAnalytics()); }
  catch (err: unknown) { next(err); }
}

export async function getRevenue(_req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try { return R.ok(res, await adminService.getRevenueAnalytics()); }
  catch (err: unknown) { next(err); }
}

export async function getContentAnalytics(_req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try { return R.ok(res, await adminService.getContentAnalytics()); }
  catch (err: unknown) { next(err); }
}

export async function listSchools(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const result = await adminService.listSchools(req.query, {
      status: queryString(req.query.status),
      state: queryString(req.query.state),
      plan: queryString(req.query.plan),
      search: queryString(req.query.search),
    });
    return R.ok(res, result.schools, result.meta);
  } catch (err: unknown) { next(err); }
}

export async function getSchool(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try { return R.ok(res, await adminService.getSchoolDetail(req.params.schoolId)); }
  catch (err: unknown) { next(err); }
}

export async function updateSchoolStatus(
  req: Request<Record<string, string>, unknown, StatusBody>,
  res: Response,
  next: NextFunction,
): Promise<Response | void> {
  try {
    const user = authenticated(req, res); if (!user) return;
    return R.ok(res, await adminService.updateSchoolStatus(req.params.schoolId, req.body.status, user.userId));
  } catch (err: unknown) { next(err); }
}

export async function listUsers(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const result = await adminService.listUsers(req.query, {
      role: queryString(req.query.role),
      status: queryString(req.query.status),
      search: queryString(req.query.search),
    });
    return R.ok(res, result.users, result.meta);
  } catch (err: unknown) { next(err); }
}

export async function updateUserStatus(
  req: Request<Record<string, string>, unknown, StatusBody>,
  res: Response,
  next: NextFunction,
): Promise<Response | void> {
  try {
    const user = authenticated(req, res); if (!user) return;
    return R.ok(res, await adminService.updateUserStatus(req.params.userId, req.body.status, user.userId));
  } catch (err: unknown) { next(err); }
}

export async function getConfig(_req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try { return R.ok(res, await adminService.getPlatformConfig()); }
  catch (err: unknown) { next(err); }
}

export async function updateConfig(
  req: Request<Record<string, string>, unknown, ConfigValueBody>,
  res: Response,
  next: NextFunction,
): Promise<Response | void> {
  try {
    const user = authenticated(req, res); if (!user) return;
    return R.ok(res, await adminService.updatePlatformConfig(req.params.key, req.body.value, user.userId));
  } catch (err: unknown) { next(err); }
}

export async function getTickets(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const conditions = ['1=1'];
    const values: unknown[] = [];
    const status = queryString(req.query.status);
    if (status) { conditions.push(`st.status=$${values.length + 1}`); values.push(status); }
    const { rows } = await query(
      `SELECT st.*,u.name AS raised_by_name,s.name AS school_name
       FROM support_tickets st
       JOIN users u ON u.id=st.raised_by
       LEFT JOIN schools s ON s.id=st.school_id
       WHERE ${conditions.join(' AND ')} ORDER BY st.created_at DESC LIMIT 100`,
      values,
    );
    return R.ok(res, rows);
  } catch (err: unknown) { next(err); }
}

export async function updateTicket(
  req: Request<Record<string, string>, unknown, TicketBody>,
  res: Response,
  next: NextFunction,
): Promise<Response | void> {
  try {
    const { rows } = await query(
      `UPDATE support_tickets SET status=$1,resolution=$2,closed_at=CASE WHEN $1='RESOLVED' THEN NOW() ELSE NULL END,updated_at=NOW()
       WHERE id=$3 RETURNING *`,
      [req.body.status || 'RESOLVED', req.body.resolution || null, req.params.ticketId],
    );
    return R.ok(res, rows[0]);
  } catch (err: unknown) { next(err); }
}

export async function updateConfigBody(
  req: Request<Record<string, string>, unknown, ConfigBody>,
  res: Response,
  next: NextFunction,
): Promise<Response | void> {
  try {
    const user = authenticated(req, res); if (!user) return;
    return R.ok(res, await adminService.updatePlatformConfig(req.body.key, req.body.value, user.userId));
  } catch (err: unknown) { next(err); }
}

export async function listCompetitions(_req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const { rows } = await query(
      `SELECT e.*,u.name AS created_by_name FROM exams e JOIN users u ON u.id=e.created_by
       WHERE e.type='OLYMPIAD' ORDER BY e.start_time DESC LIMIT 50`,
    );
    return R.ok(res, rows);
  } catch (err: unknown) { next(err); }
}

export async function createCompetition(
  req: Request<Record<string, string>, unknown, CompetitionBody>,
  res: Response,
  next: NextFunction,
): Promise<Response | void> {
  try {
    const user = authenticated(req, res); if (!user) return;
    const body = req.body;
    const { rows } = await query(
      `INSERT INTO exams (created_by,title,title_hi,description,type,status,class_names,subject_codes,
        total_questions,duration_mins,marks_per_question,negative_marks,start_time,end_time,prize_pool)
       VALUES ($1,$2,$3,$4,'OLYMPIAD','DRAFT',$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [user.userId, body.title, body.title_hi || null, body.description || null,
       body.class_names || [], body.subject_codes || [], body.total_questions || 30, body.duration_mins || 60,
       body.marks_per_question || 4, body.negative_marks || 1, body.start_time, body.end_time, body.prize_pool || 0],
    );
    return R.ok(res, rows[0]);
  } catch (err: unknown) { next(err); }
}
