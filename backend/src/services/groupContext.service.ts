import type { QueryResultRow } from 'pg';
import type { UserRole, UUID } from '@vidyasetu/contracts';
import { query } from '../config/db';

interface ContextRow extends QueryResultRow {
  school_id: UUID | null;
  school_name: string | null;
  class_id: UUID | null;
  class_name: string | null;
  section: string | null;
}

export interface GroupContextSchool {
  id: UUID;
  name: string;
}

export interface GroupContextClass {
  id: UUID;
  schoolId: UUID;
  className: string;
  section: string | null;
}

export async function getCreationContext(userId: UUID, role: UserRole) {
  let rows: ContextRow[] = [];

  if (role === 'STUDENT') {
    ({ rows } = await query<ContextRow>(
      `SELECT s.school_id, sch.name AS school_name, s.class_id, sc.class_name, sc.section
       FROM students s
       JOIN schools sch ON sch.id = s.school_id
       JOIN school_classes sc ON sc.id = s.class_id
       WHERE s.user_id = $1 AND s.status = 'ACTIVE'`,
      [userId],
    ));
  } else if (role === 'PARENT') {
    ({ rows } = await query<ContextRow>(
      `SELECT DISTINCT s.school_id, sch.name AS school_name, s.class_id, sc.class_name, sc.section
       FROM parent_student_links psl
       JOIN students s ON s.id = psl.student_id
       JOIN schools sch ON sch.id = s.school_id
       JOIN school_classes sc ON sc.id = s.class_id
       WHERE psl.parent_user_id = $1 AND s.status = 'ACTIVE'
       ORDER BY sch.name, sc.class_name, sc.section`,
      [userId],
    ));
  } else if (role === 'TEACHER') {
    ({ rows } = await query<ContextRow>(
      `SELECT DISTINCT t.school_id, sch.name AS school_name, ta.class_id, sc.class_name, sc.section
       FROM teachers t
       JOIN schools sch ON sch.id = t.school_id
       LEFT JOIN teacher_assignments ta ON ta.teacher_id = t.id
       LEFT JOIN school_classes sc ON sc.id = ta.class_id
       WHERE t.user_id = $1 AND t.status IN ('ACTIVE','ON_LEAVE')
       ORDER BY sch.name, sc.class_name NULLS LAST, sc.section NULLS LAST`,
      [userId],
    ));
  } else if (role === 'SCHOOL_ADMIN') {
    ({ rows } = await query<ContextRow>(
      `SELECT s.id AS school_id, s.name AS school_name, sc.id AS class_id, sc.class_name, sc.section
       FROM schools s
       LEFT JOIN school_classes sc ON sc.school_id = s.id AND sc.is_active = TRUE
       WHERE s.admin_user_id = $1
       ORDER BY sc.class_name NULLS LAST, sc.section NULLS LAST`,
      [userId],
    ));
  }

  const schoolMap = new Map<UUID, GroupContextSchool>();
  const classMap = new Map<UUID, GroupContextClass>();
  for (const row of rows) {
    if (row.school_id && row.school_name) schoolMap.set(row.school_id, { id: row.school_id, name: row.school_name });
    if (row.class_id && row.school_id && row.class_name) {
      classMap.set(row.class_id, {
        id: row.class_id,
        schoolId: row.school_id,
        className: row.class_name,
        section: row.section,
      });
    }
  }

  const allowedKinds = role === 'STUDENT'
    ? ['STUDENT']
    : role === 'PARENT'
      ? ['PARENT']
      : role === 'TEACHER'
        ? ['TEACHER', 'MIXED']
        : role === 'SCHOOL_ADMIN'
          ? ['MIXED']
          : [];

  return {
    allowedKinds,
    allowedScopes: ['PRIVATE', 'SCHOOL', 'CLASS'],
    schools: [...schoolMap.values()],
    classes: [...classMap.values()],
  };
}
