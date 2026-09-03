import type { NextFunction, Request, Response } from 'express';
import type { QueryResultRow } from 'pg';
import type { LanguageCode, UserRole, UUID } from '@vidyasetu/contracts';
import * as authService from '../services/auth.service';
import * as sessionService from '../services/session.service';
import { query } from '../config/db';
import * as R from '../utils/response';

type BodyRequest<TBody> = Request<Record<string, string>, unknown, TBody>;

interface SendOtpBody {
  mobile: string;
  role?: UserRole;
}

interface VerifyOtpBody {
  mobile: string;
  otp: string;
  deviceInfo?: string;
  role?: UserRole;
}

interface LoginBody {
  identifier: string;
  password: string;
  deviceInfo?: string;
}

interface RegisterStudentBody extends authService.RegisterStudentInput {
  deviceInfo?: string;
}

interface RefreshBody {
  refreshToken: string;
}

interface LogoutBody {
  refreshToken?: string;
}

interface RevokeOtherSessionsBody {
  refreshToken: string;
}

interface UpdateProfileBody extends authService.UpdateProfileInput {}

interface SetPasswordBody {
  currentPassword?: string | null;
  newPassword: string;
}

interface ForgotPasswordBody {
  identifier: string;
}

interface ResetPasswordBody {
  identifier: string;
  otp: string;
  newPassword: string;
}

interface RoleRow extends QueryResultRow {
  role: UserRole;
}

interface RegistrationClass {
  id: UUID;
  className: string;
  section: string;
  label: string;
  academicYear: string;
}

interface RegistrationSchoolRow extends QueryResultRow {
  id: UUID;
  name: string;
  name_hi: string | null;
  city: string | null;
  district: string | null;
  state: string | null;
  udise_code: string | null;
  academic_year: string;
  classes: RegistrationClass[];
}

interface MeRow extends QueryResultRow {
  id: UUID;
  name: string | null;
  username: string | null;
  email: string | null;
  mobile: string;
  role: UserRole;
  status: string;
  language: LanguageCode;
  profile_photo: string | null;
  last_login_at: string | Date | null;
  must_change_password: boolean | null;
  student_code: string | null;
  grade_level: string | null;
  school_link_status: string | null;
  roll_number: string | null;
  academic_year: string | null;
  school_name: string | null;
  class_name: string | null;
  section: string | null;
}

async function validateOtpRole(
  mobile: string,
  role: UserRole | undefined,
  res: Response,
): Promise<Response | null> {
  if (!role) return null;
  const { rows: [existing] } = await query<RoleRow>(
    'SELECT role FROM users WHERE mobile = $1',
    [mobile],
  );
  if (existing && existing.role !== role) {
    return R.forbidden(
      res,
      `This mobile number belongs to a ${existing.role.replaceAll('_', ' ').toLowerCase()} account`,
    );
  }
  if (!existing && role !== 'STUDENT') {
    return R.badRequest(res, 'No registered account exists for this role and mobile number');
  }
  return null;
}

export async function sendOTP(
  req: BodyRequest<SendOtpBody>,
  res: Response,
  next: NextFunction,
): Promise<Response | void> {
  try {
    const { mobile, role } = req.body;
    const roleError = await validateOtpRole(mobile, role, res);
    if (roleError) return roleError;
    const result = await authService.sendOTP(mobile);
    return R.ok(res, {
      message: 'OTP sent successfully',
      resendAfterSeconds: 30,
      ...result,
    });
  } catch (err: unknown) {
    next(err);
  }
}

export async function verifyOTP(
  req: BodyRequest<VerifyOtpBody>,
  res: Response,
  next: NextFunction,
): Promise<Response | void> {
  try {
    const { mobile, otp, deviceInfo, role } = req.body;
    const roleError = await validateOtpRole(mobile, role, res);
    if (roleError) return roleError;
    const result = await authService.verifyOTPAndLogin(
      mobile,
      otp,
      deviceInfo || null,
      req.ip || null,
    );
    return R.ok(res, result);
  } catch (err: unknown) {
    next(err);
  }
}

export async function login(
  req: BodyRequest<LoginBody>,
  res: Response,
  next: NextFunction,
): Promise<Response | void> {
  try {
    const { identifier, password, deviceInfo } = req.body;
    const result = await authService.loginWithPassword(
      identifier,
      password,
      deviceInfo || null,
      req.ip || null,
    );
    return R.ok(res, result);
  } catch (err: unknown) {
    next(err);
  }
}

export async function registerStudent(
  req: BodyRequest<RegisterStudentBody>,
  res: Response,
  next: NextFunction,
): Promise<Response | void> {
  try {
    const result = await authService.registerStudent(
      req.body,
      req.body.deviceInfo || null,
      req.ip || null,
    );
    return R.created(res, result);
  } catch (err: unknown) {
    next(err);
  }
}

