// services/content.service.js
const { query, transaction } = require('../config/db');
const { getUploadUrl, getDownloadUrl, publicUrl } = require('../config/s3');
const { getPagination, paginationMeta } = require('../utils/paginate');

/**
 * Get all subjects with chapter counts for a class.
 */
async function getSubjectsForClass(className) {
  const { rows } = await query(
    `SELECT sub.id, sub.name, sub.name_hi, sub.code, sub.color_hex, sub.icon_url,
            COUNT(ch.id) AS chapter_count
     FROM subjects sub
     LEFT JOIN chapters ch ON ch.subject_id = sub.id AND ch.class_name = $1
     GROUP BY sub.id ORDER BY sub.name`,
    [className]
  );
  return rows;
}

/**
 * Get chapters for a subject+class with content counts.
 */
async function getChapters(subjectId, className) {
  const { rows } = await query(
    `SELECT ch.*,
            COUNT(ci.id) AS total_items,
            COUNT(ci.id) FILTER (WHERE ci.type = 'VIDEO') AS video_count,
            COUNT(ci.id) FILTER (WHERE ci.type = 'PDF')   AS pdf_count,
            COUNT(ci.id) FILTER (WHERE ci.type = 'QUIZ')  AS quiz_count
     FROM chapters ch
     LEFT JOIN content_items ci ON ci.chapter_id = ch.id AND ci.status = 'PUBLISHED'
     WHERE ch.subject_id = $1 AND ch.class_name = $2
     GROUP BY ch.id ORDER BY ch.chapter_number`,
    [subjectId, className]
  );
  return rows;
}

/**
 * Get all content items in a chapter, with student progress if studentId provided.
 */
async function getContentItems(chapterId, studentId = null, language = 'hi') {
  const { rows } = await query(
    `SELECT ci.id, ci.type, ci.title, ci.language, ci.duration_secs,
            ci.file_size_kb, ci.thumbnail_url, ci.sort_order, ci.is_offline_ready,
            ci.difficulty, ci.view_count,
            scp.is_completed, scp.progress_pct, scp.last_accessed
     FROM content_items ci
     LEFT JOIN student_content_progress scp ON scp.content_item_id = ci.id
       AND scp.student_id = $2
     WHERE ci.chapter_id = $1 AND ci.status = 'PUBLISHED'
       AND (ci.language = $3 OR ci.language = 'en')
     ORDER BY ci.sort_order`,
    [chapterId, studentId, language]
  );
  return rows;
}

/**
 * Get a signed URL to stream/download a content item.
 */
async function getContentUrl(contentItemId, studentId) {
  const { rows: [item] } = await query(
    `SELECT file_url, type, is_offline_ready FROM content_items
     WHERE id = $1 AND status = 'PUBLISHED'`,
    [contentItemId]
  );
  if (!item) throw Object.assign(new Error('Content not found'), { statusCode: 404 });

  // Increment view count
  await query(`UPDATE content_items SET view_count = view_count + 1 WHERE id = $1`, [contentItemId]);

  // For offline-ready content, give longer TTL (24 hrs)
  const ttl = item.is_offline_ready ? 86400 : 3600;
  const url = await getDownloadUrl(item.file_url, ttl);

  return { url, type: item.type, ttl };
}

/**
 * Get quiz questions for a content item (with correct answers hidden).
 */
async function getQuizQuestions(contentItemId) {
  const { rows } = await query(
    `SELECT id, question_text, question_hi, option_a, option_b, option_c, option_d,
            marks, sort_order
     FROM quiz_questions WHERE content_item_id = $1 ORDER BY sort_order`,
    [contentItemId]
  );
  return rows;
}

/**
 * Submit quiz answers — evaluate and return score + explanations.
 */
