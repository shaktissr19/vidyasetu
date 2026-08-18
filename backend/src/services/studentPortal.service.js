// services/studentPortal.service.js
const { query } = require('../config/db');

async function getStudentByUserId(userId) {
  const { rows: [student] } = await query(
    `SELECT s.id, s.school_id, s.class_id, s.academic_year, s.grade_level, s.school_link_status,
            sc.class_name, sc.section
     FROM students s
     LEFT JOIN school_classes sc ON sc.id = s.class_id
     WHERE s.user_id = $1 AND s.status = 'ACTIVE'`,
    [userId]
  );
  if (!student) throw Object.assign(new Error('Student profile not found'), { statusCode: 404 });
  return student;
}

async function getOfflineDownloads(userId) {
  const student = await getStudentByUserId(userId);
  const { rows } = await query(
    `SELECT od.id, od.content_item_id, od.downloaded_at, od.file_size_kb, od.is_synced,
            ci.type, ci.title, ci.title_hi, ci.language, ci.file_url,
            ci.is_offline_ready, ci.duration_secs,
            ch.id AS chapter_id, ch.chapter_number, ch.title AS chapter_title,
            sub.id AS subject_id, sub.code AS subject_code, sub.name AS subject_name,
            sub.color_hex
     FROM offline_downloads od
     JOIN content_items ci ON ci.id = od.content_item_id
     JOIN chapters ch ON ch.id = ci.chapter_id
     JOIN subjects sub ON sub.id = ch.subject_id
     WHERE od.student_id = $1
     ORDER BY od.downloaded_at DESC`,
    [student.id]
  );

  const totalSizeKb = rows.reduce((sum, row) => sum + Number(row.file_size_kb || 0), 0);
  return {
    items: rows,
    summary: {
      itemCount: rows.length,
      totalSizeKb,
      totalSizeMb: Number((totalSizeKb / 1024).toFixed(1)),
      syncedCount: rows.filter(r => r.is_synced).length,
    },
  };
}

async function removeOfflineDownload(userId, contentItemId) {
  const student = await getStudentByUserId(userId);
  const { rowCount } = await query(
    `DELETE FROM offline_downloads
     WHERE student_id = $1 AND content_item_id = $2`,
    [student.id, contentItemId]
  );
  return { removed: rowCount > 0 };
}

module.exports = { getStudentByUserId, getOfflineDownloads, removeOfflineDownload };
