import type { NextFunction, Request, Response } from 'express';
import type { QueryResultRow } from 'pg';
import type { UUID } from '@vidyasetu/contracts';
import { query } from '../config/db';
import * as aiService from '../services/ai.service';
import { getPagination, paginationMeta } from '../utils/paginate';
import * as R from '../utils/response';

interface UserSchoolContext {
  student_id?: UUID;
  school_id: UUID | null;
  class_id?: UUID | null;
  class_name?: string | null;
  section?: string | null;
  school_link_status?: string;
}
interface StudentContextRow extends QueryResultRow {
  student_id: UUID;
  school_id: UUID | null;
  class_id: UUID | null;
  class_name: string;
  section: string | null;
  school_link_status: string;
}
interface TeacherSchoolRow extends QueryResultRow { school_id: UUID; }
interface CountRow extends QueryResultRow { count: string; }
interface SubjectCodeRow extends QueryResultRow { code: string; }
interface DoubtAccessRow extends QueryResultRow {
  id: UUID;
  student_id: UUID;
  school_id: UUID | null;
  status?: string;
  owner_user_id?: UUID;
  [key: string]: unknown;
}
interface AnswerAccessRow extends QueryResultRow {
  id: UUID;
  author_id: UUID;
  school_id: UUID | null;
}
interface IdRow extends QueryResultRow { id: UUID; }
interface UpvoteRow extends QueryResultRow { upvote_count: number | string; }
interface CreateDoubtBody {
  subjectCode?: string | null;
  subjectId?: UUID | null;
  title: string;
  body: string;
  chapterId?: UUID | null;
  contentItemId?: UUID | null;
  imageUrl?: string | null;
}
interface AnswerBody { body: string; imageUrl?: string | null; }
interface ResolveBody { bestAnswerId?: UUID | null; }

function queryString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function authenticated(req: Request, res: Response) {
  if (!req.user) { R.unauthorized(res); return null; }
  return req.user;
}

async function getUserSchoolContext(req: Request): Promise<UserSchoolContext> {
  const user = req.user;
  if (!user) return { school_id: null };
  if (user.role === 'STUDENT') {
    const { rows: [student] } = await query<StudentContextRow>(
      `SELECT s.id AS student_id, s.school_id, s.class_id,
              COALESCE(sc.class_name, s.grade_level) AS class_name,
              sc.section, s.school_link_status
       FROM students s
       LEFT JOIN school_classes sc ON sc.id=s.class_id
       WHERE s.user_id=$1 AND s.status='ACTIVE'`,
      [user.userId],
    );
    return student || { school_id: null };
  }
  if (user.role === 'TEACHER') {
    const { rows: [teacher] } = await query<TeacherSchoolRow>(
      `SELECT school_id FROM teachers WHERE user_id=$1 AND status='ACTIVE' LIMIT 1`,
      [user.userId],
    );
    return { school_id: teacher?.school_id || null };
  }
  if (user.role === 'SCHOOL_ADMIN') return { school_id: user.schoolId || null };
  return { school_id: null };
}

function forumAllowed(ctx: UserSchoolContext, schoolId: UUID | null): boolean {
  if (ctx.school_id && !ctx.student_id) return schoolId === ctx.school_id;
  if (ctx.student_id && ctx.school_link_status !== 'APPROVED') return schoolId === null;
  if (ctx.student_id && ctx.school_link_status === 'APPROVED' && schoolId) return schoolId === ctx.school_id;
  return true;
}

export async function list(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const { limit, offset, page } = getPagination(req.query);
    const subjectCode = queryString(req.query.subjectCode);
    const status = queryString(req.query.status);
    const mine = queryString(req.query.mine);
    const ctx = await getUserSchoolContext(req);
    const conditions = ['1=1'];
    const params: unknown[] = [];
    let index = 1;

    if (ctx.student_id) {
      if (ctx.school_link_status === 'APPROVED' && ctx.school_id) {
        conditions.push(`(d.school_id=$${index++} OR d.school_id IS NULL)`);
        params.push(ctx.school_id);
      } else conditions.push('d.school_id IS NULL');
    } else if (ctx.school_id) {
      conditions.push(`d.school_id=$${index++}`);
      params.push(ctx.school_id);
    }
    if (subjectCode) { conditions.push(`d.subject_code=$${index++}`); params.push(subjectCode); }
    if (status) { conditions.push(`d.status=$${index++}`); params.push(status); }
    if (mine === 'true' && ctx.student_id) { conditions.push(`d.student_id=$${index++}`); params.push(ctx.student_id); }

    const where = conditions.join(' AND ');
    const [{ rows }, { rows: [countRow] }] = await Promise.all([
      query(
        `SELECT d.id,d.title,d.body,d.image_url,d.status,
                d.subject_code,d.answer_count,d.upvote_count,d.ai_answered,
                d.origin,d.learning_concept_id,
                lc.code AS concept_code,lc.name AS concept_name,lc.name_hi AS concept_name_hi,
                d.created_at,d.updated_at,
                u.name AS student_name,
                COALESCE(sc.class_name,st.grade_level) AS class_name,sc.section,
                sub.name AS subject_name,sub.name_hi AS subject_name_hi,
                ch.title AS chapter_title,
                (d.student_id=$${index}) AS is_mine
         FROM doubts d
         JOIN students st ON st.id=d.student_id
         JOIN users u ON u.id=st.user_id
         LEFT JOIN school_classes sc ON sc.id=st.class_id
         LEFT JOIN subjects sub ON sub.code=d.subject_code
         LEFT JOIN chapters ch ON ch.id=d.chapter_id
         LEFT JOIN learning_concepts lc ON lc.id=d.learning_concept_id
         WHERE ${where}
         ORDER BY CASE d.status WHEN 'OPEN' THEN 1 WHEN 'RESOLVED' THEN 2 ELSE 3 END,d.created_at DESC
         LIMIT $${index + 1} OFFSET $${index + 2}`,
        [...params, ctx.student_id || null, limit, offset],
      ),
      query<CountRow>(`SELECT COUNT(*) FROM doubts d WHERE ${where}`, params),
    ]);
    return R.ok(res, rows, paginationMeta(Number.parseInt(countRow?.count || '0', 10), page, limit));
  } catch (err: unknown) { next(err); }
}

