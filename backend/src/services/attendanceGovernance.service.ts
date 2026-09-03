import type { QueryResultRow } from 'pg';
import type { UUID } from '@vidyasetu/contracts';
import { query } from '../config/db';
import * as schoolService from './school.service';
import { resolveAttendanceRecords, type AttendanceCandidate } from './absenceCalendar.service';

interface ClosedDayRow extends QueryResultRow { title: string; }

export async function getRoster(schoolId: UUID, classId: UUID, date: string) {
  const { rows } = await query(
    `SELECT st.id,st.student_code,st.roll_number,u.name,
            COALESCE(a.status::text,
              CASE WHEN lr.id IS NOT NULL THEN 'EXCUSED' ELSE '' END) AS attendance_status,
            COALESCE(a.remark,CASE WHEN lr.id IS NOT NULL THEN 'Approved leave' ELSE NULL END) AS remark,
            (lr.id IS NOT NULL) AS approved_leave,
            lr.id AS leave_request_id,lr.reason AS leave_reason
     FROM students st
     JOIN users u ON u.id=st.user_id
     JOIN school_classes sc ON sc.id=st.class_id AND sc.school_id=$1
     LEFT JOIN attendance a ON a.student_id=st.id AND a.date=$3::date
     LEFT JOIN LATERAL (
       SELECT l.id,l.reason FROM student_leave_requests l
       WHERE l.student_id=st.id AND l.school_id=$1 AND l.status='APPROVED'
         AND $3::date BETWEEN l.start_date AND l.end_date
       ORDER BY l.reviewed_at DESC NULLS LAST LIMIT 1
     ) lr ON TRUE
     WHERE st.school_id=$1 AND st.class_id=$2 AND st.status='ACTIVE' AND st.school_link_status='APPROVED'
     ORDER BY st.roll_number NULLS LAST,u.name`,
    [schoolId, classId, date],
  );
  const { rows: [closed] } = await query<ClosedDayRow>(
    `SELECT sce.title FROM school_calendar_events sce
     WHERE sce.school_id=$1 AND sce.is_active=TRUE AND sce.is_school_closed=TRUE
       AND $3::date BETWEEN sce.start_date AND sce.end_date
       AND (NOT EXISTS (SELECT 1 FROM school_calendar_event_classes x WHERE x.event_id=sce.id)
            OR EXISTS (SELECT 1 FROM school_calendar_event_classes y WHERE y.event_id=sce.id AND y.class_id=$2))
     ORDER BY sce.start_date LIMIT 1`,
    [schoolId, classId, date],
  );
  return rows.map((row) => ({ ...row, school_closed: Boolean(closed), closure_title: closed?.title || null }));
}

export async function getSummary(schoolId: UUID, date: string) {
  const { rows } = await query(
    `SELECT sc.id,sc.class_name,sc.section,
            COUNT(st.id) FILTER(WHERE st.status='ACTIVE' AND st.school_link_status='APPROVED')::INT AS total_students,
            COUNT(a.id) FILTER(WHERE a.status='PRESENT')::INT AS present,
            COUNT(a.id) FILTER(WHERE a.status='ABSENT')::INT AS absent,
            COUNT(a.id) FILTER(WHERE a.status='LATE')::INT AS late,
            COUNT(a.id) FILTER(WHERE a.status='HALF_DAY')::INT AS half_day,
            COUNT(a.id) FILTER(WHERE a.status='EXCUSED')::INT AS excused,
            COUNT(a.id) FILTER(WHERE a.status='HOLIDAY')::INT AS holiday
     FROM school_classes sc
     LEFT JOIN students st ON st.class_id=sc.id
     LEFT JOIN attendance a ON a.student_id=st.id AND a.date=$2::date
     WHERE sc.school_id=$1 AND COALESCE(sc.is_active,TRUE)=TRUE
     GROUP BY sc.id ORDER BY sc.class_name,sc.section`,
    [schoolId, date],
  );
  return rows;
}

export async function mark(
  schoolId: UUID,
  classId: UUID,
  date: string,
  records: AttendanceCandidate[],
  markedBy: UUID,
) {
  const resolved = await resolveAttendanceRecords(schoolId, classId, date, records);
  return schoolService.markAttendance(schoolId, classId, date, resolved, markedBy);
}
