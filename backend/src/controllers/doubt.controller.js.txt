// controllers/doubt.controller.js
const { query, transaction } = require('../config/db');
const aiService = require('../services/ai.service');
const studentService = require('../services/student.service');
const { getPagination, paginationMeta } = require('../utils/paginate');
const R = require('../utils/response');

async function list(req, res, next) {
  try {
    const { limit, offset, page } = getPagination(req.query);
    const { subjectId, status, classId } = req.query;

    // Determine school scope from user
    let schoolId = null;
    if (req.user.role === 'STUDENT') {
      const { rows: [s] } = await query(
        `SELECT school_id FROM students WHERE user_id = $1`, [req.user.userId]
      );
      schoolId = s?.school_id;
    } else if (req.user.role === 'SCHOOL_ADMIN') {
      schoolId = req.user.schoolId;
    }

    const conditions = ['1=1'];
    const params = [];
    let i = 1;

    if (schoolId)  { conditions.push(`d.school_id = $${i++}`);  params.push(schoolId); }
    if (subjectId) { conditions.push(`d.subject_id = $${i++}`); params.push(subjectId); }
    if (status)    { conditions.push(`d.status = $${i++}`);     params.push(status); }

    const where = conditions.join(' AND ');

    const [{ rows }, { rows: [countRow] }] = await Promise.all([
      query(`
        SELECT d.id, d.title, d.status, d.answer_count, d.view_count, d.created_at,
               u.name AS student_name,
               sub.name AS subject_name,
               ch.title AS chapter_title
        FROM doubts d
        JOIN students st ON st.id = d.student_id
        JOIN users u ON u.id = st.user_id
        LEFT JOIN subjects sub ON sub.id = d.subject_id
        LEFT JOIN chapters ch ON ch.id = d.chapter_id
        WHERE ${where}
        ORDER BY d.created_at DESC
        LIMIT $${i} OFFSET $${i + 1}
      `, [...params, limit, offset]),
      query(`SELECT COUNT(*) FROM doubts d WHERE ${where}`, params),
    ]);

    return R.ok(res, rows, paginationMeta(parseInt(countRow.count), page, limit));
  } catch (err) { next(err); }
}

async function create(req, res, next) {
  try {
    const { rows: [student] } = await query(
      `SELECT id, school_id FROM students WHERE user_id = $1`, [req.user.userId]
    );
    if (!student) return R.notFound(res, 'Student profile not found');

    const { title, body, subjectId, chapterId, imageUrl } = req.body;

    const { rows: [s] } = await query(
      `SELECT class_name FROM school_classes sc
       JOIN students st ON st.class_id = sc.id WHERE st.id = $1`, [student.id]
    );

    const { rows: [doubt] } = await query(
      `INSERT INTO doubts (student_id, school_id, subject_id, chapter_id, class_name, title, body, image_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [student.id, student.school_id, subjectId || null, chapterId || null,
       s?.class_name || null, title, body, imageUrl || null]
    );

    // Award XP for posting a doubt
    await studentService.awardXP(student.id, 'DOUBT_ANSWERED', 5, doubt.id, 'DOUBT', 'Posted a doubt');

    return R.created(res, doubt);
  } catch (err) { next(err); }
}

async function get(req, res, next) {
  try {
    // Increment view count
    await query(`UPDATE doubts SET view_count = view_count + 1 WHERE id = $1`, [req.params.doubtId]);

    const { rows: [doubt] } = await query(
      `SELECT d.*, u.name AS student_name, sub.name AS subject_name, ch.title AS chapter_title
       FROM doubts d
       JOIN students st ON st.id = d.student_id
       JOIN users u ON u.id = st.user_id
       LEFT JOIN subjects sub ON sub.id = d.subject_id
       LEFT JOIN chapters ch ON ch.id = d.chapter_id
       WHERE d.id = $1`,
      [req.params.doubtId]
    );
    if (!doubt) return R.notFound(res, 'Doubt not found');

    const { rows: answers } = await query(
      `SELECT da.*, u.name AS answerer_name, da.is_ai_answer,
              (SELECT COUNT(*) FROM doubt_answer_upvotes WHERE answer_id = da.id) AS upvote_count,
              EXISTS(
                SELECT 1 FROM doubt_answer_upvotes
                WHERE answer_id = da.id AND user_id = $2
              ) AS upvoted_by_me
       FROM doubt_answers da
       JOIN users u ON u.id = da.answered_by
       WHERE da.doubt_id = $1
       ORDER BY da.is_ai_answer DESC, da.upvotes DESC, da.created_at ASC`,
      [req.params.doubtId, req.user.userId]
    );

    return R.ok(res, { ...doubt, answers });
  } catch (err) { next(err); }
}

async function answer(req, res, next) {
  try {
    const { body, imageUrl } = req.body;

    // Verify doubt exists
    const { rows: [doubt] } = await query(
      `SELECT id, student_id FROM doubts WHERE id = $1`, [req.params.doubtId]
    );
    if (!doubt) return R.notFound(res, 'Doubt not found');

    const { rows: [ans] } = await query(
      `INSERT INTO doubt_answers (doubt_id, answered_by, body, image_url)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [req.params.doubtId, req.user.userId, body, imageUrl || null]
    );

    // Award XP to answerer if they are a student
    if (req.user.role === 'STUDENT') {
      const { rows: [s] } = await query(`SELECT id FROM students WHERE user_id = $1`, [req.user.userId]);
      if (s) {
        await studentService.awardXP(s.id, 'DOUBT_ANSWERED', 15, doubt.id, 'DOUBT', 'Answered a peer doubt');
        await studentService.awardBadgeIfNotEarned(s.id, 'DOUBT_HELPER');
      }
    }

    // Update doubt status to ANSWERED if still OPEN
    await query(
      `UPDATE doubts SET status = 'ANSWERED', updated_at = NOW()
       WHERE id = $1 AND status = 'OPEN'`,
      [req.params.doubtId]
    );

    return R.created(res, ans);
  } catch (err) { next(err); }
}

