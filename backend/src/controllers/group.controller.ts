import type { NextFunction, Request, Response } from 'express';
import * as groupService from '../services/group.service';
import * as R from '../utils/response';

interface CreateGroupBody {
  name: string;
  description?: string | null;
  kind: 'STUDENT' | 'PARENT' | 'TEACHER' | 'MIXED';
  scope: 'PRIVATE' | 'SCHOOL' | 'CLASS';
  schoolId?: string | null;
  classId?: string | null;
  maxMembers?: number;
}

interface JoinBody { message?: string | null; }
interface DecisionBody { decision: 'APPROVED' | 'REJECTED'; }
interface InvitationBody { userId: string; message?: string | null; }
interface InvitationResponseBody { decision: 'ACCEPTED' | 'DECLINED'; }
interface MemberRoleBody { role: 'MODERATOR' | 'MEMBER'; }
interface PostBody { body: string; attachmentUrl?: string | null; isAnnouncement?: boolean; }
interface CommentBody { body: string; }
interface PinBody { pinned: boolean; }
interface ReportBody {
  targetType: 'GROUP' | 'POST' | 'COMMENT' | 'MEMBER';
  targetId: string;
  reason: string;
  details?: string | null;
}
interface AdminDecisionBody { decision: 'ACTIVE' | 'REJECTED'; note?: string | null; }
interface AdminStatusBody { status: 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED'; note?: string | null; }
interface AdminReportBody { status: 'REVIEWING' | 'RESOLVED' | 'DISMISSED'; resolution?: string | null; }

function auth(req: Request, res: Response) {
  if (!req.user) { R.unauthorized(res); return null; }
  return req.user;
}

function queryString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function queryInt(value: unknown, fallback: number): number {
  const parsed = Number.parseInt(typeof value === 'string' ? value : '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function createGroup(
  req: Request<Record<string, string>, unknown, CreateGroupBody>,
  res: Response,
  next: NextFunction,
): Promise<Response | void> {
  try {
    const user = auth(req, res); if (!user) return;
    return R.created(res, await groupService.createGroup(user.userId, user.role, req.body));
  } catch (error: unknown) { next(error); }
}

export async function myGroups(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const user = auth(req, res); if (!user) return;
    return R.ok(res, await groupService.getMyGroups(user.userId));
  } catch (error: unknown) { next(error); }
}

export async function discover(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const user = auth(req, res); if (!user) return;
    return R.ok(res, await groupService.discoverGroups(user.userId, user.role, queryString(req.query.search)));
  } catch (error: unknown) { next(error); }
}

export async function detail(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const user = auth(req, res); if (!user) return;
    return R.ok(res, await groupService.getGroupDetail(user.userId, user.role, req.params.groupId));
  } catch (error: unknown) { next(error); }
}

export async function requestJoin(
  req: Request<Record<string, string>, unknown, JoinBody>,
  res: Response,
  next: NextFunction,
): Promise<Response | void> {
  try {
    const user = auth(req, res); if (!user) return;
    return R.created(res, await groupService.requestJoin(user.userId, user.role, req.params.groupId, req.body.message));
  } catch (error: unknown) { next(error); }
}

export async function joinRequests(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const user = auth(req, res); if (!user) return;
    return R.ok(res, await groupService.listJoinRequests(req.params.groupId, user.userId));
  } catch (error: unknown) { next(error); }
}

export async function decideJoin(
  req: Request<Record<string, string>, unknown, DecisionBody>,
  res: Response,
  next: NextFunction,
): Promise<Response | void> {
  try {
    const user = auth(req, res); if (!user) return;
    return R.ok(res, await groupService.decideJoinRequest(
      req.params.groupId,
      req.params.requestId,
      user.userId,
      user.role,
      req.body.decision,
    ));
  } catch (error: unknown) { next(error); }
}

export async function eligibleUsers(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const user = auth(req, res); if (!user) return;
    return R.ok(res, await groupService.searchEligibleUsers(req.params.groupId, user.userId, queryString(req.query.search)));
  } catch (error: unknown) { next(error); }
}

export async function invite(
  req: Request<Record<string, string>, unknown, InvitationBody>,
  res: Response,
  next: NextFunction,
): Promise<Response | void> {
  try {
    const user = auth(req, res); if (!user) return;
    return R.created(res, await groupService.proposeInvitation(req.params.groupId, user.userId, user.role, req.body));
  } catch (error: unknown) { next(error); }
}

export async function nominations(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const user = auth(req, res); if (!user) return;
    return R.ok(res, await groupService.listPendingNominations(req.params.groupId, user.userId));
  } catch (error: unknown) { next(error); }
}

export async function decideNomination(
  req: Request<Record<string, string>, unknown, DecisionBody>,
  res: Response,
  next: NextFunction,
): Promise<Response | void> {
  try {
    const user = auth(req, res); if (!user) return;
    return R.ok(res, await groupService.decideNomination(
      req.params.groupId,
      req.params.invitationId,
      user.userId,
      user.role,
      req.body.decision,
    ));
  } catch (error: unknown) { next(error); }
}

export async function myInvitations(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const user = auth(req, res); if (!user) return;
    return R.ok(res, await groupService.getMyInvitations(user.userId));
  } catch (error: unknown) { next(error); }
}