async function submitQuiz(contentItemId, studentId, answers) {
  // answers = [{ questionId, selectedOption }]
  const { rows: questions } = await query(
    `SELECT id, correct_option, explanation, explanation_hi, xp_reward
     FROM quiz_questions WHERE content_item_id = $1`,
    [contentItemId]
  );

  const answerMap = Object.fromEntries(questions.map(q => [q.id, q]));
  let correctCount = 0;
  let totalXP = 0;
  const results = [];

  for (const a of answers) {
    const q = answerMap[a.questionId];
    if (!q) continue;
    const isCorrect = a.selectedOption === q.correct_option;
    if (isCorrect) { correctCount++; totalXP += q.xp_reward; }
    results.push({
      questionId: a.questionId,
      isCorrect,
      correctOption: q.correct_option,
      explanation: q.explanation,
      explanationHi: q.explanation_hi,
    });
  }

  const score = Math.round((correctCount / questions.length) * 100);
  const isPerfect = score === 100;

  // Award XP
  const { awardXP, awardBadgeIfNotEarned } = require('./student.service');
  const { rows: [student] } = await query(`SELECT id FROM students WHERE user_id = $1`, [studentId]);
  if (student) {
    await awardXP(student.id, 'QUIZ_PASS', totalXP, contentItemId, 'CONTENT_ITEM');
    if (isPerfect) await awardBadgeIfNotEarned(student.id, 'QUIZ_PERFECT');
  }

  return { score, correctCount, totalQuestions: questions.length, xpAwarded: totalXP, results };
}

/**
 * Admin: Generate a presigned upload URL for new content.
 */
async function getUploadPresignedUrl(fileName, contentType, chapterId, type) {
  const key = `content/${chapterId}/${Date.now()}_${fileName}`;
  const url = await getUploadUrl(key, contentType);
  return { uploadUrl: url, key };
}

/**
 * Admin: Save content item metadata after upload.
 */
async function saveContentItem(data, createdBy) {
  const { rows: [item] } = await query(
    `INSERT INTO content_items
       (chapter_id, subject_id, class_name, type, title, language, status,
        difficulty, duration_secs, file_url, file_size_kb, thumbnail_url,
        sort_order, is_offline_ready, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
    [data.chapterId, data.subjectId, data.className, data.type, data.title,
     data.language || 'hi', data.status || 'DRAFT', data.difficulty || 'MEDIUM',
     data.durationSecs || null, data.fileUrl, data.fileSizeKb || null,
     data.thumbnailUrl || null, data.sortOrder || 0,
     data.isOfflineReady || false, createdBy]
  );
  return item;
}

/**
 * Mark a content item for offline download for a student.
 */
async function markForOfflineDownload(contentItemId, studentId) {
  const { rows: [item] } = await query(
    `SELECT is_offline_ready, file_size_kb FROM content_items WHERE id = $1`, [contentItemId]
  );
  if (!item?.is_offline_ready) {
    throw Object.assign(new Error('This content is not available for offline download'), { statusCode: 400 });
  }

  // Check download count limit
  const { rows: [cnt] } = await query(
    `SELECT COUNT(*) AS c FROM offline_downloads WHERE student_id = $1`, [studentId]
  );
  const maxDownloads = 500; // configurable
  if (parseInt(cnt.c) >= maxDownloads) {
    throw Object.assign(new Error('Offline storage limit reached. Remove some downloads first.'), { statusCode: 400 });
  }

  await query(
    `INSERT INTO offline_downloads (student_id, content_item_id, file_size_kb)
     VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
    [studentId, contentItemId, item.file_size_kb]
  );

  // Return signed URL for actual download
  const { rows: [full] } = await query(
    `SELECT file_url FROM content_items WHERE id = $1`, [contentItemId]
  );
  const url = await getDownloadUrl(full.file_url, 86400); // 24hr URL
  return { url };
}

module.exports = {
  getSubjectsForClass, getChapters, getContentItems,
  getContentUrl, getQuizQuestions, submitQuiz,
  getUploadPresignedUrl, saveContentItem, markForOfflineDownload,
};
