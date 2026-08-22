import type { NextFunction, Request, Response } from 'express';
import * as attachmentService from '../services/groupAttachment.service';
import * as R from '../utils/response';

interface UploadBody {
  fileName: string;
  contentType: string;
}

export async function uploadUrl(
  req: Request<Record<string, string>, unknown, UploadBody>,
  res: Response,
  next: NextFunction,
): Promise<Response | void> {
  try {
    if (!req.user) return R.unauthorized(res);
    return R.ok(res, await attachmentService.getGroupUploadUrl(
      req.params.groupId,
      req.user.userId,
      req.body.fileName,
      req.body.contentType,
    ));
  } catch (error: unknown) { next(error); }
}

export async function downloadUrl(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    if (!req.user) return R.unauthorized(res);
    const key = typeof req.query.key === 'string' ? req.query.key : '';
    if (!key) return R.badRequest(res, 'Attachment key is required');
    return R.ok(res, await attachmentService.getGroupDownloadUrl(req.params.groupId, req.user.userId, key));
  } catch (error: unknown) { next(error); }
}
