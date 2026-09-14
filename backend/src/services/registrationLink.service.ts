import type { PoolClient, QueryResultRow } from 'pg';
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

interface ParentIdentityRow extends QueryResultRow {
  id: UUID;
  name: string | null;
  mobile: string;
  email: string | null;
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

export interface StudentParentInvitationInput {
  parentName?: string | null;
  parentMobile?: string | null;
  parentEmail?: string | null;
  parentRelation?: string | null;
}

async function insertStudentParentInvitation(
  client: PoolClient,
  studentId: UUID,
  studentUserId: UUID,
  input: StudentParentInvitationInput,
) {
  const mobile = input.parentMobile?.trim() || null;
  const email = input.parentEmail?.trim().toLowerCase() || null;
  if (!mobile && !email) {
    throw Object.assign(new Error('Parent mobile or email is required'), { statusCode: 400 });
  }

  const { rows: [parent] } = await client.query<ParentIdentityRow>(
    `SELECT id,name,mobile,email FROM users
     WHERE role='PARENT'
       AND ((mobile IS NOT NULL AND mobile=$1) OR (email IS NOT NULL AND LOWER(email)=LOWER($2)))
     LIMIT 1`,
    [mobile || '', email || ''],
  );

  const values = [
    studentId,
    parent?.id || null,
    input.parentName?.trim() || parent?.name || null,
    mobile || parent?.mobile || null,
    email || parent?.email || null,
    input.parentRelation || 'PARENT',
    studentUserId,
  ];

  if (parent) {
    const { rows: [request] } = await client.query(
      `INSERT INTO parent_link_requests
         (student_id,parent_user_id,parent_name,parent_mobile,parent_email,relation,status,
          initiated_by,requested_by_user_id,student_confirmed_at)
       VALUES($1,$2,$3,$4,$5,$6,'AWAITING_PARENT','STUDENT',$7,NOW())
       ON CONFLICT (parent_user_id,student_id)
         WHERE status IN ('PENDING','AWAITING_STUDENT','AWAITING_PARENT') AND parent_user_id IS NOT NULL
       DO UPDATE SET parent_name=EXCLUDED.parent_name,parent_mobile=EXCLUDED.parent_mobile,
                     parent_email=EXCLUDED.parent_email,relation=EXCLUDED.relation,
                     status='AWAITING_PARENT',initiated_by='STUDENT',requested_by_user_id=$7,
                     student_confirmed_at=NOW(),updated_at=NOW()
       RETURNING *`,
      values,
    );
    return request;
  }

  const { rows: [request] } = await client.query(
    `INSERT INTO parent_link_requests
       (student_id,parent_user_id,parent_name,parent_mobile,parent_email,relation,status,
        initiated_by,requested_by_user_id,student_confirmed_at)
     VALUES($1,$2,$3,$4,$5,$6,'AWAITING_PARENT','STUDENT',$7,NOW())
     RETURNING *`,
    values,
  );
  return request;
}

export async function createStudentParentInvitation(
  studentId: UUID,
  studentUserId: UUID,
  input: StudentParentInvitationInput,
) {
  return transaction((client) => insertStudentParentInvitation(client, studentId, studentUserId, input));
}

export async function createStudentParentInvitationForUser(
  studentUserId: UUID,
  input: StudentParentInvitationInput,
) {
  return transaction(async (client) => {
    const { rows: [student] } = await client.query<{ id: UUID } & QueryResultRow>(
      'SELECT id FROM students WHERE user_id=$1 LIMIT 1',
      [studentUserId],
    );
    if (!student) throw Object.assign(new Error('Student profile not found'), { statusCode: 404 });
    return insertStudentParentInvitation(client, student.id, studentUserId, input);
  });
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

export async function getParentLinkRequests(parentUserId: UUID) {
  return transaction(async (client) => {
    const { rows: [parent] } = await client.query<ParentIdentityRow>(
      "SELECT id,name,mobile,email FROM users WHERE id=$1 AND role='PARENT'",
      [parentUserId],
    );
    if (!parent) throw Object.assign(new Error('Parent account not found'), { statusCode: 404 });

    await client.query(
      `UPDATE parent_link_requests
       SET parent_user_id=$1,claimed_at=COALESCE(claimed_at,NOW()),updated_at=NOW()
       WHERE parent_user_id IS NULL
         AND status='AWAITING_PARENT'
         AND ((parent_mobile IS NOT NULL AND parent_mobile=$2)
           OR (parent_email IS NOT NULL AND LOWER(parent_email)=LOWER($3)))`,
      [parent.id, parent.mobile || '', parent.email || ''],
    );

    const { rows } = await client.query(
      `SELECT plr.id,plr.status,plr.initiated_by,plr.relation,plr.parent_name,
              plr.student_confirmed_at,plr.parent_confirmed_at,plr.created_at,
              s.student_code,u.name AS student_name,s.grade_level,
              sch.name AS school_name
       FROM parent_link_requests plr
       JOIN students s ON s.id=plr.student_id
       JOIN users u ON u.id=s.user_id
       LEFT JOIN schools sch ON sch.id=s.school_id
       WHERE plr.parent_user_id=$1
         AND plr.status IN ('PENDING','AWAITING_PARENT','AWAITING_STUDENT')
       ORDER BY plr.created_at DESC`,
      [parentUserId],
    );
    return rows;
  });
}

export async function reviewParentLinkRequest(
  parentUserId: UUID,
  requestId: UUID,
  action: 'APPROVE' | 'REJECT',
) {
  return transaction(async (client) => {
    const { rows: [parent] } = await client.query<ParentIdentityRow>(
      "SELECT id,name,mobile,email FROM users WHERE id=$1 AND role='PARENT'",
      [parentUserId],
    );
    if (!parent) throw Object.assign(new Error('Parent account not found'), { statusCode: 404 });

    const { rows: [request] } = await client.query<ParentLinkRow>(
      `SELECT * FROM parent_link_requests
       WHERE id=$1
         AND status IN ('PENDING','AWAITING_PARENT')
         AND ((parent_user_id=$2)
           OR (parent_user_id IS NULL AND parent_mobile=$3)
           OR (parent_user_id IS NULL AND parent_email IS NOT NULL AND LOWER(parent_email)=LOWER($4)))
       FOR UPDATE`,
      [requestId, parentUserId, parent.mobile || '', parent.email || ''],
    );
    if (!request) throw Object.assign(new Error('Parent invitation not found or not awaiting your confirmation'), { statusCode: 404 });

    if (action === 'REJECT') {
      const { rows: [rejected] } = await client.query(
        `UPDATE parent_link_requests
         SET parent_user_id=$2,status='REJECTED',parent_confirmed_at=NOW(),reviewed_at=NOW(),reviewed_by=$2,updated_at=NOW()
         WHERE id=$1 RETURNING *`,
        [requestId, parentUserId],
      );
      return rejected;
    }

    await client.query(
      `INSERT INTO parent_student_links(parent_user_id,student_id,relation,is_primary)
       VALUES($1,$2,$3,TRUE)
       ON CONFLICT(parent_user_id,student_id)
       DO UPDATE SET relation=EXCLUDED.relation`,
      [parentUserId, request.student_id, request.relation || 'PARENT'],
    );
    const { rows: [approved] } = await client.query(
      `UPDATE parent_link_requests
       SET parent_user_id=$2,status='APPROVED',parent_confirmed_at=NOW(),claimed_at=COALESCE(claimed_at,NOW()),
           reviewed_at=NOW(),reviewed_by=$2,updated_at=NOW()
       WHERE id=$1 RETURNING *`,
      [requestId, parentUserId],
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
