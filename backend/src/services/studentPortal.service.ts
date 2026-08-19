import type { QueryResultRow } from 'pg';
import type { UUID } from '@vidyasetu/contracts';
import { query } from '../config/db';

type SchoolLinkStatus = 'UNLINKED' | 'PENDING' | 'APPROVED' | 'REJECTED';

export interface StudentPortalProfile extends QueryResultRow {
  id: UUID;
  school_id: UUID | null;
  class_id: UUID | null;
  academic_year: string | null;
  grade_level: string | null;
  school_link_status: SchoolLinkStatus;
  class_name: string | null;
  section: string | null;
}

export interface OfflineDownloadRow extends QueryResultRow {
  id: UUID;
  content_item_id: UUID;
  downloaded_at: string | Date;
  file_size_kb: number | string | null;
  is_synced: boolean;
  type: string;
  title: string;
  title_hi: string | null;
  language: string | null;
  file_url: string | null;
  is_offline_ready: boolean;
  duration_secs: number | null;
  chapter_id: UUID;
  chapter_number: number;
  chapter_title: string;
  subject_id: UUID;
  subject_code: string;
  subject_name: string;
  color_hex: string | null;
}

export async function getStudentByUserId(userId: UUID): Promise<StudentPortalProfile> {
  const { rows: [student] } = await query<StudentPortalProfile>(
    `SELECT s.id, s.school_id, s.class_id, s.academic_year, s.grade_level, s.school_link_status,
            sc.class_name, sc.section
     FROM students s
     LEFT JOIN school_classes sc ON sc.id = s.class_id
     WHERE s.user_id = $1 AND s.status = 'ACTIVE'`,
    [userId],
  );
  if (!student) {
    throw Object.assign(new Error('Student profile not found'), { statusCode: 404 });
  }
  return student;
}

export async function getOfflineDownloads(userId: UUID): Promise<{
  items: OfflineDownloadRow[];
  summary: {
    itemCount: number;
    totalSizeKb: number;
    totalSizeMb: number;
    syncedCount: number;
  };
}> {
  const student = await getStudentByUserId(userId);
  const { rows } = await query<OfflineDownloadRow>(
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
    [student.id],
  );

  const totalSizeKb = rows.reduce((sum, row) => sum + Number(row.file_size_kb || 0), 0);
  return {
    items: rows,
    summary: {
      itemCount: rows.length,
      totalSizeKb,
      totalSizeMb: Number((totalSizeKb / 1024).toFixed(1)),
      syncedCount: rows.filter((row) => row.is_synced).length,
    },
  };
}

export async function removeOfflineDownload(
  userId: UUID,
  contentItemId: UUID,
): Promise<{ removed: boolean }> {
  const student = await getStudentByUserId(userId);
  const { rowCount } = await query(
    `DELETE FROM offline_downloads
     WHERE student_id = $1 AND content_item_id = $2`,
    [student.id, contentItemId],
  );
  return { removed: Number(rowCount || 0) > 0 };
}
