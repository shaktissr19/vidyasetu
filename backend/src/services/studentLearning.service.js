const { query } = require('../config/db');

async function markContentComplete(userId, contentItemId) {
  const { rows: [student] } = await query(
    `SELECT id FROM students WHERE user_id = $1 AND status = 'ACTIVE'`,
    [userId]
  );
  if (!student) throw Object.assign(new Error('Student not found'), { statusCode: 404 });

  const { rows: [item] } = await query(
    `SELECT id, type, status FROM content_items WHERE id = $1`,
    [contentItemId]
  );
  if (!item || item.status !== 'PUBLISHED') {
    throw Object.assign(new Error('Content item not found'), { statusCode: 404 });
  }
  if (item.type === 'QUIZ') {
    throw Object.assign(new Error('Quiz completion must be recorded through quiz submission'), { statusCode: 400 });
  }

  const { rows: [existing] } = await query(
    `SELECT id, is_completed, completed_at
     FROM student_content_progress
     WHERE student_id = $1 AND content_item_id = $2`,
    [student.id, contentItemId]
  );

  if (existing?.is_completed) {
    return { alreadyCompleted: true, completedAt: existing.completed_at };
  }

  const { rows: [progress] } = await query(
    `INSERT INTO student_content_progress
       (student_id, content_item_id, is_completed, progress_pct, last_accessed, completed_at)
     VALUES ($1, $2, TRUE, 100, NOW(), NOW())
     ON CONFLICT (student_id, content_item_id) DO UPDATE
     SET is_completed = TRUE,
         progress_pct = 100,
         last_accessed = NOW(),
         completed_at = COALESCE(student_content_progress.completed_at, NOW())
     RETURNING id, is_completed, progress_pct, last_accessed, completed_at`,
    [student.id, contentItemId]
  );

  return { alreadyCompleted: false, progress };
}

module.exports = { markContentComplete };
