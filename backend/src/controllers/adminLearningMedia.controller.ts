import type { NextFunction, Request, Response } from 'express';
import * as mediaService from '../services/adminLearningMedia.service';
import * as R from '../utils/response';

export async function uploadUrl(
  req: Request<Record<string, string>, unknown, { fileName: string; contentType: string }>,
  res: Response,
  next: NextFunction,
): Promise<Response | void> {
  try {
    return R.ok(res, await mediaService.createLearningUploadUrl(req.body.fileName, req.body.contentType));
  } catch (error: unknown) { next(error); }
}
