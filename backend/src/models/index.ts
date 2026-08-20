import type { PoolClient, QueryResultRow } from 'pg';
import type { UUID } from '@vidyasetu/contracts';
import { query, transaction } from '../config/db';

type PlainRow = QueryResultRow & Record<string, unknown>;
interface IdRow extends QueryResultRow { id: UUID; }
interface CountRow extends QueryResultRow { count: string; }
interface InvoiceRow extends PlainRow { id: UUID; school_id: UUID; student_id: UUID; }
interface BadgeCriteriaRow extends QueryResultRow {
  code: string;
  criteria_type: string;
  criteria_value: number;
}
interface StreakRow extends QueryResultRow { streak_count: number; }

export interface UserCreateInput {
  mobile: string;
  name?: string | null;
  role?: string;
  language?: string;
}
export interface UserListInput { role?: string; status?: string; limit?: number; offset?: number; }
export type UserProfileFields = Record<string, unknown>;

export interface StudentListInput {
  schoolId: UUID;
  classId?: UUID;
  search?: string;
  status?: string;
  limit?: number;
  offset?: number;
}
export interface StudentCreateInput {
  userId: UUID;
  schoolId: UUID;
  classId: UUID;
  rollNumber?: string | null;
  dob?: string | null;
  gender?: string | null;
  language?: string;
  academicYear?: string;
}
export interface LeaderboardInput { schoolId: UUID; classId?: UUID; limit?: number; }

export interface SchoolListInput {
  status?: string;
  plan?: string;
  state?: string;
  limit?: number;
  offset?: number;
}
export interface SchoolCreateInput {
  name: string;
  adminUserId: UUID;
  city?: string | null;
  district?: string | null;
  state: string;
  pincode?: string | null;
  mobile?: string | null;
  email?: string | null;
  udiseCode?: string | null;
}
export interface TeacherCreateInput {
  userId: UUID;
  schoolId: UUID;
  employeeId?: string | null;
  qualification?: string | null;
  experienceYrs?: number;
}
export interface AttendanceRecordInput {
  studentId: UUID;
  status: string;
  remark?: string | null;
}
export interface AttendanceBulkInput {
  classId: UUID;
  schoolId: UUID;
  date: string;
  records: AttendanceRecordInput[];
  markedBy: UUID;
}

export interface FeeInvoiceListInput {
  schoolId: UUID;
  academicYear?: string;
  term?: number;
  status?: string;
  limit?: number;
  offset?: number;
}
export interface FeePaymentInput {
  invoiceId: UUID;
  schoolId: UUID;
  studentId: UUID;
  amount: number;
  mode: string;
  razorpayPaymentId?: string | null;
  transactionRef?: string | null;
  collectedBy?: UUID | null;
  notes?: string | null;
}

export interface ContentProgressInput {
  progressPct: number;
  isCompleted: boolean;
  quizScore?: number | null;
}
export interface ExamListInput {
  schoolId: UUID;
  classNames?: string[];
  status?: string;
  limit?: number;
}
export interface XPEventInput {
  studentId: UUID;
  eventType: string;
  xpAmount: number;
  referenceId?: UUID | null;
  referenceType?: string | null;
  description?: string | null;
}
export interface BadgeContext {
  xpTotal: number;
  streakCurrent: number;
  lessonsCount: number;
}
export interface NotificationSaveInput {
  userId: UUID;
  schoolId?: UUID | null;
  type: string;
  channel?: string;
  title: string;
  body: string;
  referenceId?: UUID | null;
  referenceType?: string | null;
}
export interface TimetablePeriodInput {
  schoolId: UUID;
  teacherId?: UUID | null;
  subjectCode?: string | null;
  day: string;
  periodNumber: number;
  startTime: string;
  endTime: string;
  isBreak?: boolean;
  breakLabel?: string | null;
}