export async function create(
  req: Request<Record<string, string>, unknown, CreateDoubtBody>,
  res: Response,
  next: NextFunction,
): Promise<Response | void> {
  try {
    const ctx = await getUserSchoolContext(req);
    if (!ctx.student_id) return R.notFound(res, 'Student profile not found');
    let subjectCode = req.body.subjectCode || null;
    if (!subjectCode && req.body.subjectId) {
      const { rows: [subject] } = await query<SubjectCodeRow>('SELECT code FROM subjects WHERE id=$1', [req.body.subjectId]);
      subjectCode = subject?.code || null;
    }
    const forumSchoolId = ctx.school_link_status === 'APPROVED' ? ctx.school_id : null;
    const { rows: [doubt] } = await query(
      `INSERT INTO doubts
         (student_id,school_id,subject_code,chapter_id,content_item_id,title,body,image_url,origin)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'FORUM')
       RETURNING *`,
      [ctx.student_id, forumSchoolId, subjectCode, req.body.chapterId || null,
       req.body.contentItemId || null, req.body.title, req.body.body, req.body.imageUrl || null],
    );
    return R.created(res, doubt);
  } catch (err: unknown) { next(err); }
}

export async function get(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const user = authenticated(req, res); if (!user) return;
    const ctx = await getUserSchoolContext(req);
    const { rows: [doubt] } = await query<DoubtAccessRow>(
      `SELECT d.*,u.name AS student_name,
              COALESCE(sc.class_name,st.grade_level) AS class_name,sc.section,
              sub.name AS subject_name,sub.name_hi AS subject_name_hi,
              ch.title AS chapter_title,
              lc.code AS concept_code,lc.name AS concept_name,lc.name_hi AS concept_name_hi,
              (d.student_id=$2) AS is_mine
       FROM doubts d
       JOIN students st ON st.id=d.student_id
       JOIN users u ON u.id=st.user_id
       LEFT JOIN school_classes sc ON sc.id=st.class_id
       LEFT JOIN subjects sub ON sub.code=d.subject_code
       LEFT JOIN chapters ch ON ch.id=d.chapter_id
       LEFT JOIN learning_concepts lc ON lc.id=d.learning_concept_id
       WHERE d.id=$1`,
      [req.params.doubtId, ctx.student_id || null],
    );
    if (!doubt) return R.notFound(res, 'Doubt not found');
    if (!forumAllowed(ctx, doubt.school_id)) return R.forbidden(res, 'Doubt is outside your school');
    const { rows: answers } = await query(
      `SELECT da.id,da.body,da.image_url,da.is_ai_answer,da.is_accepted,
              da.ai_grounded,da.ai_concept_id,da.ai_sources,da.ai_provider,
              alc.code AS ai_concept_code,alc.name AS ai_concept_name,
              da.upvote_count,da.created_at,da.updated_at,
              da.author_id,u.name AS answerer_name,u.role AS answerer_role,
              EXISTS(SELECT 1 FROM doubt_answer_upvotes dau WHERE dau.answer_id=da.id AND dau.user_id=$2) AS upvoted_by_me
       FROM doubt_answers da
       JOIN users u ON u.id=da.author_id
       LEFT JOIN learning_concepts alc ON alc.id=da.ai_concept_id
       WHERE da.doubt_id=$1
       ORDER BY da.is_accepted DESC,da.is_ai_answer DESC,da.upvote_count DESC,da.created_at ASC`,
      [req.params.doubtId, user.userId],
    );
    return R.ok(res, { ...doubt, answers });
  } catch (err: unknown) { next(err); }
}