export async function respondInvitation(
  req: Request<Record<string, string>, unknown, InvitationResponseBody>,
  res: Response,
  next: NextFunction,
): Promise<Response | void> {
  try {
    const user = auth(req, res); if (!user) return;
    return R.ok(res, await groupService.respondToInvitation(req.params.invitationId, user.userId, user.role, req.body.decision));
  } catch (error: unknown) { next(error); }
}

export async function members(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const user = auth(req, res); if (!user) return;
    return R.ok(res, await groupService.listMembers(req.params.groupId, user.userId));
  } catch (error: unknown) { next(error); }
}

export async function changeMemberRole(
  req: Request<Record<string, string>, unknown, MemberRoleBody>,
  res: Response,
  next: NextFunction,
): Promise<Response | void> {
  try {
    const user = auth(req, res); if (!user) return;
    return R.ok(res, await groupService.updateMemberRole(
      req.params.groupId,
      req.params.userId,
      user.userId,
      user.role,
      req.body.role,
    ));
  } catch (error: unknown) { next(error); }
}

export async function removeMember(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const user = auth(req, res); if (!user) return;
    return R.ok(res, await groupService.removeMember(req.params.groupId, req.params.userId, user.userId, user.role));
  } catch (error: unknown) { next(error); }
}

export async function leave(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const user = auth(req, res); if (!user) return;
    return R.ok(res, await groupService.leaveGroup(req.params.groupId, user.userId, user.role));
  } catch (error: unknown) { next(error); }
}

export async function posts(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const user = auth(req, res); if (!user) return;
    return R.ok(res, await groupService.listPosts(
      req.params.groupId,
      user.userId,
      queryInt(req.query.page, 1),
      queryInt(req.query.limit, 20),
    ));
  } catch (error: unknown) { next(error); }
}

export async function createPost(
  req: Request<Record<string, string>, unknown, PostBody>,
  res: Response,
  next: NextFunction,
): Promise<Response | void> {
  try {
    const user = auth(req, res); if (!user) return;
    return R.created(res, await groupService.createPost(req.params.groupId, user.userId, req.body));
  } catch (error: unknown) { next(error); }
}

export async function addComment(
  req: Request<Record<string, string>, unknown, CommentBody>,
  res: Response,
  next: NextFunction,
): Promise<Response | void> {
  try {
    const user = auth(req, res); if (!user) return;
    return R.created(res, await groupService.addComment(req.params.groupId, req.params.postId, user.userId, req.body.body));
  } catch (error: unknown) { next(error); }
}

export async function pinPost(
  req: Request<Record<string, string>, unknown, PinBody>,
  res: Response,
  next: NextFunction,
): Promise<Response | void> {
  try {
    const user = auth(req, res); if (!user) return;
    return R.ok(res, await groupService.togglePin(req.params.groupId, req.params.postId, user.userId, req.body.pinned));
  } catch (error: unknown) { next(error); }
}

export async function deletePost(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const user = auth(req, res); if (!user) return;
    return R.ok(res, await groupService.removePost(req.params.groupId, req.params.postId, user.userId));
  } catch (error: unknown) { next(error); }
}

export async function report(
  req: Request<Record<string, string>, unknown, ReportBody>,
  res: Response,
  next: NextFunction,
): Promise<Response | void> {
  try {
    const user = auth(req, res); if (!user) return;
    return R.created(res, await groupService.reportGroupContent(req.params.groupId, user.userId, req.body));
  } catch (error: unknown) { next(error); }
}

export async function adminGroups(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const user = auth(req, res); if (!user) return;
    return R.ok(res, await groupService.adminListGroups(queryString(req.query.status) || undefined, queryString(req.query.search)));
  } catch (error: unknown) { next(error); }
}

export async function adminDecide(
  req: Request<Record<string, string>, unknown, AdminDecisionBody>,
  res: Response,
  next: NextFunction,
): Promise<Response | void> {
  try {
    const user = auth(req, res); if (!user) return;
    return R.ok(res, await groupService.adminDecideGroup(req.params.groupId, user.userId, req.body.decision, req.body.note));
  } catch (error: unknown) { next(error); }
}

export async function adminStatus(
  req: Request<Record<string, string>, unknown, AdminStatusBody>,
  res: Response,
  next: NextFunction,
): Promise<Response | void> {
  try {
    const user = auth(req, res); if (!user) return;
    return R.ok(res, await groupService.adminUpdateGroupStatus(req.params.groupId, user.userId, req.body.status, req.body.note));
  } catch (error: unknown) { next(error); }
}

export async function adminReports(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const user = auth(req, res); if (!user) return;
    return R.ok(res, await groupService.adminListReports(queryString(req.query.status) || undefined));
  } catch (error: unknown) { next(error); }
}

export async function adminResolveReport(
  req: Request<Record<string, string>, unknown, AdminReportBody>,
  res: Response,
  next: NextFunction,
): Promise<Response | void> {
  try {
    const user = auth(req, res); if (!user) return;
    return R.ok(res, await groupService.adminResolveReport(req.params.reportId, user.userId, req.body.status, req.body.resolution));
  } catch (error: unknown) { next(error); }
}
