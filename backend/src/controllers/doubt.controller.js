// controllers/doubt.controller.js
const { query } = require('../config/db');
const aiService = require('../services/ai.service');
const { getPagination, paginationMeta } = require('../utils/paginate');
const R = require('../utils/response');

async function getUserSchoolContext(req) {
  if (req.user.role === 'STUDENT') {
    const { rows: [s] } = await query(
      `SELECT s.id AS student_id, s.school_id, s.class_id,
              COALESCE(sc.class_name, s.grade_level) AS class_name,
              sc.section, s.school_link_status
       FROM students s
       LEFT JOIN school_classes sc ON sc.id = s.class_id
       WHERE s.user_id = $1 AND s.status = 'ACTIVE'`,
      [req.user.userId]
    );
    return s || null;
  }
  if (req.user.role === 'SCHOOL_ADMIN') return { school_id: req.user.schoolId || null };
  return { school_id: null };
}

async function list(req, res, next) {
  try {
    const { limit, offset, page } = getPagination(req.query);
    const { subjectCode, status, mine } = req.query;
    const ctx = await getUserSchoolContext(req);
    const conditions = ['1=1'];
    const params = [];
    let i = 1;

    // Approved school Students see their school forum. Independent/pending
    // Students use the platform-wide forum (d.school_id IS NULL).
    if (ctx?.student_id) {
      if (ctx.school_link_status === 'APPROVED' && ctx.school_id) {
        conditions.push(`(d.school_id = $${i++} OR d.school_id IS NULL)`);
        params.push(ctx.school_id);
      } else {
        conditions.push('d.school_id IS NULL');
      }
    } else if (ctx?.school_id) {
      conditions.push(`d.school_id = $${i++}`);
      params.push(ctx.school_id);
    }
    if (subjectCode) { conditions.push(`d.subject_code = $${i++}`); params.push(subjectCode); }
    if (status) { conditions.push(`d.status = $${i++}`); params.push(status); }
    if (mine === 'true' && ctx?.student_id) { conditions.push(`d.student_id = $${i++}`); params.push(ctx.student_id); }

    const where = conditions.join(' AND ');
    const [{ rows }, { rows: [countRow] }] = await Promise.all([
      query(
        `SELECT d.id, d.title, d.body, d.image_url, d.status,
                d.subject_code, d.answer_count, d.upvote_count, d.ai_answered,
                d.created_at, d.updated_at,
                u.name AS student_name,
                COALESCE(sc.class_name, st.grade_level) AS class_name, sc.section,
                sub.name AS subject_name, sub.name_hi AS subject_name_hi,
                ch.title AS chapter_title,
                (d.student_id = $${i}) AS is_mine
         FROM doubts d
         JOIN students st ON st.id = d.student_id
         JOIN users u ON u.id = st.user_id
         LEFT JOIN school_classes sc ON sc.id = st.class_id
         LEFT JOIN subjects sub ON sub.code = d.subject_code
         LEFT JOIN chapters ch ON ch.id = d.chapter_id
         WHERE ${where}
         ORDER BY CASE d.status WHEN 'OPEN' THEN 1 WHEN 'RESOLVED' THEN 2 ELSE 3 END, d.created_at DESC
         LIMIT $${i + 1} OFFSET $${i + 2}`,
        [...params, ctx?.student_id || null, limit, offset]
      ),
      query(`SELECT COUNT(*) FROM doubts d WHERE ${where}`, params),
    ]);
    return R.ok(res, rows, paginationMeta(parseInt(countRow.count, 10), page, limit));
  } catch (err) { next(err); }
}

