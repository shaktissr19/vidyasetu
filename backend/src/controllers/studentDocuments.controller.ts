import type { NextFunction, Request, Response } from 'express';
import type { UUID } from '@vidyasetu/contracts';
import * as documents from '../services/studentDocuments.service';
import * as R from '../utils/response';

function user(req: Request) {
  if (!req.user) throw Object.assign(new Error('Unauthorized'), { statusCode: 401 });
  return req.user;
}
function schoolId(req: Request): UUID {
  const value = user(req).schoolId;
  if (!value) throw Object.assign(new Error('School context is required'), { statusCode: 400 });
  return value;
}

export async function schoolDocuments(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const status = typeof req.query.status === 'string' ? req.query.status as documents.StudentDocumentStatus : undefined;
    return R.ok(res, await documents.listSchoolDocuments(schoolId(req), status));
  } catch (error: unknown) { next(error); }
}
export async function schoolRequests(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const status = typeof req.query.status === 'string' ? req.query.status as documents.StudentDocumentRequestStatus : undefined;
    return R.ok(res, await documents.listSchoolRequests(schoolId(req), status));
  } catch (error: unknown) { next(error); }
}
export async function reviewRequest(req: Request<Record<string,string>,unknown,documents.RequestReviewInput>, res: Response, next: NextFunction): Promise<Response | void> {
  try { return R.ok(res, await documents.reviewRequest(schoolId(req), user(req).userId, req.params.requestId, req.body)); } catch (error: unknown) { next(error); }
}
export async function issueDocument(req: Request<Record<string,string>,unknown,documents.IssueDocumentInput>, res: Response, next: NextFunction): Promise<Response | void> {
  try { return R.created(res, await documents.issueDocument(schoolId(req), user(req).userId, req.body)); } catch (error: unknown) { next(error); }
}
export async function revokeDocument(req: Request<Record<string,string>,unknown,{ reason: string }>, res: Response, next: NextFunction): Promise<Response | void> {
  try { return R.ok(res, await documents.revokeDocument(schoolId(req), user(req).userId, req.params.documentId, req.body.reason)); } catch (error: unknown) { next(error); }
}
export async function studentDocuments(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try { return R.ok(res, await documents.listStudentDocuments(user(req).userId)); } catch (error: unknown) { next(error); }
}
export async function studentRequests(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try { return R.ok(res, await documents.listStudentRequests(user(req).userId)); } catch (error: unknown) { next(error); }
}
export async function createStudentRequest(req: Request<Record<string,string>,unknown,documents.DocumentRequestInput>, res: Response, next: NextFunction): Promise<Response | void> {
  try { return R.created(res, await documents.createStudentRequest(user(req).userId, req.body)); } catch (error: unknown) { next(error); }
}
export async function parentDocuments(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try { return R.ok(res, await documents.listParentChildDocuments(user(req).userId, req.params.studentId)); } catch (error: unknown) { next(error); }
}
export async function parentRequests(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try { return R.ok(res, await documents.listParentChildRequests(user(req).userId, req.params.studentId)); } catch (error: unknown) { next(error); }
}
export async function createParentRequest(req: Request<Record<string,string>,unknown,documents.DocumentRequestInput>, res: Response, next: NextFunction): Promise<Response | void> {
  try { return R.created(res, await documents.createParentRequest(user(req).userId, req.params.studentId, req.body)); } catch (error: unknown) { next(error); }
}
export async function verifyDocument(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try { return R.ok(res, await documents.verifyDocument(req.params.code)); } catch (error: unknown) { next(error); }
}