export const UserModel = {
  findByMobile: (mobile: string) =>
    query<PlainRow>('SELECT * FROM users WHERE mobile = $1', [mobile]).then((r) => r.rows[0]),

  findById: (id: UUID) =>
    query<PlainRow>(
      'SELECT id,name,mobile,role,status,language,profile_photo,last_login_at,created_at FROM users WHERE id=$1',
      [id],
    ).then((r) => r.rows[0]),

  create: ({ mobile, name = null, role = 'STUDENT', language = 'hi' }: UserCreateInput) =>
    query<PlainRow>(
      'INSERT INTO users (mobile,name,role,language) VALUES ($1,$2,$3,$4) RETURNING *',
      [mobile, name || `User ${mobile.slice(-4)}`, role, language],
    ).then((r) => r.rows[0]),

  updateLastLogin: (id: UUID) => query('UPDATE users SET last_login_at=NOW() WHERE id=$1', [id]),

  updateProfile: (id: UUID, fields: UserProfileFields) => {
    const keys = Object.keys(fields).filter((key) => fields[key] !== undefined);
    if (!keys.length) return Promise.resolve<PlainRow | null>(null);
    const sets = keys.map((key, index) => `${key}=$${index + 1}`).join(',');
    const values = keys.map((key) => fields[key]);
    return query<PlainRow>(
      `UPDATE users SET ${sets},updated_at=NOW() WHERE id=$${keys.length + 1} RETURNING id,name,language,profile_photo`,
      [...values, id],
    ).then((r) => r.rows[0]);
  },

  updateStatus: (id: UUID, status: string) =>
    query('UPDATE users SET status=$1,updated_at=NOW() WHERE id=$2', [status, id]),

  list: ({ role, status, limit = 50, offset = 0 }: UserListInput) => {
    const conditions = ['1=1'];
    const values: unknown[] = [];
    if (role) { conditions.push(`role=$${values.length + 1}`); values.push(role); }
    if (status) { conditions.push(`status=$${values.length + 1}`); values.push(status); }
    values.push(limit, offset);
    return query<PlainRow>(
      `SELECT id,name,mobile,role,status,language,last_login_at,created_at FROM users WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values,
    ).then((r) => r.rows);
  },
};

export const StudentModel = {
  findByUserId: (userId: UUID) =>
    query<PlainRow>(
      `SELECT s.*,u.name,u.mobile,u.language,u.profile_photo,
              sc.class_name,sc.section,sch.name AS school_name
       FROM students s
       JOIN users u ON u.id=s.user_id
       JOIN school_classes sc ON sc.id=s.class_id
       JOIN schools sch ON sch.id=s.school_id
       WHERE s.user_id=$1`,
      [userId],
    ).then((r) => r.rows[0]),

  findById: (id: UUID) =>
    query<PlainRow>(
      `SELECT s.*,u.name,u.mobile,u.language,sc.class_name,sc.section,sch.name AS school_name
       FROM students s
       JOIN users u ON u.id=s.user_id
       JOIN school_classes sc ON sc.id=s.class_id
       JOIN schools sch ON sch.id=s.school_id
       WHERE s.id=$1`,
      [id],
    ).then((r) => r.rows[0]),

  listBySchool: ({ schoolId, classId, search, status = 'ACTIVE', limit = 50, offset = 0 }: StudentListInput) => {
    const conditions = ['st.school_id=$1', 'st.status=$2'];
    const values: unknown[] = [schoolId, status];
    if (classId) { conditions.push(`st.class_id=$${values.length + 1}`); values.push(classId); }
    if (search) { conditions.push(`u.name ILIKE $${values.length + 1}`); values.push(`%${search}%`); }
    const where = conditions.join(' AND ');
    return Promise.all([
      query<PlainRow>(
        `SELECT st.id,st.roll_number,st.xp_total,st.xp_level,st.streak_current,
                u.name,u.mobile,sc.class_name,sc.section,
                ams.percentage AS attendance_pct, fi.status AS fee_status
         FROM students st
         JOIN users u ON u.id=st.user_id
         JOIN school_classes sc ON sc.id=st.class_id
         LEFT JOIN attendance_monthly_summary ams ON ams.student_id=st.id
           AND ams.year=EXTRACT(YEAR FROM NOW()) AND ams.month=EXTRACT(MONTH FROM NOW())
         LEFT JOIN fee_invoices fi ON fi.student_id=st.id AND fi.academic_year='2025-26' AND fi.term=1
         WHERE ${where}
         ORDER BY sc.class_name,sc.section,st.roll_number
         LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
        [...values, limit, offset],
      ),
      query<CountRow>(`SELECT COUNT(*) FROM students st JOIN users u ON u.id=st.user_id WHERE ${where}`, values),
    ]).then(([rows, count]) => ({ rows: rows.rows, total: Number.parseInt(count.rows[0]?.count || '0', 10) }));
  },

  create: (client: PoolClient, {
    userId, schoolId, classId, rollNumber, dob, gender, academicYear = '2025-26',
  }: StudentCreateInput) =>
    client.query<IdRow>(
      `INSERT INTO students (user_id,school_id,class_id,roll_number,date_of_birth,gender,academic_year)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [userId, schoolId, classId, rollNumber || null, dob || null, gender || null, academicYear],
    ).then((r) => r.rows[0]),

  updateXP: (id: UUID, xpAmount: number) =>
    query<PlainRow>(
      `UPDATE students SET
         xp_total=xp_total+$1,
         xp_level=LEAST(GREATEST(FLOOR((xp_total+$1)/500.0)+1,1),100),
         updated_at=NOW()
       WHERE id=$2 RETURNING xp_total,xp_level`,
      [xpAmount, id],
    ).then((r) => r.rows[0]),

  updateStreak: (id: UUID, streakCount: number) =>
    query(
      'UPDATE students SET streak_current=$1, streak_best=GREATEST(streak_best,$1), updated_at=NOW() WHERE id=$2',
      [streakCount, id],
    ),

  getLeaderboard: ({ schoolId, classId, limit = 20 }: LeaderboardInput) => {
    const conditions = ['st.school_id=$1', "st.status='ACTIVE'"];
    const values: unknown[] = [schoolId];
    if (classId) { conditions.push(`st.class_id=$${values.length + 1}`); values.push(classId); }
    return query<PlainRow>(
      `SELECT st.id,u.name,u.profile_photo,st.xp_total,st.xp_level,st.streak_current,
              sc.class_name,sc.section,
              RANK() OVER (ORDER BY st.xp_total DESC) AS rank
       FROM students st
       JOIN users u ON u.id=st.user_id
       JOIN school_classes sc ON sc.id=st.class_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY st.xp_total DESC LIMIT $${values.length + 1}`,
      [...values, limit],
    ).then((r) => r.rows);
  },
};

export const SchoolModel = {
  findByAdminUserId: (userId: UUID) =>
    query<PlainRow>('SELECT * FROM schools WHERE admin_user_id=$1 LIMIT 1', [userId]).then((r) => r.rows[0]),

  findById: (id: UUID) =>
    query<PlainRow>(
      'SELECT s.*,u.name AS admin_name FROM schools s JOIN users u ON u.id=s.admin_user_id WHERE s.id=$1',
      [id],
    ).then((r) => r.rows[0]),

  list: ({ status, plan, state, limit = 50, offset = 0 }: SchoolListInput) => {
    const conditions = ['1=1'];
    const values: unknown[] = [];
    if (status) { conditions.push(`status=$${values.length + 1}`); values.push(status); }
    if (plan) { conditions.push(`plan=$${values.length + 1}`); values.push(plan); }
    if (state) { conditions.push(`state=$${values.length + 1}`); values.push(state); }
    values.push(limit, offset);
    return query<PlainRow>(
      `SELECT s.id,s.name,s.status,s.plan,s.state,s.district,s.city,s.total_students,s.total_teachers,
              s.plan_expires_at,s.created_at,u.name AS admin_name,u.mobile AS admin_mobile
       FROM schools s JOIN users u ON u.id=s.admin_user_id
       WHERE ${conditions.join(' AND ')} ORDER BY s.created_at DESC
       LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values,
    ).then((r) => r.rows);
  },

  create: ({ name, adminUserId, city, district, state, pincode, mobile, email, udiseCode }: SchoolCreateInput) =>
    query<PlainRow>(
      `INSERT INTO schools (name,admin_user_id,city,district,state,pincode,mobile,email,udise_code,status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'PENDING') RETURNING *`,
      [name, adminUserId, city, district, state, pincode, mobile, email, udiseCode || null],
    ).then((r) => r.rows[0]),

  updateStatus: (id: UUID, status: string) =>
    query<PlainRow>('UPDATE schools SET status=$1,updated_at=NOW() WHERE id=$2 RETURNING id,status', [status, id])
      .then((r) => r.rows[0]),

  updateStudentCount: (client: PoolClient, schoolId: UUID, delta: number) =>
    client.query('UPDATE schools SET total_students=total_students+$1 WHERE id=$2', [delta, schoolId]),

  getClasses: (schoolId: UUID) =>
    query<PlainRow>(
      'SELECT id,class_name,section,academic_year FROM school_classes WHERE school_id=$1 ORDER BY class_name,section',
      [schoolId],
    ).then((r) => r.rows),
};

