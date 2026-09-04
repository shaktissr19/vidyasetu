import type { NextFunction, Request, Response } from 'express';
import type { UUID } from '@vidyasetu/contracts';
import * as transport from '../services/transport.service';
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

export async function vehicles(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try { return R.ok(res, await transport.listVehicles(schoolId(req))); } catch (error: unknown) { next(error); }
}
export async function createVehicle(req: Request<Record<string,string>,unknown,transport.VehicleInput>, res: Response, next: NextFunction): Promise<Response | void> {
  try { return R.created(res, await transport.createVehicle(schoolId(req), user(req).userId, req.body)); } catch (error: unknown) { next(error); }
}
export async function updateVehicle(req: Request<Record<string,string>,unknown,Partial<transport.VehicleInput>>, res: Response, next: NextFunction): Promise<Response | void> {
  try { return R.ok(res, await transport.updateVehicle(schoolId(req), req.params.vehicleId, req.body)); } catch (error: unknown) { next(error); }
}
export async function routes(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try { return R.ok(res, await transport.listRoutes(schoolId(req))); } catch (error: unknown) { next(error); }
}
export async function createRoute(req: Request<Record<string,string>,unknown,transport.RouteInput>, res: Response, next: NextFunction): Promise<Response | void> {
  try { return R.created(res, await transport.createRoute(schoolId(req), user(req).userId, req.body)); } catch (error: unknown) { next(error); }
}
export async function createStop(req: Request<Record<string,string>,unknown,transport.StopInput>, res: Response, next: NextFunction): Promise<Response | void> {
  try { return R.created(res, await transport.createStop(schoolId(req), req.params.routeId, req.body)); } catch (error: unknown) { next(error); }
}
export async function assignments(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try { return R.ok(res, await transport.listAssignments(schoolId(req))); } catch (error: unknown) { next(error); }
}
export async function assignStudent(req: Request<Record<string,string>,unknown,transport.AssignmentInput>, res: Response, next: NextFunction): Promise<Response | void> {
  try { return R.ok(res, await transport.assignStudent(schoolId(req), user(req).userId, req.params.studentId, req.body)); } catch (error: unknown) { next(error); }
}
export async function manifest(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const date = typeof req.query.date === 'string' ? req.query.date : new Date().toISOString().slice(0,10);
    return R.ok(res, await transport.getManifest(schoolId(req), date));
  } catch (error: unknown) { next(error); }
}
export async function recordEvent(req: Request<Record<string,string>,unknown,transport.EventInput>, res: Response, next: NextFunction): Promise<Response | void> {
  try { return R.created(res, await transport.recordStudentEvent(schoolId(req), user(req).userId, req.body)); } catch (error: unknown) { next(error); }
}
export async function studentTransport(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try { return R.ok(res, await transport.getStudentTransport(user(req).userId)); } catch (error: unknown) { next(error); }
}
export async function parentChildTransport(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try { return R.ok(res, await transport.getParentChildTransport(user(req).userId, req.params.studentId)); } catch (error: unknown) { next(error); }
}
