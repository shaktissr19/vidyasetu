import type { NextFunction, Request, Response } from 'express';
import * as notificationInboxService from '../services/notificationInbox.service';
import * as R from '../utils/response';

function authenticated(req: Request, res: Response) {
  if (!req.user) {
    R.unauthorized(res);
    return null;
  }
  return req.user;
}

function parseLimit(value: unknown): number {
  const parsed = Number.parseInt(typeof value === 'string' ? value : '', 10);
  return Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), 100) : 50;
}

function parseBoolean(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  return ['1', 'true', 'yes'].includes(value.trim().toLowerCase());
}

export async function listNotifications(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const user = authenticated(req, res); if (!user) return;
    const items = await notificationInboxService.listNotifications(user.userId, {
      limit: parseLimit(req.query.limit),
      unreadOnly: parseBoolean(req.query.unreadOnly),
    });
    return R.ok(res, items);
  } catch (error: unknown) { next(error); }
}

export async function getUnreadCount(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const user = authenticated(req, res); if (!user) return;
    return R.ok(res, { count: await notificationInboxService.getUnreadCount(user.userId) });
  } catch (error: unknown) { next(error); }
}

export async function markRead(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const user = authenticated(req, res); if (!user) return;
    const notification = await notificationInboxService.markRead(user.userId, req.params.notificationId);
    if (!notification) return R.notFound(res, 'Notification not found');
    return R.ok(res, notification);
  } catch (error: unknown) { next(error); }
}

export async function markAllRead(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const user = authenticated(req, res); if (!user) return;
    return R.ok(res, { updatedCount: await notificationInboxService.markAllRead(user.userId) });
  } catch (error: unknown) { next(error); }
}