export async function getStudentRegistrationOptions(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<Response | void> {
  try {
    const { rows: schools } = await query<RegistrationSchoolRow>(
      `SELECT s.id, s.name, s.name_hi, s.city, s.district, s.state, s.udise_code, s.academic_year,
              COALESCE(
                JSON_AGG(
                  JSON_BUILD_OBJECT(
                    'id', sc.id,
                    'className', sc.class_name,
                    'section', sc.section,
                    'label', sc.class_name || '-' || sc.section,
                    'academicYear', sc.academic_year
                  ) ORDER BY sc.class_name, sc.section
                ) FILTER (WHERE sc.id IS NOT NULL),
                '[]'::json
              ) AS classes
       FROM schools s
       LEFT JOIN school_classes sc ON sc.school_id = s.id
       WHERE s.status = 'ACTIVE'
       GROUP BY s.id
       ORDER BY s.name`,
      [],
    );
    return R.ok(res, {
      schools,
      gradeLevels: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'],
    });
  } catch (err: unknown) {
    next(err);
  }
}

export async function refresh(
  req: BodyRequest<RefreshBody>,
  res: Response,
  next: NextFunction,
): Promise<Response | void> {
  try {
    const result = await authService.refreshAccessToken(req.body.refreshToken);
    return R.ok(res, result);
  } catch (err: unknown) {
    next(err);
  }
}

export async function logout(
  req: BodyRequest<LogoutBody>,
  res: Response,
  next: NextFunction,
): Promise<Response | void> {
  try {
    const refreshToken = req.body.refreshToken;
    const accessToken = req.headers.authorization?.split(' ')[1];
    if (refreshToken) await authService.logout(refreshToken, accessToken);
    return R.ok(res, { message: 'Logged out successfully' });
  } catch (err: unknown) {
    next(err);
  }
}

export async function getSessions(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<Response | void> {
  try {
    const user = req.user;
    if (!user) return R.unauthorized(res);
    return R.ok(res, await sessionService.listActiveSessions(user.userId));
  } catch (err: unknown) {
    next(err);
  }
}

export async function revokeOtherSessions(
  req: BodyRequest<RevokeOtherSessionsBody>,
  res: Response,
  next: NextFunction,
): Promise<Response | void> {
  try {
    const user = req.user;
    if (!user) return R.unauthorized(res);
    const result = await sessionService.revokeOtherSessions(user.userId, req.body.refreshToken);
    return R.ok(res, {
      ...result,
      message: result.revokedCount
        ? `Signed out ${result.revokedCount} other active session${result.revokedCount === 1 ? '' : 's'}`
        : 'No other active sessions were found',
    });
  } catch (err: unknown) {
    next(err);
  }
}

export async function updateProfile(
  req: BodyRequest<UpdateProfileBody>,
  res: Response,
  next: NextFunction,
): Promise<Response | void> {
  try {
    const user = req.user;
    if (!user) return R.unauthorized(res);
    const updated = await authService.updateProfile(user.userId, req.body);
    return R.ok(res, updated);
  } catch (err: unknown) {
    next(err);
  }
}

export async function setPassword(
  req: BodyRequest<SetPasswordBody>,
  res: Response,
  next: NextFunction,
): Promise<Response | void> {
  try {
    const user = req.user;
    if (!user) return R.unauthorized(res);
    const result = await authService.setPassword(
      user.userId,
      req.body.currentPassword || null,
      req.body.newPassword,
    );
    return R.ok(res, result);
  } catch (err: unknown) {
    next(err);
  }
}

export async function forgotPassword(
  req: BodyRequest<ForgotPasswordBody>,
  res: Response,
  next: NextFunction,
): Promise<Response | void> {
  try {
    const result = await authService.sendPasswordResetOTP(req.body.identifier);
    return R.ok(res, result);
  } catch (err: unknown) {
    next(err);
  }
}

export async function resetPassword(
  req: BodyRequest<ResetPasswordBody>,
  res: Response,
  next: NextFunction,
): Promise<Response | void> {
  try {
    const result = await authService.resetPasswordWithOTP(
      req.body.identifier,
      req.body.otp,
      req.body.newPassword,
    );
    return R.ok(res, result);
  } catch (err: unknown) {
    next(err);
  }
}

export async function getMe(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<Response | void> {
  try {
    const authUser = req.user;
    if (!authUser) return R.unauthorized(res);
    const { rows: [user] } = await query<MeRow>(
      `SELECT u.id, u.name, u.username, u.email, u.mobile, u.role, u.status, u.language,
              u.profile_photo, u.last_login_at, u.must_change_password,
              s.student_code, s.grade_level, s.school_link_status,
              s.roll_number, s.academic_year,
              sch.name AS school_name, sc.class_name, sc.section
       FROM users u
       LEFT JOIN students s ON s.user_id = u.id
       LEFT JOIN schools sch ON sch.id = s.school_id
       LEFT JOIN school_classes sc ON sc.id = s.class_id
       WHERE u.id = $1`,
      [authUser.userId],
    );
    if (!user) return R.notFound(res, 'User not found');
    return R.ok(res, user);
  } catch (err: unknown) {
    next(err);
  }
}
