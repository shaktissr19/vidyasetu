// controllers/competition.controller.js
const competitionService = require('../services/competition.service');
const { query } = require('../config/db');
const R = require('../utils/response');

async function list(req, res, next) {
  try {
    // If authenticated student, use their class
    if (req.user?.role === 'STUDENT') {
      const { rows: [student] } = await query(
        `SELECT s.id, sc.class_name FROM students s
         JOIN school_classes sc ON sc.id = s.class_id
         WHERE s.user_id = $1`, [req.user.userId]
      );
      if (student) {
        const exams = await competitionService.listForStudent(student.id, student.class_name);
        return R.ok(res, exams);
      }
    }
    // Public listing — active competitions only
    const { rows } = await query(
      `SELECT e.*, sub.name AS subject_name FROM exams e
       LEFT JOIN subjects sub ON sub.id = e.subject_id
       WHERE e.status IN ('REGISTRATION_OPEN','LIVE','COMPLETED')
         AND e.type = 'COMPETITION'
       ORDER BY e.start_time ASC LIMIT 20`
    );
    return R.ok(res, rows);
  } catch (err) { next(err); }
}

async function register(req, res, next) {
  try {
    const { rows: [student] } = await query(
      `SELECT id FROM students WHERE user_id = $1`, [req.user.userId]
    );
    if (!student) return R.notFound(res, 'Student profile not found');
    const result = await competitionService.register(req.params.examId, student.id);
    return R.ok(res, result);
  } catch (err) { next(err); }
}

async function startAttempt(req, res, next) {
  try {
    const { rows: [student] } = await query(
      `SELECT id FROM students WHERE user_id = $1`, [req.user.userId]
    );
    if (!student) return R.notFound(res, 'Student profile not found');
    const data = await competitionService.startAttempt(req.params.examId, student.id);
    return R.ok(res, data);
  } catch (err) { next(err); }
}

async function submit(req, res, next) {
  try {
    const { rows: [student] } = await query(
      `SELECT id FROM students WHERE user_id = $1`, [req.user.userId]
    );
    if (!student) return R.notFound(res, 'Student profile not found');
    const result = await competitionService.submitAttempt(
      req.params.attemptId, student.id, req.body.responses
    );
    return R.ok(res, result);
  } catch (err) { next(err); }
}

async function getLeaderboard(req, res, next) {
  try {
    const page  = parseInt(req.query.page)  || 1;
    const limit = parseInt(req.query.limit) || 50;
    const rows = await competitionService.getLeaderboard(req.params.examId, page, limit);
    return R.ok(res, rows);
  } catch (err) { next(err); }
}

async function createExam(req, res, next) {
  try {
    const exam = await competitionService.createExam(req.body, req.user.userId);
    return R.created(res, exam);
  } catch (err) { next(err); }
}

async function addQuestions(req, res, next) {
  try {
    const result = await competitionService.addQuestions(req.params.examId, req.body.questions);
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

module.exports = { list, register, startAttempt, submit, getLeaderboard, createExam, addQuestions, updateStatus };