async function create(req, res, next) {
  try {
    const ctx = await getUserSchoolContext(req);
    if (!ctx?.student_id) return R.notFound(res, 'Student profile not found');

    let subjectCode = req.body.subjectCode || null;
    if (!subjectCode && req.body.subjectId) {
      const { rows: [sub] } = await query('SELECT code FROM subjects WHERE id = $1', [req.body.subjectId]);
      subjectCode = sub?.code || null;
    }
    const { title, body, chapterId, contentItemId, imageUrl } = req.body;
    const forumSchoolId = ctx.school_link_status === 'APPROVED' ? ctx.school_id : null;
    const { rows: [doubt] } = await query(
      `INSERT INTO doubts
         (student_id, school_id, subject_code, chapter_id, content_item_id, title, body, image_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      [ctx.student_id, forumSchoolId, subjectCode, chapterId || null, contentItemId || null, title, body, imageUrl || null]
    );
    return R.created(res, doubt);
  } catch (err) { next(err); }
}

async function get(req, res, next) {
  try {
    const ctx = await getUserSchoolContext(req);
    const { rows: [doubt] } = await query(
      `SELECT d.*, u.name AS student_name,
              COALESCE(sc.class_name, st.grade_level) AS class_name, sc.section,
              sub.name AS subject_name, sub.name_hi AS subject_name_hi,
              ch.title AS chapter_title,
              (d.student_id = $2) AS is_mine
       FROM doubts d
       JOIN students st ON st.id = d.student_id
       JOIN users u ON u.id = st.user_id
       LEFT JOIN school_classes sc ON sc.id = st.class_id
       LEFT JOIN subjects sub ON sub.code = d.subject_code
       LEFT JOIN chapters ch ON ch.id = d.chapter_id
       WHERE d.id = $1`,
      [req.params.doubtId, ctx?.student_id || null]
    );
    if (!doubt) return R.notFound(res, 'Doubt not found');
    if (ctx?.school_id && !ctx?.student_id && doubt.school_id !== ctx.school_id) return R.forbidden(res, 'Doubt is outside your school');
    if (ctx?.student_id && ctx.school_link_status !== 'APPROVED' && doubt.school_id !== null) return R.forbidden(res, 'Doubt is outside your forum');
    if (ctx?.student_id && ctx.school_link_status === 'APPROVED' && doubt.school_id && doubt.school_id !== ctx.school_id) return R.forbidden(res, 'Doubt is outside your school');

    const { rows: answers } = await query(
      `SELECT da.id, da.body, da.image_url, da.is_ai_answer, da.is_accepted,
              da.upvote_count, da.created_at, da.updated_at,
              da.author_id, u.name AS answerer_name, u.role AS answerer_role,
              EXISTS(
                SELECT 1 FROM doubt_answer_upvotes dau
                WHERE dau.answer_id = da.id AND dau.user_id = $2
              ) AS upvoted_by_me
       FROM doubt_answers da
       JOIN users u ON u.id = da.author_id
       WHERE da.doubt_id = $1
       ORDER BY da.is_accepted DESC, da.is_ai_answer DESC, da.upvote_count DESC, da.created_at ASC`,
      [req.params.doubtId, req.user.userId]
    );
    return R.ok(res, { ...doubt, answers });
  } catch (err) { next(err); }
}

async function answer(req, res, next) {
  try {
    const ctx = await getUserSchoolContext(req);
    const { rows: [doubt] } = await query('SELECT id, student_id, school_id, status FROM doubts WHERE id = $1', [req.params.doubtId]);
    if (!doubt) return R.notFound(res, 'Doubt not found');
    if (ctx?.school_id && !ctx?.student_id && doubt.school_id !== ctx.school_id) return R.forbidden(res, 'Doubt is outside your school');
    if (ctx?.student_id && ctx.school_link_status !== 'APPROVED' && doubt.school_id !== null) return R.forbidden(res, 'Doubt is outside your forum');
    if (ctx?.student_id && ctx.school_link_status === 'APPROVED' && doubt.school_id && doubt.school_id !== ctx.school_id) return R.forbidden(res, 'Doubt is outside your school');
    if (doubt.status === 'CLOSED') return R.validationError(res, 'This doubt is closed');

    const { rows: [answer] } = await query(
      `INSERT INTO doubt_answers (doubt_id, author_id, body, image_url)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [req.params.doubtId, req.user.userId, req.body.body, req.body.imageUrl || null]
    );
    return R.created(res, answer);
  } catch (err) { next(err); }
}

