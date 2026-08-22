import type { NextFunction, Request, Response } from 'express';
import * as attachmentService from '../services/grievanceAttachment.service';
import * as R from '../utils/response';

interface UploadBody {
  fileName: string;
  contentType: string;
  fileSize: number;
}

interface ConfirmBody extends UploadBody {
  key: string;
}

function authenticated(req: Request, res: Response) {
  if (!req.user) {
    R.unauthorized(res);
    return null;
  }
  return req.user;
}

export async function parentUploadUrl(
  req: Request<Record<string, string>, unknown, UploadBody>,
  res: Response,
  next: NextFunction,
): Promise<Response | void> {
  try {
    const user = authenticated(req, res); if (!user) return;
    return R.ok(res, await attachmentService.parentUploadUrl(
      req.params.grievanceId,
      user.userId,
      req.body.fileName,
      req.body.contentType,
      req.body.fileSize,
    ));
  } catch (error: unknown) { next(error); }
}

export async function parentConfirm(
  req: Request<Record<string, string>, unknown, ConfirmBody>,
  res: Response,
  next: NextFunction,
): Promise<Response | void> {
  try {
    const user = authenticated(req, res); if (!user) return;
    return R.created(res, await attachmentService.confirmParentAttachment(
      req.params.grievanceId,
      user.userId,
      req.body,
    ));
  } catch (error: unknown) { next(error); }
}

export async function parentList(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const user = authenticated(req, res); if (!user) return;
    return R.ok(res, await attachmentService.listForParent(req.params.grievanceId, user.userId));
  } catch (error: unknown) { next(error); }
}

export async function parentDownload(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const user = authenticated(req, res); if (!user) return;
    return R.ok(res, await attachmentService.downloadForParent(
      req.params.grievanceId,
      req.params.attachmentId,
      user.userId,
    ));
  } catch (error: unknown) { next(error); }
}

export async function schoolList(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const user = authenticated(req, res); if (!user) return;
    return R.ok(res, await attachmentService.listForSchool(req.params.grievanceId, user.userId));
  } catch (error: unknown) { next(error); }
}

export async function schoolDownload(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const user = authenticated(req, res); if (!user) return;
    return R.ok(res, await attachmentService.downloadForSchool(
      req.params.grievanceId,
      req.params.attachmentId,
      user.userId,
    ));
  } catch (error: unknown) { next(error); }
}

export async function adminList(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    return R.ok(res, await attachmentService.listForAdmin(req.params.grievanceId));
  } catch (error: unknown) { next(error); }
}

export async function adminDownload(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    return R.ok(res, await attachmentService.downloadForAdmin(req.params.grievanceId, req.params.attachmentId));
  } catch (error: unknown) { next(error); }
}
