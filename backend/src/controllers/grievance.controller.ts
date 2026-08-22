import type { NextFunction, Request, Response } from 'express';
import * as grievanceService from '../services/grievance.service';
import * as R from '../utils/response';

interface CreateBody extends grievanceService.CreateGrievanceInput {}
interface ReplyBody { body: string; internal?: boolean; }
interface ParentActionBody { action: 'CLOSE'|'REOPEN'|'ESCALATE'; note?: string; }
interface SchoolActionBody { action: 'ACKNOWLEDGE'|'START'|'RESOLVE'; note?: string; }
interface AdminActionBody { status: grievanceService.GrievanceStatus; note?: string; }

function user(req: Request, res: Response) {
  if (!req.user) { R.unauthorized(res); return null; }
  return req.user;
}

export async function parentCreate(req: Request<Record<string,string>, unknown, CreateBody>, res: Response, next: NextFunction): Promise<Response|void> {
  try { const u=user(req,res); if(!u)return; return R.created(res, await grievanceService.create(u.userId, req.body)); } catch(e:unknown){next(e);} }
export async function parentList(req: Request, res: Response, next: NextFunction): Promise<Response|void> {
  try { const u=user(req,res); if(!u)return; return R.ok(res, await grievanceService.listForParent(u.userId)); } catch(e:unknown){next(e);} }
export async function parentGet(req: Request, res: Response, next: NextFunction): Promise<Response|void> {
  try { const u=user(req,res); if(!u)return; return R.ok(res, await grievanceService.getForParent(u.userId, req.params.grievanceId)); } catch(e:unknown){next(e);} }
export async function parentReply(req: Request<Record<string,string>,unknown,ReplyBody>, res: Response, next: NextFunction): Promise<Response|void> {
  try { const u=user(req,res); if(!u)return; return R.created(res, await grievanceService.parentReply(u.userId, req.params.grievanceId, req.body.body)); } catch(e:unknown){next(e);} }
export async function parentAction(req: Request<Record<string,string>,unknown,ParentActionBody>, res: Response, next: NextFunction): Promise<Response|void> {
  try { const u=user(req,res); if(!u)return; return R.ok(res, await grievanceService.parentAction(u.userId, req.params.grievanceId, req.body.action, req.body.note)); } catch(e:unknown){next(e);} }

export async function schoolList(req: Request, res: Response, next: NextFunction): Promise<Response|void> {
  try { const u=user(req,res); if(!u)return; return R.ok(res, await grievanceService.listForSchool(u.userId, typeof req.query.status==='string'?req.query.status:undefined)); } catch(e:unknown){next(e);} }
export async function schoolGet(req: Request, res: Response, next: NextFunction): Promise<Response|void> {
  try { const u=user(req,res); if(!u)return; return R.ok(res, await grievanceService.getForSchool(u.userId, req.params.grievanceId)); } catch(e:unknown){next(e);} }
export async function schoolReply(req: Request<Record<string,string>,unknown,ReplyBody>, res: Response, next: NextFunction): Promise<Response|void> {
  try { const u=user(req,res); if(!u)return; return R.created(res, await grievanceService.schoolReply(u.userId, req.params.grievanceId, req.body.body, Boolean(req.body.internal))); } catch(e:unknown){next(e);} }
export async function schoolAction(req: Request<Record<string,string>,unknown,SchoolActionBody>, res: Response, next: NextFunction): Promise<Response|void> {
  try { const u=user(req,res); if(!u)return; return R.ok(res, await grievanceService.schoolAction(u.userId, req.params.grievanceId, req.body.action, req.body.note)); } catch(e:unknown){next(e);} }

export async function adminList(req: Request, res: Response, next: NextFunction): Promise<Response|void> {
  try { return R.ok(res, await grievanceService.listForAdmin(typeof req.query.status==='string'?req.query.status:undefined, typeof req.query.schoolId==='string'?req.query.schoolId:undefined)); } catch(e:unknown){next(e);} }
export async function adminGet(req: Request, res: Response, next: NextFunction): Promise<Response|void> {
  try { return R.ok(res, await grievanceService.getForAdmin(req.params.grievanceId)); } catch(e:unknown){next(e);} }
export async function adminReply(req: Request<Record<string,string>,unknown,ReplyBody>, res: Response, next: NextFunction): Promise<Response|void> {
  try { const u=user(req,res); if(!u)return; return R.created(res, await grievanceService.adminReply(u.userId, req.params.grievanceId, req.body.body, Boolean(req.body.internal))); } catch(e:unknown){next(e);} }
export async function adminAction(req: Request<Record<string,string>,unknown,AdminActionBody>, res: Response, next: NextFunction): Promise<Response|void> {
  try { const u=user(req,res); if(!u)return; return R.ok(res, await grievanceService.adminAction(u.userId, req.params.grievanceId, req.body.status, req.body.note)); } catch(e:unknown){next(e);} }
