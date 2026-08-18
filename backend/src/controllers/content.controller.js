// controllers/content.controller.js
const contentService = require('../services/content.service');
const academicLearningService = require('../services/academicLearning.service');
const { query } = require('../config/db');
const R = require('../utils/response');

async function getSubjects(req, res, next) {
  try {
    const subjects = await contentService.getSubjectsForClass(req.query.class || '8');
    return R.ok(res, subjects);
  } catch (err) { next(err); }
}

async function getChapters(req, res, next) {
  try {
    const chapters = await contentService.getChapters(req.params.subjectId, req.query.class || '8');
    return R.ok(res, chapters);
  } catch (err) { next(err); }
}

async function getContentItems(req, res, next) {
  try {
    let studentId = null;
    if (req.user?.role === 'STUDENT') {
      const { rows: [s] } = await query(`SELECT id FROM students WHERE user_id = $1`, [req.user.userId]);
      studentId = s?.id;
    }
    const items = await contentService.getContentItems(
      req.params.chapterId, studentId, req.query.lang || 'hi'
    );
    return R.ok(res, items);
  } catch (err) { next(err); }
}

async function getContentUrl(req, res, next) {
  try {
    const { rows: [s] } = await query(`SELECT id FROM students WHERE user_id = $1`, [req.user.userId]);
    const data = await contentService.getContentUrl(req.params.itemId, s?.id);
    return R.ok(res, data);
  } catch (err) { next(err); }
}

async function markComplete(req, res, next) {
  try {
    const result = await academicLearningService.markContentComplete(req.user.userId, req.params.itemId);
    return R.ok(res, result);
  } catch (err) { next(err); }
}

async function getQuizQuestions(req, res, next) {
  try {
    const questions = await contentService.getQuizQuestions(req.params.itemId);
    return R.ok(res, questions);
  } catch (err) { next(err); }
}

async function submitQuiz(req, res, next) {
  try {
    const result = await academicLearningService.submitQuiz(req.params.itemId, req.user.userId, req.body.answers);
    return R.ok(res, result);
  } catch (err) { next(err); }
}

async function downloadOffline(req, res, next) {
  try {
    const { rows: [s] } = await query(`SELECT id FROM students WHERE user_id = $1`, [req.user.userId]);
    if (!s) return R.notFound(res, 'Student not found');
    const result = await contentService.markForOfflineDownload(req.params.itemId, s.id);
    return R.ok(res, result);
  } catch (err) { next(err); }
}

async function getUploadUrl(req, res, next) {
  try {
    const { fileName, contentType, chapterId, type } = req.query;
    const result = await contentService.getUploadPresignedUrl(fileName, contentType, chapterId, type);
    return R.ok(res, result);
  } catch (err) { next(err); }
}

async function saveContentItem(req, res, next) {
  try {
    const item = await contentService.saveContentItem(req.body, req.user.userId);
    return R.created(res, item);
  } catch (err) { next(err); }
}

module.exports = {
  getSubjects, getChapters, getContentItems, getContentUrl,
  markComplete, getQuizQuestions, submitQuiz, downloadOffline,
  getUploadUrl, saveContentItem,
};
