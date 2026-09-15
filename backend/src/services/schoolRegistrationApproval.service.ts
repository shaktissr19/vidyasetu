import type { QueryResultRow } from 'pg';
import type { UUID } from '@vidyasetu/contracts';
import { transaction } from '../config/db';

interface SchoolApprovalRow extends QueryResultRow {
  id: UUID;
  admin_user_id: UUID;
  status: string;
  name: string;
}

export async function updateSchoolVerificationStatus(
  schoolId: UUID,
  status: 'ACTIVE' | 'SUSPENDED' | 'PENDING',
  adminId: UUID,
) {
  return transaction(async (client) => {
    const { rows: [current] } = await client.query<SchoolApprovalRow>(
      'SELECT id,admin_user_id,status,name FROM schools WHERE id=$1 FOR UPDATE',
      [schoolId],
    );
    if (!current) throw Object.assign(new Error('School not found'), { statusCode: 404 });

    const { rows: [school] } = await client.query<SchoolApprovalRow>(
      `UPDATE schools SET status=$2,updated_at=NOW()
       WHERE id=$1 RETURNING id,admin_user_id,status,name`,
      [schoolId, status],
    );
    if (!school) throw new Error('School status update returned no row');

    await client.query(
      `UPDATE users SET status=$2,updated_at=NOW()
       WHERE id=$1 AND role='SCHOOL_ADMIN'`,
      [current.admin_user_id, status],
    );

    if (current.status !== status) {
      await client.query(
        `INSERT INTO audit_log(actor_id,actor_role,school_id,action,entity_type,entity_id,old_value,new_value)
         VALUES($1,'SUPER_ADMIN',$2,$3,'school',$2,$4,$5)`,
        [adminId, schoolId, `SCHOOL_${status}`,
         JSON.stringify({ status: current.status }), JSON.stringify({ status })],
      );
    }

    return school;
  });
}
