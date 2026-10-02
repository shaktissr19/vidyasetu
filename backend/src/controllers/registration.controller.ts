import type { NextFunction, Request, Response } from 'express';
import * as registrationService from '../services/registration.service';
import * as authService from '../services/auth.service';
import * as R from '../utils/response';

interface RegisterBody extends registrationService.PublicRegistrationInput {
  deviceInfo?: string;
}

interface RegisterStudentBody extends authService.RegisterStudentInput {
  deviceInfo?: string;
}

export async function registerStudent(
  req: Request<Record<string, string>, unknown, RegisterStudentBody>,
  res: Response,
  next: NextFunction,
): Promise<Response | void> {
  try {
    // Identity, School request and Parent invitation commit atomically.
    const result = await authService.registerStudent(req.body, req.body.deviceInfo || null, req.ip || null);
    return R.created(res, result);
  } catch (err: unknown) {
    next(err);
  }
}

export async function register(
  req: Request<Record<string, string>, unknown, RegisterBody>,
  res: Response,
  next: NextFunction,
): Promise<Response | void> {
  try {
    const result = await registrationService.registerPublicAccount(req.body);

    // Parent accounts are immediately usable, but a requested child relationship
    // remains pending until the Student confirms it. Teacher and School accounts
    // intentionally remain PENDING and receive no usable session until approval.
    if (req.body.role === 'PARENT') {
      const session = await authService.loginWithPassword(
        req.body.mobile,
        req.body.password,
        req.body.deviceInfo || null,
        req.ip || null,
      );
      return R.created(res, { ...result, ...session });
    }

    return R.created(res, result);
  } catch (err: unknown) {
    next(err);
  }
}
