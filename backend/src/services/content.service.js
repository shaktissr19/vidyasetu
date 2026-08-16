// services/content.service.js
const { query } = require('../config/db');
const { getUploadUrl, getDownloadUrl } = require('../config/s3');

/**
 * Get all active subjects with chapter counts for a class.
 */
async function getSubjectsForClass(className) {
  const { rows } = await query(
    `SELECT sub.id, sub.name, sub.name_hi, sub.code, sub.color_hex, sub.icon_url,
            COUNT(ch.id) FILTER (WHERE ch.is_active = TRUE) AS chapter_count
     FROM subjects sub
     LEFT JOIN chapters ch
       ON ch.subject_id = sub.id
      AND ch.class_name = $1
     WHERE sub.is_active = TRUE
     GROUP BY sub.id
     ORDER BY sub.sort_order, sub.name`,
    [className]
  );
  return rows;
}

/**
 * Get chapters for a subject+class with published content counts.
 */
async function getChapters(subjectId, className) {
  const { rows } = await query(
    `SELECT ch.*,
            COUNT(ci.id) AS total_items,
            COUNT(ci.id) FILTER (WHERE ci.type = 'VIDEO') AS video_count,
            COUNT(ci.id) FILTER (WHERE ci.type = 'PDF') AS pdf_count,
            COUNT(ci.id) FILTER (WHERE ci.type = 'QUIZ') AS quiz_count,
            COUNT(ci.id) FILTER (WHERE ci.type = 'NOTES') AS notes_count,
            COUNT(ci.id) FILTER (WHERE ci.type = 'AUDIO') AS audio_count
     FROM chapters ch
     LEFT JOIN content_items ci
       ON ci.chapter_id = ch.id
      AND ci.status = 'PUBLISHED'
     WHERE ch.subject_id = $1
       AND ch.class_name = $2
       AND ch.is_active = TRUE
     GROUP BY ch.id
     ORDER BY ch.chapter_number`,
    [subjectId, className]
  );
  return rows;
}

/**
 * Get all published content items in a chapter, with student progress if available.
 */
async function getContentItems(chapterId, studentId = null, language = 'hi') {
  const { rows } = await query(
    `SELECT ci.id, ci.type, ci.title, ci.title_hi, ci.language, ci.duration_secs,
            ci.file_size_kb, ci.thumbnail_url, ci.sort_order, ci.is_offline_ready,
            ci.difficulty, ci.view_count, ci.xp_reward,
            scp.is_completed, scp.progress_pct, scp.quiz_score,
            scp.attempts, scp.last_accessed, scp.completed_at
     FROM content_items ci
     LEFT JOIN student_content_progress scp
       ON scp.content_item_id = ci.id
      AND scp.student_id = $2
     WHERE ci.chapter_id = $1
       AND ci.status = 'PUBLISHED'
       AND (ci.language = $3 OR ci.language = 'en')
     ORDER BY ci.sort_order, ci.created_at`,
    [chapterId, studentId, language]
  );
  return rows;
}

/**
 * Get a signed URL to stream/download a content item.
 */
async function getContentUrl(contentItemId, studentId) {
  const { rows: [item] } = await query(
    `SELECT file_url, type, is_offline_ready
     FROM content_items
     WHERE id = $1 AND status = 'PUBLISHED'`,
    [contentItemId]
  );

  if (!item) {
    throw Object.assign(new Error('Content not found'), { statusCode: 404 });
  }

  if (!item.file_url) {
    throw Object.assign(new Error('This content item does not have a downloadable file'), { statusCode: 400 });
  }

  await query(
    `UPDATE content_items
     SET view_count = view_count + 1
     WHERE id = $1`,
    [contentItemId]
  );

  if (studentId) {
    await query(
      `INSERT INTO student_content_progress
         (student_id, content_item_id, is_completed, progress_pct, attempts, last_accessed)
       VALUES ($1, $2, FALSE, 0, 1, NOW())
       ON CONFLICT (student_id, content_item_id) DO UPDATE
       SET last_accessed = NOW()`,
      [studentId, contentItemId]
    );
  }

  const ttl = item.is_offline_ready ? 86400 : 3600;
  const url = await getDownloadUrl(item.file_url, ttl);

  return { url, type: item.type, ttl };
}

