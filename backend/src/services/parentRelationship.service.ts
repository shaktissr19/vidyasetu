import type { QueryResultRow } from 'pg';
import type { UUID } from '@vidyasetu/contracts';
import { transaction } from '../config/db';

interface ParentRow extends QueryResultRow {
  id: UUID;
  name: string | null;
  mobile: string;
  email: string | null;
}

interface StudentRow extends QueryResultRow {
  id: UUID;
  student_code: string;
}

export async function requestChildLink(
  parentUserId: UUID,
  studentCode: string,
  relation: 'FATHER' | 'MOTHER' | 'GUARDIAN' | 'PARENT' = 'PARENT',
) {
  return transaction(async (client) => {
    const { rows: [parent] } = await client.query<ParentRow>(
      "SELECT id,name,mobile,email FROM users WHERE id=$1 AND role='PARENT' AND status='ACTIVE' LIMIT 1",
      [parentUserId],
    );
    if (!parent) throw Object.assign(new Error('Active Parent account not found'), { statusCode: 404 });

    const { rows: [student] } = await client.query<StudentRow>(
      'SELECT id,student_code FROM students WHERE UPPER(student_code)=UPPER($1) LIMIT 1',
      [studentCode.trim()],
    );
    if (!student) {
      // Do not reveal any Student details when the code is invalid.
      throw Object.assign(new Error('Student ID was not found'), { statusCode: 404 });
    }

    const { rows: linked } = await client.query(
      'SELECT 1 FROM parent_student_links WHERE parent_user_id=$1 AND student_id=$2 LIMIT 1',
      [parentUserId, student.id],
    );
    if (linked.length) {
      throw Object.assign(new Error('This child is already connected to your Parent account'), { statusCode: 409 });
    }

    const { rows: [request] } = await client.query(
      `INSERT INTO parent_link_requests
         (student_id,parent_user_id,parent_name,parent_mobile,parent_email,relation,status,
          initiated_by,requested_by_user_id,parent_confirmed_at,claimed_at)
       VALUES($1,$2,$3,$4,$5,$6,'AWAITING_STUDENT','PARENT',$2,NOW(),NOW())
       ON CONFLICT (parent_user_id,student_id)
         WHERE status IN ('PENDING','AWAITING_STUDENT','AWAITING_PARENT') AND parent_user_id IS NOT NULL
       DO UPDATE SET relation=EXCLUDED.relation,status='AWAITING_STUDENT',initiated_by='PARENT',
                     requested_by_user_id=$2,parent_confirmed_at=NOW(),updated_at=NOW()
       RETURNING id,student_id,status,initiated_by,relation,created_at`,
      [student.id, parent.id, parent.name, parent.mobile, parent.email, relation],
    );

    return {
      ...request,
      relationshipStatus: 'PENDING_STUDENT_CONFIRMATION',
      message: 'Relationship request sent. Child access activates only after the Student confirms it.',
    };
  });
}
