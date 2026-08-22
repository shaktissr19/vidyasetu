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

export interface PublicOverview {
  students: number;
  schools: number;
  teachers: number;
  parents: number;
  groups: number;
  competitions: number;
  generatedAt: string;
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