async function upvote(req, res, next) {
  try {
    const { answerId } = req.params;
    const { rows: [answer] } = await query(
      `SELECT da.id, da.author_id, d.school_id
       FROM doubt_answers da JOIN doubts d ON d.id = da.doubt_id
       WHERE da.id = $1 AND da.doubt_id = $2`,
      [answerId, req.params.doubtId]
    );
    if (!answer) return R.notFound(res, 'Answer not found');

    const ctx = await getUserSchoolContext(req);
    if (ctx?.school_id && !ctx?.student_id && answer.school_id !== ctx.school_id) return R.forbidden(res, 'Answer is outside your school');
    if (ctx?.student_id && ctx.school_link_status !== 'APPROVED' && answer.school_id !== null) return R.forbidden(res, 'Answer is outside your forum');
    if (ctx?.student_id && ctx.school_link_status === 'APPROVED' && answer.school_id && answer.school_id !== ctx.school_id) return R.forbidden(res, 'Answer is outside your school');

    const { rows: [existing] } = await query(
      'SELECT id FROM doubt_answer_upvotes WHERE answer_id = $1 AND user_id = $2',
      [answerId, req.user.userId]
    );
    if (existing) {
      await query('DELETE FROM doubt_answer_upvotes WHERE id = $1', [existing.id]);
      const { rows: [updated] } = await query('SELECT upvote_count FROM doubt_answers WHERE id = $1', [answerId]);
      return R.ok(res, { upvoted: false, upvoteCount: updated?.upvote_count || 0 });
    }

    await query('INSERT INTO doubt_answer_upvotes (answer_id, user_id) VALUES ($1, $2)', [answerId, req.user.userId]);
    const { rows: [updated] } = await query('SELECT upvote_count FROM doubt_answers WHERE id = $1', [answerId]);
    return R.ok(res, { upvoted: true, upvoteCount: updated?.upvote_count || 0 });
  } catch (err) { next(err); }
}

async function resolve(req, res, next) {
  try {
    const { bestAnswerId } = req.body;
    const { rows: [doubt] } = await query(
      `SELECT d.id, d.student_id, d.school_id, st.user_id AS owner_user_id
       FROM doubts d JOIN students st ON st.id = d.student_id WHERE d.id = $1`,
      [req.params.doubtId]
    );
    if (!doubt) return R.notFound(res, 'Doubt not found');
    if (doubt.owner_user_id !== req.user.userId && req.user.role !== 'SCHOOL_ADMIN' && req.user.role !== 'SUPER_ADMIN') {
      return R.forbidden(res, 'Only the doubt owner or school staff can resolve this');
    }

    if (bestAnswerId) {
      const { rows: [answer] } = await query('SELECT id FROM doubt_answers WHERE id = $1 AND doubt_id = $2', [bestAnswerId, req.params.doubtId]);
      if (!answer) return R.validationError(res, 'Selected answer does not belong to this doubt');
      await query(
        `UPDATE doubt_answers SET is_accepted = (id = $1), updated_at = NOW() WHERE doubt_id = $2`,
        [bestAnswerId, req.params.doubtId]
      );
    }

    await query(
      `UPDATE doubts SET status = 'RESOLVED', resolved_by = $1, resolved_at = NOW(), updated_at = NOW() WHERE id = $2`,
      [req.user.userId, req.params.doubtId]
    );
    return R.ok(res, { resolved: true, bestAnswerId: bestAnswerId || null });
  } catch (err) { next(err); }
}

async function aiAnswer(req, res, next) {
  try {
    const ctx = await getUserSchoolContext(req);
    if (!ctx?.student_id) return R.notFound(res, 'Student profile not found');
    const { rows: [doubt] } = await query('SELECT student_id FROM doubts WHERE id = $1', [req.params.doubtId]);
    if (!doubt) return R.notFound(res, 'Doubt not found');
    if (doubt.student_id !== ctx.student_id) return R.forbidden(res, 'AI answer can be requested by the doubt owner');
    const result = await aiService.answerDoubt(req.params.doubtId, ctx.student_id);
    return R.ok(res, result);
  } catch (err) { next(err); }
}

module.exports = { list, create, get, answer, upvote, resolve, aiAnswer };
