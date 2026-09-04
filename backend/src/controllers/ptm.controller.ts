import type { NextFunction, Request, Response } from 'express';
import type { UUID } from '@vidyasetu/contracts';
import * as ptm from '../services/ptm.service';
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

export async function schoolSessions(req: Request,res: Response,next: NextFunction): Promise<Response|void>{try{return R.ok(res,await ptm.listSchoolSessions(schoolId(req)));}catch(e:unknown){next(e);}}
export async function createSession(req: Request<Record<string,string>,unknown,ptm.CreatePtmSessionInput>,res: Response,next: NextFunction): Promise<Response|void>{try{const u=user(req);return R.created(res,await ptm.createSession(schoolId(req),u.userId,u.role,req.body));}catch(e:unknown){next(e);}}
export async function sessionStatus(req: Request<Record<string,string>,unknown,ptm.PtmSessionStatusInput>,res: Response,next: NextFunction): Promise<Response|void>{try{return R.ok(res,await ptm.changeSessionStatus(schoolId(req),user(req).role,req.params.sessionId,req.body));}catch(e:unknown){next(e);}}
export async function schoolSlots(req: Request,res: Response,next: NextFunction): Promise<Response|void>{try{const u=user(req);return R.ok(res,await ptm.listSchoolSlots(schoolId(req),u.userId,u.role,typeof req.query.sessionId==='string'?req.query.sessionId:undefined));}catch(e:unknown){next(e);}}
export async function createSlot(req: Request<Record<string,string>,unknown,ptm.CreatePtmSlotInput>,res: Response,next: NextFunction): Promise<Response|void>{try{const u=user(req);return R.created(res,await ptm.createSlot(schoolId(req),u.userId,u.role,req.params.sessionId,req.body));}catch(e:unknown){next(e);}}
export async function schoolBookings(req: Request,res: Response,next: NextFunction): Promise<Response|void>{try{const u=user(req);return R.ok(res,await ptm.listSchoolBookings(schoolId(req),u.userId,u.role,typeof req.query.sessionId==='string'?req.query.sessionId:undefined));}catch(e:unknown){next(e);}}
export async function outcome(req: Request<Record<string,string>,unknown,ptm.PtmOutcomeInput>,res: Response,next: NextFunction): Promise<Response|void>{try{const u=user(req);return R.ok(res,await ptm.updateOutcome(schoolId(req),u.userId,u.role,req.params.bookingId,req.body));}catch(e:unknown){next(e);}}
export async function parentOptions(req: Request,res: Response,next: NextFunction): Promise<Response|void>{try{return R.ok(res,await ptm.listParentOptions(user(req).userId,req.params.studentId));}catch(e:unknown){next(e);}}
export async function parentBookings(req: Request,res: Response,next: NextFunction): Promise<Response|void>{try{return R.ok(res,await ptm.listParentBookings(user(req).userId,req.params.studentId));}catch(e:unknown){next(e);}}
export async function book(req: Request<Record<string,string>,unknown,ptm.CreatePtmBookingInput>,res: Response,next: NextFunction): Promise<Response|void>{try{return R.created(res,await ptm.bookParentSlot(user(req).userId,req.params.studentId,req.params.slotId,req.body));}catch(e:unknown){next(e);}}
export async function cancel(req: Request,res: Response,next: NextFunction): Promise<Response|void>{try{return R.ok(res,await ptm.cancelParentBooking(user(req).userId,req.params.bookingId));}catch(e:unknown){next(e);}}
export async function studentBookings(req: Request,res: Response,next: NextFunction): Promise<Response|void>{try{return R.ok(res,await ptm.listStudentBookings(user(req).userId));}catch(e:unknown){next(e);}}