/**
 * Get quiz questions for a content item. Correct answers are intentionally hidden.
 */
async function getQuizQuestions(contentItemId) {
  const { rows } = await query(
    `SELECT id, question_text, question_hi,
            option_a, option_b, option_c, option_d,
            option_a_hi, option_b_hi, option_c_hi, option_d_hi,
            difficulty, sort_order
     FROM quiz_questions
     WHERE content_item_id = $1
     ORDER BY sort_order, created_at`,
    [contentItemId]
  );
  return rows;
}

/**
 * Submit quiz answers, persist progress, and award the content item's XP once on first pass.
 */
async function submitQuiz(contentItemId, userId, answers = []) {
  const { rows: [contentItem] } = await query(
    `SELECT id, type, status, xp_reward
     FROM content_items
     WHERE id = $1`,
    [contentItemId]
  );

  if (!contentItem || contentItem.status !== 'PUBLISHED' || contentItem.type !== 'QUIZ') {
    throw Object.assign(new Error('Quiz not found'), { statusCode: 404 });
  }

  const { rows: [student] } = await query(
    `SELECT id FROM students WHERE user_id = $1`,
    [userId]
  );

  if (!student) {
    throw Object.assign(new Error('Student not found'), { statusCode: 404 });
  }

  const { rows: questions } = await query(
    `SELECT id, correct_option, explanation, explanation_hi
     FROM quiz_questions
     WHERE content_item_id = $1
     ORDER BY sort_order, created_at`,
    [contentItemId]
  );

  if (!questions.length) {
    throw Object.assign(new Error('This quiz does not have any questions yet'), { statusCode: 400 });
  }

  const answerMap = Object.fromEntries(questions.map(q => [q.id, q]));
  let correctCount = 0;
  const results = [];

  for (const answer of answers) {
    const question = answerMap[answer.questionId];
    if (!question) continue;

    const selectedOption = String(answer.selectedOption || '').toUpperCase();
    const isCorrect = selectedOption === question.correct_option;
    if (isCorrect) correctCount += 1;

    results.push({
      questionId: answer.questionId,
      selectedOption: selectedOption || null,
      isCorrect,
      correctOption: question.correct_option,
      explanation: question.explanation,
      explanationHi: question.explanation_hi,
    });
  }

  const score = Math.round((correctCount / questions.length) * 100);
  const passed = score >= 60;
  const isPerfect = score === 100;

  const { rows: [existingProgress] } = await query(
    `SELECT id, is_completed, quiz_score, attempts
     FROM student_content_progress
     WHERE student_id = $1 AND content_item_id = $2`,
    [student.id, contentItemId]
  );

  await query(
    `INSERT INTO student_content_progress
       (student_id, content_item_id, is_completed, progress_pct, quiz_score,
        attempts, last_accessed, completed_at)
     VALUES ($1, $2, $3, $4, $5, 1, NOW(), CASE WHEN $3 THEN NOW() ELSE NULL END)
     ON CONFLICT (student_id, content_item_id) DO UPDATE
     SET is_completed = student_content_progress.is_completed OR EXCLUDED.is_completed,
         progress_pct = GREATEST(student_content_progress.progress_pct, EXCLUDED.progress_pct),
         quiz_score = GREATEST(COALESCE(student_content_progress.quiz_score, 0), EXCLUDED.quiz_score),
         attempts = student_content_progress.attempts + 1,
         last_accessed = NOW(),
         completed_at = CASE
           WHEN student_content_progress.completed_at IS NOT NULL THEN student_content_progress.completed_at
           WHEN EXCLUDED.is_completed THEN NOW()
           ELSE NULL
         END`,
    [student.id, contentItemId, passed, passed ? 100 : score, score]
  );

  let xpAwarded = 0;
  if (passed && !existingProgress?.is_completed) {
    const { awardXP } = require('./student.service');
    xpAwarded = Number(contentItem.xp_reward || 10);
    await awardXP(
      student.id,
      isPerfect ? 'QUIZ_PERFECT' : 'QUIZ_PASS',
      xpAwarded,
      contentItemId,
      'CONTENT_ITEM',
      `Quiz completed with ${score}%`
    );
  }

  return {
    score,
    passed,
    isPerfect,
    correctCount,
    totalQuestions: questions.length,
    xpAwarded,
    attempts: (existingProgress?.attempts || 0) + 1,
    results,
  };
}

