import type { QueryResultRow } from 'pg';
import type { UUID } from '@vidyasetu/contracts';
import { query } from '../config/db';

interface ChildContextRow extends QueryResultRow {
  id: UUID;
  school_id: UUID | null;
  class_id: UUID | null;
  school_link_status: string;
  class_name: string;
  name: string;
}

function appError(message: string, statusCode: number): Error & { statusCode: number } {
  return Object.assign(new Error(message), { statusCode });
}

async function linkedChild(parentUserId: UUID, studentId: UUID): Promise<ChildContextRow> {
  const { rows: [child] } = await query<ChildContextRow>(
    `SELECT s.id, s.school_id, s.class_id, s.school_link_status,
            COALESCE(sc.class_name, s.grade_level) AS class_name,
            u.name
     FROM parent_student_links psl
     JOIN students s ON s.id = psl.student_id
     JOIN users u ON u.id = s.user_id
     LEFT JOIN school_classes sc ON sc.id = s.class_id
     WHERE psl.parent_user_id = $1 AND s.id = $2 AND s.status = 'ACTIVE'
     LIMIT 1`,
    [parentUserId, studentId],
  );
  if (!child) throw appError('Access denied to this student', 403);
  return child;
}

export async function getChildHomework(parentUserId: UUID, studentId: UUID) {
  const child = await linkedChild(parentUserId, studentId);
  if (child.school_link_status !== 'APPROVED' || !child.school_id || !child.class_id) {
    return { student: { id: child.id, name: child.name }, items: [], summary: { pending: 0, submitted: 0, reviewed: 0, overdue: 0 } };
  }

  const { rows } = await query(
    `SELECT ha.id, ha.title, ha.description, ha.instructions, ha.attachment_url,
            ha.subject_code, sub.name AS subject_name, sub.name_hi AS subject_name_hi,
            ha.due_at, ha.max_marks, ha.status, ha.published_at,
            hs.id AS submission_id, hs.status AS submission_status, hs.submitted_at,
            hs.marks_awarded, hs.feedback, hs.reviewed_at,
            CASE
              WHEN hs.id IS NULL AND ha.due_at < NOW() THEN 'OVERDUE'
              WHEN hs.id IS NULL THEN 'PENDING'
              WHEN hs.status IN ('REVIEWED','RETURNED') THEN 'REVIEWED'
              ELSE 'SUBMITTED'
            END AS learner_status
     FROM homework_assignments ha
     LEFT JOIN subjects sub ON sub.code = ha.subject_code
     LEFT JOIN homework_submissions hs ON hs.homework_id = ha.id AND hs.student_id = $3
     WHERE ha.school_id = $1 AND ha.class_id = $2
       AND ha.status IN ('PUBLISHED','CLOSED')
     ORDER BY
       CASE WHEN hs.id IS NULL AND ha.due_at >= NOW() THEN 0
            WHEN hs.id IS NULL THEN 1 ELSE 2 END,
       ha.due_at DESC, ha.created_at DESC`,
    [child.school_id, child.class_id, child.id],
  );

  const summary = rows.reduce((acc, row) => {
    const status = String(row.learner_status || 'PENDING').toLowerCase();
    if (status === 'pending') acc.pending += 1;
    else if (status === 'submitted') acc.submitted += 1;
    else if (status === 'reviewed') acc.reviewed += 1;
    else if (status === 'overdue') acc.overdue += 1;
    return acc;
  }, { pending: 0, submitted: 0, reviewed: 0, overdue: 0 });

  return {
    student: { id: child.id, name: child.name, className: child.class_name },
    items: rows,
    summary,
  };
}

export async function getChildCompetitionsAndAchievements(parentUserId: UUID, studentId: UUID) {
  const child = await linkedChild(parentUserId, studentId);
  const { rows } = await query(
    `SELECT e.id AS exam_id, e.title, e.title_hi, e.type, e.status,
            e.start_time, e.end_time, e.results_at, e.prize_pool,
            e.subject_codes, e.class_names,
            ea.id AS attempt_id, ea.status AS attempt_status,
            ea.total_marks,
            (e.total_questions * e.marks_per_question) AS max_marks,
            ROUND(CASE WHEN e.total_questions > 0 AND e.marks_per_question > 0 AND ea.total_marks IS NOT NULL
              THEN (ea.total_marks / (e.total_questions * e.marks_per_question)) * 100 ELSE NULL END, 1) AS percentage,
            ea.rank_school, ea.rank_overall, ea.submitted_at
     FROM exams e
     LEFT JOIN exam_attempts ea ON ea.exam_id = e.id AND ea.student_id = $1
     WHERE e.type IN ('OLYMPIAD','MOCK','PRACTICE')
       AND e.status IN ('REGISTRATION_OPEN','REGISTRATION_CLOSED','LIVE','SCORING','COMPLETED')
       AND (COALESCE(array_length(e.class_names, 1), 0) = 0 OR $2 = ANY(e.class_names))
       AND (e.school_id IS NULL OR e.school_id = $3)
     ORDER BY e.start_time DESC
     LIMIT 100`,
    [child.id, child.class_name, child.school_id],
  );

  const achievements = rows.filter((row) =>
    String(row.attempt_status || '').toUpperCase() === 'SCORED'
    || row.rank_school != null
    || row.rank_overall != null,
  );

  return {
    student: { id: child.id, name: child.name, className: child.class_name },
    competitions: rows,
    achievements,
  };
}
