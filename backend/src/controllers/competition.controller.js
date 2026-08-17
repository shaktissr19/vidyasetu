// controllers/competition.controller.js
const competitionService = require('../services/competition.service');
const { query } = require('../config/db');
const R = require('../utils/response');

async function getStudent(req) {
  const { rows: [student] } = await query(
    `SELECT s.id, s.school_id, sc.class_name
     FROM students s
     JOIN school_classes sc ON sc.id = s.class_id
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
    const exams = await competitionService.listForUser(req.user.userId);
    return R.ok(res, exams);
  } catch (err) { next(err); }
}

async function register(req, res, next) {
  try {
    const student = await getStudent(req);
    if (!student) return R.notFound(res, 'Student profile not found');
    const result = await competitionService.register(req.params.examId, student.id);
    return R.ok(res, result);
  } catch (err) { next(err); }
}

async function startAttempt(req, res, next) {
  try {
    const student = await getStudent(req);
    if (!student) return R.notFound(res, 'Student profile not found');
    const data = await competitionService.startAttempt(req.params.examId, student.id);
    return R.ok(res, data);
  } catch (err) { next(err); }
}

async function submit(req, res, next) {
  try {
    const student = await getStudent(req);
    if (!student) return R.notFound(res, 'Student profile not found');
    const result = await competitionService.submitAttempt(
      req.params.attemptId,
      student.id,
      req.body.responses || []
    );
    return R.ok(res, result);
  } catch (err) { next(err); }
}

async function getLeaderboard(req, res, next) {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 50;
    const rows = await competitionService.getLeaderboard(req.params.examId, page, limit);
    return R.ok(res, rows);
  } catch (err) { next(err); }
}

async function createExam(req, res, next) {
  try {
    const body = { ...req.body };
    if (req.user.role === 'SCHOOL_ADMIN' && !body.schoolId) body.schoolId = req.user.schoolId;
    const exam = await competitionService.createExam(body, req.user.userId);
    return R.created(res, exam);
  } catch (err) { next(err); }
}

async function addQuestions(req, res, next) {
  try {
    const result = await competitionService.addQuestions(req.params.examId, req.body.questions || []);
    return R.ok(res, result);
  } catch (err) { next(err); }
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

module.exports = {
  list,
  listMine,
  register,
  startAttempt,
  submit,
  getLeaderboard,
  createExam,
  addQuestions,
  updateStatus,
};