export const TeacherModel = {
  findByUserId: (userId: UUID) =>
    query<PlainRow>(
      'SELECT t.*,u.name,u.mobile FROM teachers t JOIN users u ON u.id=t.user_id WHERE t.user_id=$1',
      [userId],
    ).then((r) => r.rows[0]),

  listBySchool: (schoolId: UUID) =>
    query<PlainRow>(
      `SELECT t.id,t.employee_id,t.qualification,t.experience_yrs,t.status,t.joined_date,
              u.name,u.mobile,u.language
       FROM teachers t JOIN users u ON u.id=t.user_id
       WHERE t.school_id=$1 AND t.status='ACTIVE'
       ORDER BY u.name`,
      [schoolId],
    ).then((r) => r.rows),

  create: (client: PoolClient, { userId, schoolId, employeeId, qualification, experienceYrs }: TeacherCreateInput) =>
    client.query<IdRow>(
      `INSERT INTO teachers (user_id,school_id,employee_id,qualification,experience_yrs)
       VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [userId, schoolId, employeeId || null, qualification || null, experienceYrs || 0],
    ).then((r) => r.rows[0]),
};

export const AttendanceModel = {
  getByStudentAndDate: (studentId: UUID, date: string) =>
    query<PlainRow>('SELECT * FROM attendance WHERE student_id=$1 AND date=$2', [studentId, date]).then((r) => r.rows[0]),

  getMonthlySummary: (studentId: UUID, year: number, month: number) =>
    query<PlainRow>('SELECT * FROM attendance_monthly_summary WHERE student_id=$1 AND year=$2 AND month=$3', [studentId, year, month])
      .then((r) => r.rows[0]),

  getMonthlyForStudent: (studentId: UUID, year: number, month: number) =>
    query<PlainRow>(
      `SELECT date,status FROM attendance WHERE student_id=$1
       AND EXTRACT(YEAR FROM date)=$2 AND EXTRACT(MONTH FROM date)=$3
       ORDER BY date`,
      [studentId, year, month],
    ).then((r) => r.rows),

  markBulk: async (client: PoolClient, { classId, schoolId, date, records, markedBy }: AttendanceBulkInput) => {
    const results: PlainRow[] = [];
    for (const record of records) {
      const { rows } = await client.query<PlainRow>(
        `INSERT INTO attendance (student_id,class_id,school_id,date,status,remark,marked_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (student_id,date) DO UPDATE SET status=EXCLUDED.status,remark=EXCLUDED.remark
         RETURNING *`,
        [record.studentId, classId, schoolId, date, record.status, record.remark || null, markedBy],
      );
      if (rows[0]) results.push(rows[0]);
    }
    return results;
  },

  getClassSummaryForDate: (schoolId: UUID, date: string) =>
    query<PlainRow>(
      `SELECT sc.id,sc.class_name,sc.section,
              COUNT(a.id) FILTER (WHERE a.status='PRESENT') AS present,
              COUNT(a.id) FILTER (WHERE a.status='ABSENT') AS absent,
              COUNT(a.id) FILTER (WHERE a.status='LATE') AS late,
              COUNT(st.id) AS total
       FROM school_classes sc
       LEFT JOIN students st ON st.class_id=sc.id AND st.status='ACTIVE'
       LEFT JOIN attendance a ON a.student_id=st.id AND a.date=$2
       WHERE sc.school_id=$1
       GROUP BY sc.id,sc.class_name,sc.section
       ORDER BY sc.class_name,sc.section`,
      [schoolId, date],
    ).then((r) => r.rows),
};

export const FeeModel = {
  getInvoicesBySchool: ({
    schoolId, academicYear = '2025-26', term, status, limit = 100, offset = 0,
  }: FeeInvoiceListInput) => {
    const conditions = ['fi.school_id=$1', 'fi.academic_year=$2'];
    const values: unknown[] = [schoolId, academicYear];
    if (term) { conditions.push(`fi.term=$${values.length + 1}`); values.push(term); }
    if (status) { conditions.push(`fi.status=$${values.length + 1}`); values.push(status); }
    return query<InvoiceRow>(
      `SELECT fi.*,u.name AS student_name,u.mobile AS student_mobile,sc.class_name,sc.section
       FROM fee_invoices fi
       JOIN students st ON st.id=fi.student_id
       JOIN users u ON u.id=st.user_id
       JOIN school_classes sc ON sc.id=st.class_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY fi.due_date ASC
       LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, limit, offset],
    ).then((r) => r.rows);
  },

  getInvoicesByStudent: (studentId: UUID, academicYear = '2025-26') =>
    query<InvoiceRow>('SELECT * FROM fee_invoices WHERE student_id=$1 AND academic_year=$2 ORDER BY term', [studentId, academicYear])
      .then((r) => r.rows),

  getInvoiceById: (id: UUID) =>
    query<InvoiceRow>('SELECT * FROM fee_invoices WHERE id=$1', [id]).then((r) => r.rows[0]),

  recordPayment: ({
    invoiceId, schoolId, studentId, amount, mode, razorpayPaymentId, transactionRef, collectedBy, notes,
  }: FeePaymentInput) =>
    query<PlainRow>(
      `INSERT INTO fee_payments (invoice_id,school_id,student_id,amount,mode,razorpay_payment_id,transaction_ref,collected_by,notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [invoiceId, schoolId, studentId, amount, mode, razorpayPaymentId || null, transactionRef || null, collectedBy, notes || null],
    ).then((r) => r.rows[0]),

  getStats: (schoolId: UUID, academicYear = '2025-26') =>
    query<PlainRow>(
      `SELECT
         SUM(CASE WHEN status='PAID' THEN amount_due ELSE 0 END) AS collected,
         SUM(CASE WHEN status IN ('PENDING','OVERDUE') THEN amount_due-amount_paid ELSE 0 END) AS pending,
         COUNT(*) FILTER (WHERE status='PAID') AS paid_count,
         COUNT(*) FILTER (WHERE status IN ('PENDING','OVERDUE')) AS pending_count,
         COUNT(*) FILTER (WHERE status='OVERDUE') AS overdue_count
       FROM fee_invoices WHERE school_id=$1 AND academic_year=$2`,
      [schoolId, academicYear],
    ).then((r) => r.rows[0]),
};

export const ContentModel = {
  getSubjects: (className: string) =>
    query<PlainRow>(
      `SELECT sub.id,sub.name,sub.name_hi,sub.code,sub.color_hex,sub.icon_url,
              COUNT(ch.id) AS chapter_count
       FROM subjects sub
       LEFT JOIN chapters ch ON ch.subject_id=sub.id AND ch.class_name=$1
       WHERE sub.is_active=TRUE
       GROUP BY sub.id ORDER BY sub.sort_order`,
      [className],
    ).then((r) => r.rows),

  getChapters: (subjectId: UUID, className: string) =>
    query<PlainRow>(
      `SELECT ch.*,
              COUNT(ci.id) AS total_items,
              COUNT(ci.id) FILTER (WHERE ci.type='VIDEO') AS video_count,
              COUNT(ci.id) FILTER (WHERE ci.type='PDF') AS pdf_count,
              COUNT(ci.id) FILTER (WHERE ci.type='QUIZ') AS quiz_count
       FROM chapters ch
       LEFT JOIN content_items ci ON ci.chapter_id=ch.id AND ci.status='PUBLISHED'
       WHERE ch.subject_id=$1 AND ch.class_name=$2 AND ch.is_active=TRUE
       GROUP BY ch.id ORDER BY ch.chapter_number`,
      [subjectId, className],
    ).then((r) => r.rows),

  getItems: (chapterId: UUID, studentId: UUID | null, _language = 'hi') =>
    query<PlainRow>(
      `SELECT ci.id,ci.type,ci.title,ci.title_hi,ci.language,ci.duration_secs,
              ci.file_size_kb,ci.thumbnail_url,ci.sort_order,ci.is_offline_ready,
              ci.difficulty,ci.view_count,ci.xp_reward,
              scp.is_completed,scp.progress_pct,scp.quiz_score,scp.last_accessed
       FROM content_items ci
       LEFT JOIN student_content_progress scp ON scp.content_item_id=ci.id AND scp.student_id=$2
       WHERE ci.chapter_id=$1 AND ci.status='PUBLISHED'
       ORDER BY ci.sort_order`,
      [chapterId, studentId],
    ).then((r) => r.rows),

  getItemById: (id: UUID) => query<PlainRow>('SELECT * FROM content_items WHERE id=$1', [id]).then((r) => r.rows[0]),

  upsertProgress: (studentId: UUID, contentItemId: UUID, {
    progressPct, isCompleted, quizScore,
  }: ContentProgressInput) =>
    query<PlainRow>(
      `INSERT INTO student_content_progress (student_id,content_item_id,progress_pct,is_completed,quiz_score,last_accessed,completed_at)
       VALUES ($1,$2,$3,$4,$5,NOW(),CASE WHEN $4 THEN NOW() ELSE NULL END)
       ON CONFLICT (student_id,content_item_id) DO UPDATE SET
         progress_pct=GREATEST(student_content_progress.progress_pct,EXCLUDED.progress_pct),
         is_completed=student_content_progress.is_completed OR EXCLUDED.is_completed,
         quiz_score=COALESCE(EXCLUDED.quiz_score,student_content_progress.quiz_score),
         last_accessed=NOW(),
         completed_at=CASE WHEN EXCLUDED.is_completed AND student_content_progress.completed_at IS NULL
                           THEN NOW() ELSE student_content_progress.completed_at END
       RETURNING *`,
      [studentId, contentItemId, progressPct, isCompleted, quizScore || null],
    ).then((r) => r.rows[0]),

  getQuizQuestions: (contentItemId: UUID) =>
    query<PlainRow>(
      `SELECT id,question_text,question_hi,option_a,option_b,option_c,option_d,
              option_a_hi,option_b_hi,option_c_hi,option_d_hi,difficulty,sort_order
       FROM quiz_questions WHERE content_item_id=$1 ORDER BY sort_order`,
      [contentItemId],
    ).then((r) => r.rows),

  checkAnswer: (questionId: UUID) =>
    query<PlainRow>('SELECT correct_option,explanation,explanation_hi FROM quiz_questions WHERE id=$1', [questionId])
      .then((r) => r.rows[0]),
};

export const ExamModel = {
  list: ({ schoolId, status, limit = 20 }: ExamListInput) => {
    const conditions = ['(e.school_id=$1 OR e.school_id IS NULL)'];
    const values: unknown[] = [schoolId];
    if (status) { conditions.push(`e.status=$${values.length + 1}`); values.push(status); }
    return query<PlainRow>(
      `SELECT e.*,u.name AS created_by_name FROM exams e JOIN users u ON u.id=e.created_by
       WHERE ${conditions.join(' AND ')}
       ORDER BY e.start_time ASC LIMIT $${values.length + 1}`,
      [...values, limit || 20],
    ).then((r) => r.rows);
  },

  findById: (id: UUID) => query<PlainRow>('SELECT * FROM exams WHERE id=$1', [id]).then((r) => r.rows[0]),

  getQuestions: (examId: UUID) =>
    query<PlainRow>(
      `SELECT id,question_text,question_hi,option_a,option_b,option_c,option_d,
              option_a_hi,option_b_hi,option_c_hi,option_d_hi,subject_code,difficulty,sort_order
       FROM exam_questions WHERE exam_id=$1 ORDER BY sort_order`,
      [examId],
    ).then((r) => r.rows),

  findAttempt: (examId: UUID, studentId: UUID) =>
    query<PlainRow>('SELECT * FROM exam_attempts WHERE exam_id=$1 AND student_id=$2', [examId, studentId]).then((r) => r.rows[0]),

  createAttempt: (examId: UUID, studentId: UUID, schoolId: UUID) =>
    query<PlainRow>('INSERT INTO exam_attempts (exam_id,student_id,school_id) VALUES ($1,$2,$3) RETURNING *', [examId, studentId, schoolId])
      .then((r) => r.rows[0]),

  getLeaderboard: (examId: UUID, limit = 50) =>
    query<PlainRow>(
      `SELECT el.*,u.name,u.profile_photo,sc.class_name,sc.section
       FROM exam_leaderboard el
       JOIN students st ON st.id=el.student_id
       JOIN users u ON u.id=st.user_id
       JOIN school_classes sc ON sc.id=st.class_id
       WHERE el.exam_id=$1
       ORDER BY el.rank_overall ASC LIMIT $2`,
      [examId, limit],
    ).then((r) => r.rows),
};

export const GamificationModel = {
  addXPEvent: ({ studentId, eventType, xpAmount, referenceId, referenceType, description }: XPEventInput) =>
    query<PlainRow>(
      `INSERT INTO xp_events (student_id,event_type,xp_amount,reference_id,reference_type,description)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [studentId, eventType, xpAmount, referenceId || null, referenceType || null, description || null],
    ).then((r) => r.rows[0]),

  getRecentXP: (studentId: UUID, limit = 10) =>
    query<PlainRow>(
      'SELECT event_type,xp_amount,description,created_at FROM xp_events WHERE student_id=$1 ORDER BY created_at DESC LIMIT $2',
      [studentId, limit],
    ).then((r) => r.rows),

  getBadges: (studentId: UUID) =>
    query<PlainRow>(
      `SELECT b.code,b.name,b.name_hi,b.description,b.tier,b.icon_url,b.xp_bonus,
              sb.awarded_at,sb.is_displayed
       FROM student_badges sb JOIN badges b ON b.id=sb.badge_id
       WHERE sb.student_id=$1 ORDER BY sb.awarded_at DESC`,
      [studentId],
    ).then((r) => r.rows),

  awardBadge: (studentId: UUID, badgeCode: string) =>
    query<PlainRow>(
      `INSERT INTO student_badges (student_id,badge_id)
       SELECT $1,id FROM badges WHERE code=$2
       ON CONFLICT (student_id,badge_id) DO NOTHING RETURNING *`,
      [studentId, badgeCode],
    ).then((r) => r.rows[0]),

  checkAndAwardBadges: async (studentId: UUID, { xpTotal, streakCurrent, lessonsCount }: BadgeContext) => {
    const { rows: allBadges } = await query<BadgeCriteriaRow>(
      `SELECT b.code,b.criteria_type,b.criteria_value
       FROM badges b
       WHERE b.is_active=TRUE
         AND NOT EXISTS (SELECT 1 FROM student_badges sb WHERE sb.student_id=$1 AND sb.badge_id=b.id)`,
      [studentId],
    );
    const awarded: string[] = [];
    for (const badge of allBadges) {
      let eligible = false;
      if (badge.criteria_type === 'XP_THRESHOLD' && xpTotal >= badge.criteria_value) eligible = true;
      if (badge.criteria_type === 'STREAK' && streakCurrent >= badge.criteria_value) eligible = true;
      if (badge.criteria_type === 'LESSONS_COUNT' && lessonsCount >= badge.criteria_value) eligible = true;
      if (eligible) {
        await query(
          'INSERT INTO student_badges (student_id,badge_id) SELECT $1,id FROM badges WHERE code=$2 ON CONFLICT DO NOTHING',
          [studentId, badge.code],
        );
        awarded.push(badge.code);
      }
    }
    return awarded;
  },

  logStreak: async (studentId: UUID) => {
    const today = new Date().toISOString().split('T')[0] || '';
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0] || '';
    const { rows: [existing] } = await query<IdRow>('SELECT id FROM streak_log WHERE student_id=$1 AND date=$2', [studentId, today]);
    if (existing) return null;
    const { rows: [previous] } = await query<StreakRow>(
      'SELECT streak_count FROM streak_log WHERE student_id=$1 AND date=$2',
      [studentId, yesterday],
    );
    const newStreak = previous ? previous.streak_count + 1 : 1;
    await query(
      'INSERT INTO streak_log (student_id,date,streak_count) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
      [studentId, today, newStreak],
    );
    await query(
      'UPDATE students SET streak_current=$1, streak_best=GREATEST(streak_best,$1), updated_at=NOW() WHERE id=(SELECT id FROM students WHERE user_id=$2)',
      [newStreak, studentId],
    );
    return newStreak;
  },
};