async function upvote(req, res, next) {
  try {
    const { answerId } = req.params;

    // Toggle upvote
    const { rows: [existing] } = await query(
      `SELECT 1 FROM doubt_answer_upvotes WHERE answer_id = $1 AND user_id = $2`,
      [answerId, req.user.userId]
    );

    if (existing) {
      // Remove upvote
      await query(
        `DELETE FROM doubt_answer_upvotes WHERE answer_id = $1 AND user_id = $2`,
        [answerId, req.user.userId]
      );
      await query(`UPDATE doubt_answers SET upvotes = upvotes - 1 WHERE id = $1`, [answerId]);
      return R.ok(res, { upvoted: false });
    } else {
      // Add upvote
      await query(
        `INSERT INTO doubt_answer_upvotes (answer_id, user_id) VALUES ($1, $2)`,
        [answerId, req.user.userId]
      );
      await query(`UPDATE doubt_answers SET upvotes = upvotes + 1 WHERE id = $1`, [answerId]);
      return R.ok(res, { upvoted: true });
    }
  } catch (err) { next(err); }
}

async function resolve(req, res, next) {
  try {
    const { bestAnswerId } = req.body;

    const { rows: [doubt] } = await query(
      `SELECT d.*, st.user_id FROM doubts d
       JOIN students st ON st.id = d.student_id
       WHERE d.id = $1`,
      [req.params.doubtId]
    );

    if (!doubt) return R.notFound(res, 'Doubt not found');

    // Only the doubt owner or school admin can resolve
    if (doubt.user_id !== req.user.userId && req.user.role !== 'SCHOOL_ADMIN') {
      return R.forbidden(res, 'Only the doubt owner can resolve this');
    }

    await query(
      `UPDATE doubts SET status = 'RESOLVED', best_answer_id = $1, updated_at = NOW() WHERE id = $2`,
      [bestAnswerId || null, req.params.doubtId]
    );

    return R.ok(res, { resolved: true });
  } catch (err) { next(err); }
}

async function aiAnswer(req, res, next) {
  try {
    const { rows: [student] } = await query(
      `SELECT id FROM students WHERE user_id = $1`, [req.user.userId]
    );
    if (!student) return R.notFound(res, 'Student not found');

    const result = await aiService.answerDoubt(req.params.doubtId, student.id);
    return R.ok(res, result);
  } catch (err) { next(err); }
}

module.exports = { list, create, get, answer, upvote, resolve, aiAnswer };
