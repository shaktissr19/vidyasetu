import type { QueryResultRow } from 'pg';
import type { UUID } from '@vidyasetu/contracts';
import { query, transaction } from '../config/db';

export type EnrollmentRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'ALL';

export interface SchoolEnrollmentRequestRow extends QueryResultRow {
  id: UUID;
  status: string;
  requested_at: string | Date;
  reviewed_at: string | Date | null;
  student_note: string | null;
  school_note: string | null;
  requested_grade: string | null;
  student_id: UUID;
  student_code: string;
  grade_level: string | null;
  school_link_status: string;
  name: string;
  username: string | null;
  email: string | null;
  mobile: string;
  requested_class_id: UUID | null;
  class_name: string | null;
  section: string | null;
  academic_year: string | null;
  parent_linked: boolean;
  parent_link_pending: boolean;
}

interface LockedEnrollmentRequestRow extends QueryResultRow {
  id: UUID;
  student_id: UUID;
  requested_class_id: UUID | null;
  status: string;
  school_link_status: string;
}

interface SchoolClassRow extends QueryResultRow {
  id: UUID;
  class_name: string;
  section: string;
  academic_year: string;
}

export interface ReviewedEnrollmentRow extends QueryResultRow {
  id: UUID;
  status: string;
  school_note: string | null;
  reviewed_at: string | Date | null;
  student_code: string;
  school_link_status: string;
  roll_number: string | null;
  grade_level: string | null;
  name: string;
  username: string | null;
  email: string | null;
  mobile: string;
  class_name: string | null;
  section: string | null;
  school_name: string | null;
}

export interface EnrollmentReviewInput {
  action: 'APPROVE' | 'REJECT';
  classId?: UUID | null;
  rollNumber?: string | null;
  note?: string | null;
}

export interface StudentLinkSummary extends QueryResultRow {
  student_code: string;
  grade_level: string | null;
  school_link_status: string;
  school_id: UUID | null;
  school_name: string | null;
  class_id: UUID | null;
  class_name: string | null;
  section: string | null;
  request_id: UUID | null;
  request_status: string | null;
  requested_at: string | Date | null;
  school_note: string | null;
  parent_linked: boolean;
  parent_link_pending: boolean;
}

export async function getSchoolEnrollmentRequests(
  schoolId: UUID,
  status: EnrollmentRequestStatus | string = 'PENDING',
): Promise<SchoolEnrollmentRequestRow[]> {
  const params: unknown[] = [schoolId];
  let statusClause = '';
  if (status && status !== 'ALL') {
    params.push(status);
    statusClause = 'AND r.status = $2';
  }

  const { rows } = await query<SchoolEnrollmentRequestRow>(
    `SELECT r.id, r.status, r.requested_at, r.reviewed_at, r.student_note, r.school_note,
            r.requested_grade,
            s.id AS student_id, s.student_code, s.grade_level, s.school_link_status,
            u.name, u.username, u.email, u.mobile,
            sc.id AS requested_class_id, sc.class_name, sc.section, sc.academic_year,
            EXISTS (
              SELECT 1 FROM parent_student_links psl WHERE psl.student_id = s.id
            ) AS parent_linked,
            EXISTS (
              SELECT 1 FROM parent_link_requests plr
              WHERE plr.student_id = s.id AND plr.status = 'PENDING'
            ) AS parent_link_pending
     FROM student_school_requests r
     JOIN students s ON s.id = r.student_id
     JOIN users u ON u.id = s.user_id
     LEFT JOIN school_classes sc ON sc.id = r.requested_class_id
     WHERE r.requested_school_id = $1
       ${statusClause}
     ORDER BY CASE WHEN r.status = 'PENDING' THEN 0 ELSE 1 END, r.requested_at DESC`,
    params,
  );
  return rows;
}

