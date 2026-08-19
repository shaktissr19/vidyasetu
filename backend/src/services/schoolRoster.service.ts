import type { QueryResultRow } from 'pg';
import type { UUID } from '@vidyasetu/contracts';
import { query } from '../config/db';
import { getPagination, paginationMeta, type PaginationMeta } from '../utils/paginate';

interface RosterPaginationQuery {
  page?: unknown;
  limit?: unknown;
}

interface RosterFilters {
  status?: string;
  classId?: UUID;
  search?: string;
}

export interface ApprovedStudentRow extends QueryResultRow {
  id: UUID;
  student_code: string;
  roll_number: string | null;
  grade_level: string | null;
  school_link_status: string;
  name: string;
  username: string | null;
  email: string | null;
  mobile: string;
  class_name: string | null;
  section: string | null;
  attendance_pct: number | string | null;
  fee_status: string | null;
}

interface CountRow extends QueryResultRow {
  count: string;
}

interface RosterCountsRow extends QueryResultRow {
  approved_students: string | number;
  pending_requests: string | number;
}

export async function getApprovedStudents(
  schoolId: UUID,
  paginationQuery: RosterPaginationQuery,
  filters: RosterFilters = {},
): Promise<{ students: ApprovedStudentRow[]; meta: PaginationMeta }> {
  const { limit, offset, page } = getPagination(paginationQuery);
  const conditions = [
    'st.school_id = $1',
    "st.school_link_status = 'APPROVED'",
    'st.status = $2',
  ];
  const params: unknown[] = [schoolId, filters.status || 'ACTIVE'];
  let i = 3;

  if (filters.classId) {
    conditions.push(`st.class_id = $${i++}`);
    params.push(filters.classId);
  }
  if (filters.search) {
    conditions.push(`(u.name ILIKE $${i} OR u.username ILIKE $${i} OR sT.student_code ILIKE $${i})`);
    params.push(`%${filters.search}%`);
    i += 1;
  }

  const where = conditions.join(' AND ');
  const [{ rows }, { rows: [countRow] }] = await Promise.all([
    query<ApprovedStudentRow>(
      `SELECT st.id, st.student_code, st.roll_number, st.grade_level, st.school_link_status,
              u.name, u.username, u.email, u.mobile,
              sc.class_name, sc.section,
              ams.percentage AS attendance_pct,
              fi.status AS fee_status
       FROM students st
       JOIN users u ON u.id = st.user_id
       LEFT JOIN school_classes sc ON sc.id = st.class_id
       LEFT JOIN attendance_monthly_summary ams ON ams.student_id = st.id
         AND ams.year = EXTRACT(YEAR FROM NOW()) AND ams.month = EXTRACT(MONTH FROM NOW())
       LEFT JOIN fee_invoices fi ON fi.student_id = st.id
         AND fi.academic_year = st.academic_year AND fi.term = 1
       WHERE ${where}
       ORDER BY sc.class_name NULLS LAST, sc.section NULLS LAST, st.roll_number NULLS LAST, u.name
       LIMIT $${i} OFFSET $${i + 1}`.replace('sT.student_code', 'st.student_code'),
      [...params, limit, offset],
    ),
    query<CountRow>(
      `SELECT COUNT(*) FROM students st JOIN users u ON u.id = st.user_id WHERE ${where}`
        .replace('sT.student_code', 'st.student_code'),
      params,
    ),
  ]);

  const total = Number.parseInt(countRow?.count || '0', 10);
  return { students: rows, meta: paginationMeta(total, page, limit) };
}

export async function getRosterCounts(schoolId: UUID): Promise<{
  approvedStudents: number;
  pendingRequests: number;
}> {
  const { rows: [row] } = await query<RosterCountsRow>(
    `SELECT
       COUNT(*) FILTER (WHERE school_link_status = 'APPROVED' AND status = 'ACTIVE') AS approved_students,
       (SELECT COUNT(*) FROM student_school_requests WHERE requested_school_id = $1 AND status = 'PENDING') AS pending_requests
     FROM students
     WHERE school_id = $1`,
    [schoolId],
  );
  return {
    approvedStudents: Number(row?.approved_students || 0),
    pendingRequests: Number(row?.pending_requests || 0),
  };
}
