import type { NextFunction, Request, Response } from 'express';
import type { QueryResultRow } from 'pg';
import { query } from '../config/db';
import * as R from '../utils/response';

interface TargetRow extends QueryResultRow {
  class_id: string;
  class_name: string;
  section: string | null;
  subject_code: string;
  subject_name: string;
}

export async function getTargets(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const user = req.user;
    if (!user) return R.unauthorized(res);
    if (!user.schoolId) return R.forbidden(res, 'School context is required');

    if (user.role === 'TEACHER') {
      if (!user.teacherId) return R.forbidden(res, 'Teacher context is required');
      const { rows } = await query<TargetRow>(
        `SELECT DISTINCT sc.id AS class_id,sc.class_name,sc.section,
                ta.subject_code,COALESCE(sub.name,ta.subject_code) AS subject_name
         FROM teacher_assignments ta
         JOIN school_classes sc ON sc.id=ta.class_id AND sc.school_id=ta.school_id
         LEFT JOIN subjects sub ON sub.code=ta.subject_code
         WHERE ta.teacher_id=$1 AND ta.school_id=$2 AND sc.is_active=TRUE
         ORDER BY sc.class_name,sc.section,ta.subject_code`,
        [user.teacherId, user.schoolId],
      );
      return R.ok(res, rows);
    }

    const { rows } = await query<TargetRow>(
      `SELECT sc.id AS class_id,sc.class_name,sc.section,
              sub.code AS subject_code,sub.name AS subject_name
       FROM school_classes sc
       CROSS JOIN subjects sub
       WHERE sc.school_id=$1 AND sc.is_active=TRUE AND sub.is_active=TRUE
       ORDER BY sc.class_name,sc.section,sub.sort_order,sub.name`,
      [user.schoolId],
    );
    return R.ok(res, rows);
  } catch (err: unknown) { next(err); }
}