export async function reviewSchoolEnrollmentRequest(
  schoolId: UUID,
  requestId: UUID,
  reviewerUserId: UUID,
  data: EnrollmentReviewInput,
): Promise<ReviewedEnrollmentRow | undefined> {
  return transaction(async (client) => {
    const { rows: [request] } = await client.query<LockedEnrollmentRequestRow>(
      `SELECT r.*, s.school_link_status
       FROM student_school_requests r
       JOIN students s ON s.id = r.student_id
       WHERE r.id = $1 AND r.requested_school_id = $2
       FOR UPDATE`,
      [requestId, schoolId],
    );
    if (!request) {
      throw Object.assign(new Error('Enrollment request not found'), { statusCode: 404 });
    }
    if (request.status !== 'PENDING') {
      throw Object.assign(
        new Error(`Enrollment request is already ${request.status.toLowerCase()}`),
        { statusCode: 409 },
      );
    }

    if (data.action === 'APPROVE') {
      const targetClassId = data.classId || request.requested_class_id;
      if (!targetClassId) {
        throw Object.assign(new Error('A school class/section is required for approval'), { statusCode: 400 });
      }

      const { rows: [schoolClass] } = await client.query<SchoolClassRow>(
        `SELECT id, class_name, section, academic_year
         FROM school_classes
         WHERE id = $1 AND school_id = $2`,
        [targetClassId, schoolId],
      );
      if (!schoolClass) {
        throw Object.assign(new Error('Selected class does not belong to this school'), { statusCode: 400 });
      }

      await client.query(
        `UPDATE students
         SET school_id = $2,
             class_id = $3,
             grade_level = $4,
             academic_year = $5,
             roll_number = COALESCE(NULLIF($6, ''), roll_number),
             school_link_status = 'APPROVED',
             school_link_reviewed_at = NOW(),
             school_link_reviewed_by = $7,
             updated_at = NOW()
         WHERE id = $1`,
        [
          request.student_id,
          schoolId,
          schoolClass.id,
          schoolClass.class_name,
          schoolClass.academic_year,
          data.rollNumber || null,
          reviewerUserId,
        ],
      );

      await client.query(
        `UPDATE student_school_requests
         SET status = 'APPROVED', school_note = $2, reviewed_at = NOW(), reviewed_by = $3, updated_at = NOW()
         WHERE id = $1`,
        [requestId, data.note || null, reviewerUserId],
      );
    } else {
      await client.query(
        `UPDATE students
         SET school_id = NULL,
             class_id = NULL,
             school_link_status = 'REJECTED',
             school_link_reviewed_at = NOW(),
             school_link_reviewed_by = $2,
             updated_at = NOW()
         WHERE id = $1`,
        [request.student_id, reviewerUserId],
      );
      await client.query(
        `UPDATE student_school_requests
         SET status = 'REJECTED', school_note = $2, reviewed_at = NOW(), reviewed_by = $3, updated_at = NOW()
         WHERE id = $1`,
        [requestId, data.note || null, reviewerUserId],
      );
    }

    await client.query(
      `UPDATE schools
       SET total_students = (
         SELECT COUNT(*) FROM students
         WHERE school_id = $1 AND status = 'ACTIVE' AND school_link_status = 'APPROVED'
       ), updated_at = NOW()
       WHERE id = $1`,
      [schoolId],
    );

    const { rows: [updated] } = await client.query<ReviewedEnrollmentRow>(
      `SELECT r.id, r.status, r.school_note, r.reviewed_at,
              s.student_code, s.school_link_status, s.roll_number, s.grade_level,
              u.name, u.username, u.email, u.mobile,
              sc.class_name, sc.section, sch.name AS school_name
       FROM student_school_requests r
       JOIN students s ON s.id = r.student_id
       JOIN users u ON u.id = s.user_id
       LEFT JOIN school_classes sc ON sc.id = s.class_id
       LEFT JOIN schools sch ON sch.id = s.school_id
       WHERE r.id = $1`,
      [requestId],
    );
    return updated;
  });
}

export async function getStudentLinkSummary(userId: UUID): Promise<StudentLinkSummary | null> {
  const { rows: [row] } = await query<StudentLinkSummary>(
    `SELECT s.student_code, s.grade_level, s.school_link_status,
            sch.id AS school_id, sch.name AS school_name,
            sc.id AS class_id, sc.class_name, sc.section,
            r.id AS request_id, r.status AS request_status, r.requested_at, r.school_note,
            EXISTS (SELECT 1 FROM parent_student_links psl WHERE psl.student_id = s.id) AS parent_linked,
            EXISTS (SELECT 1 FROM parent_link_requests plr WHERE plr.student_id = s.id AND plr.status = 'PENDING') AS parent_link_pending
     FROM students s
     LEFT JOIN schools sch ON sch.id = s.school_id
     LEFT JOIN school_classes sc ON sc.id = s.class_id
     LEFT JOIN LATERAL (
       SELECT id, status, requested_at, school_note
       FROM student_school_requests
       WHERE student_id = s.id
       ORDER BY requested_at DESC
       LIMIT 1
     ) r ON TRUE
     WHERE s.user_id = $1`,
    [userId],
  );
  return row || null;
}
