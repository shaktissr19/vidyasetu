// controllers/competition.controller.js
const competitionService = require('../services/competition.service');
const studentExamService = require('../services/studentExam.service');
const { query } = require('../config/db');
const R = require('../utils/response');

async function getStudent(req) {
  const { rows: [student] } = await query(
    `SELECT s.id, s.school_id, s.school_link_status,
            COALESCE(sc.class_name, s.grade_level) AS class_name
     FROM students s
     LEFT JOIN school_classes sc ON sc.id = s.class_id
     WHERE s.user_id = $1 AND s.status = 'ACTIVE'`,
    [req.user.userId]
  );
  return student || null;
}

async function list(req, res, next) {
  try {
    const { rows } = await query(
      `SELECT id, title, title_hi, description, type, status, class_names, subject_codes,
              total_questions, duration_mins, marks_per_question, negative_marks,
              registration_start, registration_end, start_time, end_time,
              results_at, prize_pool, banner_url
       FROM exams
       WHERE status IN ('REGISTRATION_OPEN','REGISTRATION_CLOSED','LIVE','SCORING','COMPLETED')
         AND type IN ('OLYMPIAD','MOCK','PRACTICE')
       ORDER BY start_time ASC
       LIMIT 30`
    );
    return R.ok(res, rows);
  } catch (err) { next(err); }
}

async function listMine(req, res, next) {
  try {
    const student = await getStudent(req);
    if (!student) return R.notFound(res, 'Student profile not found');
    const exams = await competitionService.listForStudent(
      student.id,
      student.class_name,
      student.school_link_status === 'APPROVED' ? student.school_id : null
    );
    return R.ok(res, exams);
  } catch (err) { next(err); }
}

async function register(req, res, next) {
  try {
    const student = await getStudent(req);
    if (!student) return R.notFound(res, 'Student profile not found');
    return R.ok(res, await studentExamService.register(req.params.examId, student.id));
  } catch (err) { next(err); }
}

async function startAttempt(req, res, next) {
  try {
    const student = await getStudent(req);
    if (!student) return R.notFound(res, 'Student profile not found');
    return R.ok(res, await studentExamService.startAttempt(req.params.examId, student.id));
  } catch (err) { next(err); }
}

async function submit(req, res, next) {
  try {
    const student = await getStudent(req);
    if (!student) return R.notFound(res, 'Student profile not found');
    return R.ok(res, await studentExamService.submitAttempt(
      req.params.attemptId,
      student.id,
      req.body.responses || []
    ));
  } catch (err) { next(err); }
}

async function getLeaderboard(req, res, next) {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 50;
    return R.ok(res, await competitionService.getLeaderboard(req.params.examId, page, limit));
  } catch (err) { next(err); }
}

async function createExam(req, res, next) {
  try {
    const body = { ...req.body };
    if (req.user.role === 'SCHOOL_ADMIN' && !body.schoolId) body.schoolId = req.user.schoolId;
    return R.created(res, await competitionService.createExam(body, req.user.userId));
  } catch (err) { next(err); }
}

async function addQuestions(req, res, next) {
  try { return R.ok(res, await competitionService.addQuestions(req.params.examId, req.body.questions || [])); }
  catch (err) { next(err); }
}

async function updateStatus(req, res, next) {
  try {
    const { rows: [exam] } = await query(
      `UPDATE exams SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING id, title, status`,
      [req.body.status, req.params.examId]
    );
    if (!exam) return R.notFound(res, 'Exam not found');
    return R.ok(res, exam);
  } catch (err) { next(err); }
}

module.exports = { list, listMine, register, startAttempt, submit, getLeaderboard, createExam, addQuestions, updateStatus };
