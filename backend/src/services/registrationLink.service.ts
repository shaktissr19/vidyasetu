import type { QueryResultRow } from 'pg';
import type { UUID } from '@vidyasetu/contracts';
import { query, transaction } from '../config/db';

interface ParentLinkRow extends QueryResultRow {
  id: UUID;
  student_id: UUID;
  parent_user_id: UUID | null;
  relation: string;
  status: string;
  initiated_by: string;
  parent_name: string | null;
  parent_mobile: string | null;
  parent_email: string | null;
  created_at: string | Date;
}

interface TeacherRequestRow extends QueryResultRow {
  id: UUID;
  teacher_user_id: UUID;
  requested_school_id: UUID;
  status: string;
  employee_id: string | null;
  designation: string | null;
  qualification: string | null;
  experience_yrs: number;
  employment_type: string;
  teacher_note: string | null;
  school_note: string | null;
  name: string | null;
  username: string | null;
  email: string | null;
  mobile: string;
  created_at: string | Date;
}

export async function getStudentParentLinkRequests(studentUserId: UUID) {
  const { rows } = await query(
    `SELECT plr.id, plr.status, plr.initiated_by, plr.relation,
            plr.parent_name, plr.parent_mobile, plr.parent_email,
            plr.parent_confirmed_at, plr.student_confirmed_at, plr.created_at,
            pu.name AS registered_parent_name, pu.mobile AS registered_parent_mobile,
            pu.email AS registered_parent_email
     FROM parent_link_requests plr
     JOIN students s ON s.id=plr.student_id
     LEFT JOIN users pu ON pu.id=plr.parent_user_id
     WHERE s.user_id=$1
       AND plr.status IN ('PENDING','AWAITING_STUDENT','AWAITING_PARENT')
     ORDER BY plr.created_at DESC`,
    [studentUserId],
  );
  return rows;
}

export async function reviewStudentParentLinkRequest(
  studentUserId: UUID,
  requestId: UUID,
  action: 'APPROVE' | 'REJECT',
) {
  return transaction(async (client) => {
    const { rows: [request] } = await client.query<ParentLinkRow>(
      `SELECT plr.*
       FROM parent_link_requests plr
       JOIN students s ON s.id=plr.student_id
       WHERE plr.id=$1 AND s.user_id=$2
       FOR UPDATE`,
      [requestId, studentUserId],
    );
    if (!request) throw Object.assign(new Error('Parent relationship request not found'), { statusCode: 404 });
    if (request.status !== 'AWAITING_STUDENT') {
      throw Object.assign(new Error('This request is not awaiting Student confirmation'), { statusCode: 409 });
    }

    if (action === 'REJECT') {
      const { rows: [rejected] } = await client.query(
        `UPDATE parent_link_requests
         SET status='REJECTED',reviewed_at=NOW(),reviewed_by=$2,updated_at=NOW()
         WHERE id=$1 RETURNING *`,
        [requestId, studentUserId],
      );
      return rejected;
    }

    if (!request.parent_user_id) {
      throw Object.assign(new Error('The Parent account has not been verified yet'), { statusCode: 409 });
    }

    await client.query(
      `INSERT INTO parent_student_links(parent_user_id,student_id,relation,is_primary)
       VALUES($1,$2,$3,TRUE)
       ON CONFLICT(parent_user_id,student_id)
       DO UPDATE SET relation=EXCLUDED.relation`,
      [request.parent_user_id, request.student_id, request.relation || 'PARENT'],
    );
    const { rows: [approved] } = await client.query(
      `UPDATE parent_link_requests
       SET status='APPROVED',student_confirmed_at=NOW(),reviewed_at=NOW(),reviewed_by=$2,updated_at=NOW()
       WHERE id=$1 RETURNING *`,
      [requestId, studentUserId],
    );
    return approved;
  });
}

export async function getSchoolTeacherRequests(schoolId: UUID) {
  const { rows } = await query<TeacherRequestRow>(
    `SELECT tsr.*,u.name,u.username,u.email,u.mobile
     FROM teacher_school_requests tsr
     JOIN users u ON u.id=tsr.teacher_user_id
     WHERE tsr.requested_school_id=$1
     ORDER BY CASE WHEN tsr.status='PENDING' THEN 0 ELSE 1 END, tsr.requested_at DESC`,
    [schoolId],
  );
  return rows;
}

export async function reviewSchoolTeacherRequest(
  schoolId: UUID,
  reviewerUserId: UUID,
  requestId: UUID,
  action: 'APPROVE' | 'REJECT',
  note?: string | null,
) {
  return transaction(async (client) => {
    const { rows: [request] } = await client.query<TeacherRequestRow>(
      `SELECT tsr.*,u.name,u.username,u.email,u.mobile
       FROM teacher_school_requests tsr
       JOIN users u ON u.id=tsr.teacher_user_id
       WHERE tsr.id=$1 AND tsr.requested_school_id=$2
       FOR UPDATE OF tsr`,
      [requestId, schoolId],
    );
    if (!request) throw Object.assign(new Error('Teacher membership request not found'), { statusCode: 404 });
    if (request.status !== 'PENDING') {
      throw Object.assign(new Error('Teacher membership request has already been reviewed'), { statusCode: 409 });
    }

    if (action === 'REJECT') {
      const { rows: [rejected] } = await client.query(
        `UPDATE teacher_school_requests
         SET status='REJECTED',school_note=$3,reviewed_at=NOW(),reviewed_by=$2,updated_at=NOW()
         WHERE id=$1 RETURNING *`,
        [requestId, reviewerUserId, note || null],
      );
      return { request: rejected, teacher: null };
    }

    const { rows: existingTeacher } = await client.query('SELECT id FROM teachers WHERE user_id=$1 LIMIT 1', [request.teacher_user_id]);
    if (existingTeacher.length) {
      throw Object.assign(new Error('This Teacher is already linked to a School'), { statusCode: 409 });
    }

    const { rows: [teacher] } = await client.query(
      `INSERT INTO teachers
         (user_id,school_id,employee_id,designation,qualification,experience_yrs,employment_type,status,email_official)
       VALUES($1,$2,$3,$4,$5,$6,$7,'ACTIVE',$8)
       RETURNING *`,
      [request.teacher_user_id, schoolId, request.employee_id || null, request.designation || 'Teacher',
       request.qualification || null, request.experience_yrs || 0, request.employment_type || 'FULL_TIME', request.email || null],
    );

    await client.query(
      `UPDATE teacher_school_requests
       SET status='APPROVED',school_note=$3,reviewed_at=NOW(),reviewed_by=$2,updated_at=NOW()
       WHERE id=$1`,
      [requestId, reviewerUserId, note || null],
    );
    await client.query("UPDATE users SET status='ACTIVE',updated_at=NOW() WHERE id=$1", [request.teacher_user_id]);
    await client.query(
      "UPDATE schools SET total_teachers=(SELECT COUNT(*) FROM teachers WHERE school_id=$1 AND status='ACTIVE'),updated_at=NOW() WHERE id=$1",
      [schoolId],
    );

    return { request: { id: requestId, status: 'APPROVED' }, teacher };
  });
}