/**
 * Admin: Generate a presigned upload URL for new content.
 */
async function getUploadPresignedUrl(fileName, contentType, chapterId, type) {
  if (!fileName || !contentType || !chapterId || !type) {
    throw Object.assign(new Error('fileName, contentType, chapterId and type are required'), { statusCode: 400 });
  }

  const key = `content/${chapterId}/${Date.now()}_${fileName}`;
  const url = await getUploadUrl(key, contentType);
  return { uploadUrl: url, key };
}

/**
 * Admin: Save content item metadata after upload.
 */
async function saveContentItem(data, createdBy) {
  const { rows: [chapter] } = await query(
    `SELECT id FROM chapters WHERE id = $1 AND is_active = TRUE`,
    [data.chapterId]
  );

  if (!chapter) {
    throw Object.assign(new Error('Chapter not found'), { statusCode: 404 });
  }

  const { rows: [item] } = await query(
    `INSERT INTO content_items
       (chapter_id, type, status, title, title_hi, language,
        file_url, thumbnail_url, duration_secs, file_size_kb,
        difficulty, xp_reward, sort_order, is_offline_ready, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
     RETURNING *`,
    [
      data.chapterId,
      data.type,
      data.status || 'DRAFT',
      data.title,
      data.titleHi || null,
      data.language || 'hi',
      data.fileUrl || null,
      data.thumbnailUrl || null,
      data.durationSecs || null,
      data.fileSizeKb || null,
      data.difficulty || 'MEDIUM',
      data.xpReward || 10,
      data.sortOrder || 0,
      data.isOfflineReady || false,
      createdBy,
    ]
  );

  return item;
}

/**
 * Mark a content item for offline download for a student.
 */
async function markForOfflineDownload(contentItemId, studentId) {
  const { rows: [item] } = await query(
    `SELECT is_offline_ready, file_size_kb, file_url
     FROM content_items
     WHERE id = $1 AND status = 'PUBLISHED'`,
    [contentItemId]
  );

  if (!item) {
    throw Object.assign(new Error('Content not found'), { statusCode: 404 });
  }

  if (!item.is_offline_ready || !item.file_url) {
    throw Object.assign(
      new Error('This content is not available for offline download'),
      { statusCode: 400 }
    );
  }

  const { rows: [countRow] } = await query(
    `SELECT COUNT(*) AS count
     FROM offline_downloads
     WHERE student_id = $1`,
    [studentId]
  );

  const maxDownloads = 500;
  if (parseInt(countRow.count, 10) >= maxDownloads) {
    throw Object.assign(
      new Error('Offline storage limit reached. Remove some downloads first.'),
      { statusCode: 400 }
    );
  }

  await query(
    `INSERT INTO offline_downloads (student_id, content_item_id, file_size_kb)
     VALUES ($1, $2, $3)
     ON CONFLICT (student_id, content_item_id) DO UPDATE
     SET downloaded_at = NOW(),
         file_size_kb = EXCLUDED.file_size_kb,
         is_synced = TRUE`,
    [studentId, contentItemId, item.file_size_kb]
  );

  const url = await getDownloadUrl(item.file_url, 86400);
  return { url, ttl: 86400 };
}

module.exports = {
  getSubjectsForClass,
  getChapters,
  getContentItems,
  getContentUrl,
  getQuizQuestions,
  submitQuiz,
  getUploadPresignedUrl,
  saveContentItem,
  markForOfflineDownload,
};