export async function answer(
  req: Request<Record<string, string>, unknown, AnswerBody>,
  res: Response,
  next: NextFunction,
): Promise<Response | void> {
  try {
    const user = authenticated(req, res); if (!user) return;
    const ctx = await getUserSchoolContext(req);
    const { rows: [doubt] } = await query<DoubtAccessRow>(
      'SELECT id,student_id,school_id,status FROM doubts WHERE id=$1', [req.params.doubtId],
    );
    if (!doubt) return R.notFound(res, 'Doubt not found');
    if (!forumAllowed(ctx, doubt.school_id)) return R.forbidden(res, 'Doubt is outside your school');
    if (doubt.status === 'CLOSED') return R.validationError(res, 'This doubt is closed');
    const { rows: [created] } = await query(
      `INSERT INTO doubt_answers (doubt_id,author_id,body,image_url)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [req.params.doubtId, user.userId, req.body.body, req.body.imageUrl || null],
    );
    return R.created(res, created);
  } catch (err: unknown) { next(err); }
}

export async function upvote(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const user = authenticated(req, res); if (!user) return;
    const answerId = req.params.answerId;
    const { rows: [answer] } = await query<AnswerAccessRow>(
      `SELECT da.id,da.author_id,d.school_id
       FROM doubt_answers da JOIN doubts d ON d.id=da.doubt_id
       WHERE da.id=$1 AND da.doubt_id=$2`,
      [answerId, req.params.doubtId],
    );
    if (!answer) return R.notFound(res, 'Answer not found');
    const ctx = await getUserSchoolContext(req);
    if (!forumAllowed(ctx, answer.school_id)) return R.forbidden(res, 'Answer is outside your school');

    const { rows: [existing] } = await query<IdRow>(
      'SELECT id FROM doubt_answer_upvotes WHERE answer_id=$1 AND user_id=$2', [answerId, user.userId],
    );
    if (existing) {
      await query('DELETE FROM doubt_answer_upvotes WHERE id=$1', [existing.id]);
      const { rows: [updated] } = await query<UpvoteRow>('SELECT upvote_count FROM doubt_answers WHERE id=$1', [answerId]);
      return R.ok(res, { upvoted: false, upvoteCount: updated?.upvote_count || 0 });
    }
    await query('INSERT INTO doubt_answer_upvotes (answer_id,user_id) VALUES ($1,$2)', [answerId, user.userId]);
    const { rows: [updated] } = await query<UpvoteRow>('SELECT upvote_count FROM doubt_answers WHERE id=$1', [answerId]);
    return R.ok(res, { upvoted: true, upvoteCount: updated?.upvote_count || 0 });
  } catch (err: unknown) { next(err); }
}

export async function resolve(
  req: Request<Record<string, string>, unknown, ResolveBody>,
  res: Response,
  next: NextFunction,
): Promise<Response | void> {
  try {
    const user = authenticated(req, res); if (!user) return;
    const { rows: [doubt] } = await query<DoubtAccessRow>(
      `SELECT d.id,d.student_id,d.school_id,st.user_id AS owner_user_id
       FROM doubts d JOIN students st ON st.id=d.student_id WHERE d.id=$1`,
      [req.params.doubtId],
    );
    if (!doubt) return R.notFound(res, 'Doubt not found');
    if (doubt.owner_user_id !== user.userId && user.role !== 'SCHOOL_ADMIN' && user.role !== 'SUPER_ADMIN') {
      return R.forbidden(res, 'Only the doubt owner or school staff can resolve this');
    }
    if (req.body.bestAnswerId) {
      const { rows: [answer] } = await query<IdRow>(
        'SELECT id FROM doubt_answers WHERE id=$1 AND doubt_id=$2',
        [req.body.bestAnswerId, req.params.doubtId],
      );
      if (!answer) return R.validationError(res, 'Selected answer does not belong to this doubt');
      await query(
        'UPDATE doubt_answers SET is_accepted=(id=$1),updated_at=NOW() WHERE doubt_id=$2',
        [req.body.bestAnswerId, req.params.doubtId],
      );
    }
    await query(
      "UPDATE doubts SET status='RESOLVED',resolved_by=$1,resolved_at=NOW(),updated_at=NOW() WHERE id=$2",
      [user.userId, req.params.doubtId],
    );
    return R.ok(res, { resolved: true, bestAnswerId: req.body.bestAnswerId || null });
  } catch (err: unknown) { next(err); }
}

export async function aiAnswer(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const ctx = await getUserSchoolContext(req);
    if (!ctx.student_id) return R.notFound(res, 'Student profile not found');
    const { rows: [doubt] } = await query<DoubtAccessRow>('SELECT student_id FROM doubts WHERE id=$1', [req.params.doubtId]);
    if (!doubt) return R.notFound(res, 'Doubt not found');
    if (doubt.student_id !== ctx.student_id) return R.forbidden(res, 'AI answer can be requested by the doubt owner');
    return R.ok(res, await aiService.answerDoubt(req.params.doubtId, ctx.student_id));
  } catch (err: unknown) { next(err); }
}
