import type { QueryResultRow } from 'pg';
import { query } from '../config/db';

interface CountRow extends QueryResultRow {
  students: string;
  schools: string;
  teachers: string;
  parents: string;
  groups: string;
  competitions: string;
}

interface PublicSchoolRow extends QueryResultRow {
  id: string;
  name: string;
  name_hi: string | null;
  board: string | null;
  city: string | null;
  district: string | null;
  state: string;
  academic_year: string;
  website: string | null;
  udise_code: string | null;
  student_count: string;
  teacher_count: string;
  class_count: string;
}

export interface PublicOverview {
  students: number;
  schools: number;
  teachers: number;
  parents: number;
  groups: number;
  competitions: number;
  generatedAt: string;
}

export interface PublicSchool {
  id: string;
  name: string;
  nameHi: string | null;
  board: string | null;
  city: string | null;
  district: string | null;
  state: string;
  academicYear: string;
  website: string | null;
  isUdiseLinked: boolean;
  students: number;
  teachers: number;
  classes: number;
}

export async function getPublicOverview(): Promise<PublicOverview> {
  const { rows: [row] } = await query<CountRow>(
    `SELECT
       (SELECT COUNT(*) FROM students WHERE status = 'ACTIVE')::text AS students,
       (SELECT COUNT(*) FROM schools WHERE status = 'ACTIVE')::text AS schools,
       (SELECT COUNT(*) FROM teachers WHERE status IN ('ACTIVE','ON_LEAVE'))::text AS teachers,
       (SELECT COUNT(*) FROM users WHERE role = 'PARENT' AND status = 'ACTIVE')::text AS parents,
       (SELECT COUNT(*) FROM collaboration_groups WHERE status = 'ACTIVE')::text AS groups,
       (SELECT COUNT(*) FROM exams
          WHERE type IN ('OLYMPIAD','MOCK','PRACTICE')
            AND status IN ('REGISTRATION_OPEN','REGISTRATION_CLOSED','LIVE','SCORING','COMPLETED'))::text AS competitions`,
  );

  return {
    students: Number(row?.students || 0),
    schools: Number(row?.schools || 0),
    teachers: Number(row?.teachers || 0),
    parents: Number(row?.parents || 0),
    groups: Number(row?.groups || 0),
    competitions: Number(row?.competitions || 0),
    generatedAt: new Date().toISOString(),
  };
}

export async function listPublicSchools(): Promise<PublicSchool[]> {
  const { rows } = await query<PublicSchoolRow>(
    `SELECT
       s.id,
       s.name,
       s.name_hi,
       s.board::text AS board,
       s.city,
       s.district,
       s.state,
       s.academic_year,
       s.website,
       s.udise_code,
       (SELECT COUNT(*) FROM students st
          WHERE st.school_id = s.id AND st.status = 'ACTIVE')::text AS student_count,
       (SELECT COUNT(*) FROM teachers t
          WHERE t.school_id = s.id AND t.status IN ('ACTIVE','ON_LEAVE'))::text AS teacher_count,
       (SELECT COUNT(*) FROM school_classes sc
          WHERE sc.school_id = s.id)::text AS class_count
     FROM schools s
     WHERE s.status = 'ACTIVE'
     ORDER BY s.name ASC
     LIMIT 100`,
  );

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    nameHi: row.name_hi,
    board: row.board,
    city: row.city,
    district: row.district,
    state: row.state,
    academicYear: row.academic_year,
    website: row.website,
    isUdiseLinked: Boolean(row.udise_code),
    students: Number(row.student_count || 0),
    teachers: Number(row.teacher_count || 0),
    classes: Number(row.class_count || 0),
  }));
}