export const NotificationModel = {
  save: ({ userId, schoolId, type, channel = 'IN_APP', title, body, referenceId, referenceType }: NotificationSaveInput) =>
    query<IdRow>(
      `INSERT INTO notifications (user_id,school_id,type,channel,title,body,reference_id,reference_type)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [userId, schoolId || null, type, channel, title, body, referenceId || null, referenceType || null],
    ).then((r) => r.rows[0]),

  listForUser: (userId: UUID, limit = 50) =>
    query<PlainRow>('SELECT * FROM notifications WHERE user_id=$1 ORDER BY sent_at DESC LIMIT $2', [userId, limit])
      .then((r) => r.rows),

  markRead: (id: UUID, userId: UUID) =>
    query('UPDATE notifications SET is_read=TRUE,read_at=NOW() WHERE id=$1 AND user_id=$2', [id, userId]),

  getUnreadCount: (userId: UUID) =>
    query<CountRow>('SELECT COUNT(*) FROM notifications WHERE user_id=$1 AND is_read=FALSE', [userId])
      .then((r) => Number.parseInt(r.rows[0]?.count || '0', 10)),
};

export const TimetableModel = {
  getByClass: (classId: UUID, academicYear = '2025-26') =>
    query<PlainRow>(
      `SELECT tp.*,u.name AS teacher_name,sub.name AS subject_name
       FROM timetable_periods tp
       LEFT JOIN teachers t ON t.id=tp.teacher_id
       LEFT JOIN users u ON u.id=t.user_id
       LEFT JOIN subjects sub ON sub.code=tp.subject_code
       WHERE tp.class_id=$1 AND tp.academic_year=$2
       ORDER BY tp.day,tp.period_number`,
      [classId, academicYear],
    ).then((r) => r.rows),

  replaceForClass: async (classId: UUID, periods: TimetablePeriodInput[], academicYear = '2025-26') =>
    transaction(async (client) => {
      await client.query('DELETE FROM timetable_periods WHERE class_id=$1 AND academic_year=$2', [classId, academicYear]);
      for (const period of periods) {
        await client.query(
          `INSERT INTO timetable_periods (school_id,class_id,teacher_id,subject_code,day,period_number,start_time,end_time,is_break,break_label,academic_year)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [period.schoolId, classId, period.teacherId || null, period.subjectCode || null,
           period.day, period.periodNumber, period.startTime, period.endTime,
           period.isBreak || false, period.breakLabel || null, academicYear],
        );
      }
    }),
};
