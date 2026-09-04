import type { NextFunction, Request, Response } from 'express';
import type { UUID } from '@vidyasetu/contracts';
import * as library from '../services/library.service';
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
function staffRole(req: Request): library.LibraryActorRole {
  return user(req).role as library.LibraryActorRole;
}

export async function catalog(req: Request,res: Response,next: NextFunction): Promise<Response|void>{try{return R.ok(res,await library.listCatalog(schoolId(req)));}catch(e:unknown){next(e);}}
export async function copies(req: Request,res: Response,next: NextFunction): Promise<Response|void>{try{return R.ok(res,await library.listCopies(schoolId(req),typeof req.query.bookId==='string'?req.query.bookId:undefined));}catch(e:unknown){next(e);}}
export async function createBook(req: Request<Record<string,string>,unknown,library.CreateBookInput>,res: Response,next: NextFunction): Promise<Response|void>{try{return R.created(res,await library.createBook(schoolId(req),user(req).userId,staffRole(req),req.body));}catch(e:unknown){next(e);}}
export async function createCopy(req: Request<Record<string,string>,unknown,library.CreateCopyInput>,res: Response,next: NextFunction): Promise<Response|void>{try{return R.created(res,await library.createCopy(schoolId(req),staffRole(req),req.params.bookId,req.body));}catch(e:unknown){next(e);}}
export async function staffAccess(req: Request,res: Response,next: NextFunction): Promise<Response|void>{try{return R.ok(res,await library.listStaffAccess(schoolId(req),staffRole(req)));}catch(e:unknown){next(e);}}
export async function setStaffAccess(req: Request<Record<string,string>,unknown,library.StaffAccessInput>,res: Response,next: NextFunction): Promise<Response|void>{try{return R.ok(res,await library.setStaffAccess(schoolId(req),user(req).userId,staffRole(req),req.params.userId,req.body));}catch(e:unknown){next(e);}}
export async function schoolLoans(req: Request,res: Response,next: NextFunction): Promise<Response|void>{try{const status=typeof req.query.status==='string'?req.query.status as library.LibraryLoanStatus:undefined;return R.ok(res,await library.listSchoolLoans(schoolId(req),staffRole(req),user(req).userId,status));}catch(e:unknown){next(e);}}
export async function issueLoan(req: Request<Record<string,string>,unknown,library.IssueLoanInput>,res: Response,next: NextFunction): Promise<Response|void>{try{return R.created(res,await library.issueLoan(schoolId(req),user(req).userId,staffRole(req),req.body));}catch(e:unknown){next(e);}}
export async function returnLoan(req: Request<Record<string,string>,unknown,library.ReturnLoanInput>,res: Response,next: NextFunction): Promise<Response|void>{try{return R.ok(res,await library.returnLoan(schoolId(req),user(req).userId,staffRole(req),req.params.loanId,req.body));}catch(e:unknown){next(e);}}
export async function studentLoans(req: Request,res: Response,next: NextFunction): Promise<Response|void>{try{return R.ok(res,await library.listStudentLoans(user(req).userId));}catch(e:unknown){next(e);}}
export async function parentChildLoans(req: Request,res: Response,next: NextFunction): Promise<Response|void>{try{return R.ok(res,await library.listParentChildLoans(user(req).userId,req.params.studentId));}catch(e:unknown){next(e);}}
