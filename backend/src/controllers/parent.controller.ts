import type { NextFunction, Request, Response } from 'express';
import * as parentService from '../services/parent.service';
import * as R from '../utils/response';

interface MessageBody { body: string; }

function authenticated(req: Request, res: Response) {
  if (!req.user) {
    R.unauthorized(res);
    return null;
  }
  return req.user;
}

function queryInteger(value: unknown, fallback: number): number {
  const parsed = Number.parseInt(typeof value === 'string' ? value : '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function getChildren(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const user = authenticated(req, res); if (!user) return;
    return R.ok(res, await parentService.getChildren(user.userId));
  } catch (err: unknown) { next(err); }
}

export async function getChildDashboard(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const user = authenticated(req, res); if (!user) return;
    return R.ok(res, await parentService.getChildDashboard(user.userId, req.params.studentId));
  } catch (err: unknown) { next(err); }
}

export async function getChildAttendance(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const user = authenticated(req, res); if (!user) return;
    const year = queryInteger(req.query.year, new Date().getFullYear());
    const month = queryInteger(req.query.month, new Date().getMonth() + 1);
    return R.ok(res, await parentService.getChildAttendance(user.userId, req.params.studentId, year, month));
  } catch (err: unknown) { next(err); }
}

export async function getChildFees(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const user = authenticated(req, res); if (!user) return;
    return R.ok(res, await parentService.getChildFees(user.userId, req.params.studentId));
  } catch (err: unknown) { next(err); }
}

export async function getMessages(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const user = authenticated(req, res); if (!user) return;
    return R.ok(res, await parentService.getMessages(user.userId, req.params.studentId));
  } catch (err: unknown) { next(err); }
}

export async function sendMessage(
  req: Request<Record<string, string>, unknown, MessageBody>,
  res: Response,
  next: NextFunction,
): Promise<Response | void> {
  try {
    const user = authenticated(req, res); if (!user) return;
    return R.created(res, await parentService.sendMessage(user.userId, req.params.studentId, req.body.body));
  } catch (err: unknown) { next(err); }
}

export async function getNotifications(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const user = authenticated(req, res); if (!user) return;
    return R.ok(res, await parentService.getNotifications(user.userId));
  } catch (err: unknown) { next(err); }
}
