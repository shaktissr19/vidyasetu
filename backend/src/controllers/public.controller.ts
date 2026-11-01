import type { NextFunction, Request, Response } from 'express';
import * as publicOverviewService from '../services/publicOverview.service';
import * as homepageService from '../services/homepage.service';
import * as publicPageContentService from '../services/publicPageContent.service';
import * as R from '../utils/response';

export async function overview(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<Response | void> {
  try {
    return R.ok(res, await publicOverviewService.getPublicOverview());
  } catch (error: unknown) {
    next(error);
  }
}

export async function schools(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<Response | void> {
  try {
    return R.ok(res, await publicOverviewService.listPublicSchools());
  } catch (error: unknown) {
    next(error);
  }
}

export async function homepage(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<Response | void> {
  try {
    return R.ok(res, await homepageService.getPublishedHomepage());
  } catch (error: unknown) {
    next(error);
  }
}

export async function learnPage(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<Response | void> {
  try { return R.ok(res, await publicPageContentService.getPublishedLearnPage()); }
  catch (error: unknown) { next(error); }
}

export async function modulePage(req: Request<{ slug: string }>, res: Response, next: NextFunction): Promise<Response | void> {
  try { return R.ok(res, await publicPageContentService.getPublishedModulePage(req.params.slug)); }
  catch (error: unknown) { next(error); }
}

export async function homepageVideo(req: Request<{ filename: string }>, res: Response, next: NextFunction): Promise<Response | void> {
  try { return res.redirect(302, await homepageService.getHomepageVideoReadUrl(req.params.filename)); }
  catch (error: unknown) { next(error); }
}
