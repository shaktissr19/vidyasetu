import crypto from 'crypto';
import type { PoolClient, QueryResultRow } from 'pg';
import type { UUID } from '@vidyasetu/contracts';
import { query, transaction } from '../config/db';
import * as notificationService from './notification.service';
import * as competitionService from './competition.service';
import type { CreateExamInput, ExamQuestionInput } from './competition.service';
import { hashPassword } from '../utils/password';
import logger = require('../utils/logger');

interface SchoolMetaRow extends QueryResultRow {
  id: UUID;
  name: string;
  academic_year: string;
  status: string;
  udise_code: string | null;
}
interface SchoolClassRow extends QueryResultRow {
  id: UUID;
  school_id: UUID;
  class_name: string;
  section: string;
  academic_year: string;
  room_number: string | null;
  is_active: boolean;
}
interface SchoolProfileRow extends QueryResultRow {
  id: UUID;
  name: string;
  name_hi: string | null;
  udise_code: string | null;
  status: string;
  plan: string;
  address: string | null;
  city: string | null;
  district: string | null;
  state: string | null;
  pincode: string | null;
  mobile: string | null;
  email: string | null;
  website: string | null;
  academic_year: string;
  logo_url: string | null;
  board: string | null;
  affiliation_number: string | null;
  principal_name: string | null;
  settings: unknown;
  onboarding_completed_at: string | Date | null;
  admin_user_id: UUID;
  admin_name: string | null;
  admin_username: string | null;
  admin_email: string | null;
  admin_mobile: string;
}
interface AdminIdRow extends QueryResultRow { admin_user_id: UUID; }
interface MutableSchoolRow extends QueryResultRow { id: UUID; [key: string]: unknown; }
interface OverviewStatsRow extends QueryResultRow {
  total_students: number | string;
  total_teachers: number | string;
  total_classes: number | string;
  attended_today: number | string;
  attendance_denominator: number | string;
  today_attendance?: number;
  pending_enrollment_requests?: number;
  upcoming_exams?: number;
}
interface FeeStatsRow extends QueryResultRow {
  collected: number | string;
  pending: number | string;
  paid_count: number | string;
  pending_count: number | string;
}
interface CountRow extends QueryResultRow { count: number | string; }
interface UserIdRow extends QueryResultRow {
  id: UUID;
  role?: string;
  name?: string;
  username?: string;
  email?: string | null;
  mobile?: string;
}
interface CreatedStudentRow extends QueryResultRow {
  id: UUID;
  student_code: string;
  roll_number: string | null;
  grade_level: string;
  academic_year: string;
}
interface StudentDetailRow extends QueryResultRow {
  id: UUID;
  student_code: string;
  roll_number: string | null;
  grade_level: string;
  academic_year: string;
  date_of_birth: string | Date | null;
  gender: string | null;
  status: string;
  school_link_status: string;
  name: string;
  username: string | null;
  email: string | null;
  mobile: string;
  language: string;
  class_id: UUID | null;
  class_name: string | null;
  section: string | null;
  parents: unknown[];
}
interface CurrentStudentRow extends QueryResultRow {
  id: UUID;
  user_id: UUID;
  [key: string]: unknown;
}
interface ParentRow extends QueryResultRow {
  id: UUID;
  name: string | null;
  mobile: string | null;
  email: string | null;
}
interface GenericIdRow extends QueryResultRow { id: UUID; }
interface TeacherCurrentRow extends QueryResultRow {
  id: UUID;
  uid: UUID;
  [key: string]: unknown;
}
interface AttendanceSavedRow extends QueryResultRow {
  id: UUID;
  student_id: UUID;
  status: string;
}
interface AbsentParentRow extends QueryResultRow {
  student_id: UUID;
  student_name: string;
  parent_user_id: UUID;
  parent_mobile: string;
  school_id: UUID;
}
interface FeeInvoiceOverviewRow extends QueryResultRow {
  id: UUID;
  student_id: UUID;
  student_code: string;
  name: string;
  class_name: string | null;
  section: string | null;
  term: number;
  invoice_number: string | null;
  amount_due: number | string;
  amount_paid: number | string;
  amount_waived: number | string;
  outstanding: number | string;
  status: string;
  due_date: string | Date | null;
}
interface FeeTotalRow extends QueryResultRow {
  amount: number | string;
  default_due: string | Date | null;
}
interface FeeStudentRow extends QueryResultRow { id: UUID; student_code: string; }
interface FeeInvoiceRow extends QueryResultRow {
  id: UUID;
  student_id: UUID;
  amount_due: number | string;
  amount_paid: number | string;
  amount_waived: number | string;
  status: string;
}
interface SequenceRow extends QueryResultRow { seq: number | string; }
interface FeeReminderRow extends QueryResultRow {
  id: UUID;
  student_name: string;
  parent_user_id: UUID;
  parent_mobile: string;
  outstanding: number | string;
  due_date: string | Date | null;
}
interface ExamDetailRow extends QueryResultRow {
  id: UUID;
  title: string;
  total_questions?: number;
  marks_per_question?: number | string;
  status?: string;
  [key: string]: unknown;
}
interface AnnouncementRow extends QueryResultRow {
  id: UUID;
  school_id: UUID;
  title: string;
  body: string;
  target_classes: string[];
  target_roles: string[];
  send_whatsapp: boolean;
  [key: string]: unknown;
}
interface AnnouncementRecipientRow extends QueryResultRow {
  recipient_id: UUID;
  mobile: string | null;
  role: string;
}

export interface SchoolProfileUpdateInput {
  name?: string | null;
  nameHi?: string | null;
  udiseCode?: string | null;
  address?: string | null;
  city?: string | null;
  district?: string | null;
  state?: string | null;
  pincode?: string | null;
  mobile?: string | null;
  email?: string | null;
  website?: string | null;
  academicYear?: string | null;
  board?: string | null;
  affiliationNumber?: string | null;
  principalName?: string | null;
  adminName?: string | null;
  adminEmail?: string | null;
}
export interface StudentCreateInput {
  name: string;
  mobile: string;
  classId: UUID;
  username?: string;
  email?: string | null;
  password?: string;
  language?: string;
  rollNumber?: string | null;
  dob?: string | null;
  gender?: string | null;
  parentName?: string | null;
  parentMobile?: string | null;
  parentEmail?: string | null;
  parentRelation?: string;
}
export interface StudentUpdateInput {
  classId?: UUID;
  name?: string | null;
  email?: string | null;
  mobile?: string | null;
  rollNumber?: string | null;
  status?: string | null;
}
export interface ParentLinkInput {
  name?: string | null;
  mobile?: string | null;
  email?: string | null;
  relation?: string;
  isPrimary?: boolean;
}
export interface ClassInput {
  className: string;
  section?: string;
  academicYear?: string;
  roomNumber?: string | null;
  isActive?: boolean;
}
export interface ClassUpdateInput {
  className?: string;
  section?: string;
  academicYear?: string;
  roomNumber?: string | null;
  isActive?: boolean;
}
export interface TeacherAssignmentInput {
  classId: UUID;
  subjectCode: string;
  isClassTeacher?: boolean;
}
export interface TeacherInput {
  name: string;
  mobile: string;
  username?: string;
  email?: string | null;
  password?: string;
  language?: string;
  employeeId?: string | null;
  designation?: string | null;
  qualification?: string | null;
  experienceYears?: number;
  employmentType?: string | null;
  joinedDate?: string | Date;
  status?: string;
  assignments?: TeacherAssignmentInput[];
}
export interface AttendanceInput {
  studentId: UUID;
  status: string;
  remark?: string | null;
}
export interface FeeStructureInput {
  academicYear?: string;
  className: string;
  term: number;
  feeHead: string;
  amount: number;
  dueDate?: string | null;
  isOptional?: boolean;
}
export interface GenerateInvoicesInput {
  academicYear?: string;
  classId: UUID;
  term: number;
  dueDate?: string | null;
}
export interface FeePaymentInput {
  invoiceId: UUID;
  amount: number;
  paymentMode: string;
  razorpayPaymentId?: string | null;
  transactionRef?: string | null;
  collectedBy: UUID;
  paymentDate?: string | Date;
  notes?: string | null;
}
export interface TimetableInput {
  teacherId?: UUID | null;
  subjectCode?: string | null;
  day: string;
  periodNumber: number;
  startTime: string;
  endTime: string;
  roomNumber?: string | null;
  isBreak?: boolean;
  breakLabel?: string | null;
}
export interface SchoolExamInput extends CreateExamInput { questions?: ExamQuestionInput[]; }
export interface AnnouncementInput {
  audience?: 'PARENTS' | 'STUDENTS' | 'TEACHERS' | 'ALL';
  targetClass?: string | null;
  title: string;
  body: string;
  isPinned?: boolean;
  sendWhatsapp?: boolean;
  expiresAt?: string | null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function normalizeUsername(value: unknown): string {
  return String(value || '')
    .trim().toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '.')
    .replace(/\.{2,}/g, '.')
    .replace(/^[._-]+|[._-]+$/g, '')
    .slice(0, 60);
}

function usernameBase(name: unknown): string {
  const parts = String(name || 'user').trim().toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(Boolean);
  if (!parts.length) return 'user';
  return normalizeUsername(parts.length === 1 ? parts[0] : `${parts[0]}.${parts[parts.length - 1]}`) || 'user';
}

async function allocateUsername(client: PoolClient, name: string, requested?: string): Promise<string> {
  const preferred = requested ? normalizeUsername(requested) : '';
  if (requested && preferred.length < 3) {
    throw Object.assign(new Error('Username must be at least 3 characters'), { statusCode: 400 });
  }
  const base = preferred || usernameBase(name);
  const exists = async (candidate: string): Promise<boolean> =>
    (await client.query('SELECT 1 FROM users WHERE LOWER(username)=LOWER($1) LIMIT 1', [candidate])).rows.length > 0;
  if (!(await exists(base))) return base;
  if (preferred) throw Object.assign(new Error('Username is already taken'), { statusCode: 409 });
  for (let index = 2; index <= 9999; index += 1) {
    const suffix = `.${index}`;
    const candidate = `${base.slice(0, 60 - suffix.length)}${suffix}`;
    if (!(await exists(candidate))) return candidate;
  }
  throw Object.assign(new Error('Could not allocate a username'), { statusCode: 409 });
}

function generateTemporaryPassword(): string {
  return `Vs@${crypto.randomBytes(6).toString('hex')}7`;
}

async function getSchoolMeta(schoolId: UUID): Promise<SchoolMetaRow> {
  const { rows: [school] } = await query<SchoolMetaRow>(
    'SELECT id, name, academic_year, status, udise_code FROM schools WHERE id=$1',
    [schoolId],
  );
  if (!school) throw Object.assign(new Error('School not found'), { statusCode: 404 });
  return school;
}

async function ensureClass(
  client: PoolClient,
  schoolId: UUID,
  classId: UUID,
  activeOnly = true,
): Promise<SchoolClassRow> {
  const { rows: [schoolClass] } = await client.query<SchoolClassRow>(
    `SELECT id, school_id, class_name, section, academic_year, room_number,
            COALESCE(is_active, TRUE) AS is_active
     FROM school_classes
     WHERE id=$1 AND school_id=$2 ${activeOnly ? 'AND COALESCE(is_active, TRUE)=TRUE' : ''}`,
    [classId, schoolId],
  );
  if (!schoolClass) {
    throw Object.assign(new Error('Class/section not found for this school'), { statusCode: 400 });
  }
  return schoolClass;
}

export async function getSchoolProfile(schoolId: UUID): Promise<SchoolProfileRow> {
  const { rows: [row] } = await query<SchoolProfileRow>(
    `SELECT s.id, s.name, s.name_hi, s.udise_code, s.status, s.plan,
            s.address, s.city, s.district, s.state, s.pincode, s.mobile, s.email,
            s.website, s.academic_year, s.logo_url, s.board, s.affiliation_number,
            s.principal_name, s.settings, s.onboarding_completed_at,
            u.id AS admin_user_id, u.name AS admin_name, u.username AS admin_username,
            u.email AS admin_email, u.mobile AS admin_mobile
     FROM schools s
     JOIN users u ON u.id=s.admin_user_id
     WHERE s.id=$1`,
    [schoolId],
  );
  if (!row) throw Object.assign(new Error('School not found'), { statusCode: 404 });
  return row;
}

export async function updateSchoolProfile(
  schoolId: UUID,
  _userId: UUID,
  data: SchoolProfileUpdateInput,
) {
  return transaction(async (client) => {
    const { rows: [school] } = await client.query<AdminIdRow>(
      'SELECT admin_user_id FROM schools WHERE id=$1 FOR UPDATE',
      [schoolId],
    );
    if (!school) throw Object.assign(new Error('School not found'), { statusCode: 404 });
    const { rows: [updated] } = await client.query<MutableSchoolRow>(
      `UPDATE schools SET
         name=COALESCE($2,name), name_hi=COALESCE($3,name_hi), udise_code=COALESCE($4,udise_code),
         address=COALESCE($5,address), city=COALESCE($6,city), district=COALESCE($7,district),
         state=COALESCE($8,state), pincode=COALESCE($9,pincode), mobile=COALESCE($10,mobile),
         email=COALESCE($11,email), website=COALESCE($12,website), academic_year=COALESCE($13,academic_year),
         board=COALESCE($14,board), affiliation_number=COALESCE($15,affiliation_number),
         principal_name=COALESCE($16,principal_name), updated_at=NOW()
       WHERE id=$1
       RETURNING *`,
      [schoolId, data.name || null, data.nameHi || null, data.udiseCode || null,
       data.address || null, data.city || null, data.district || null, data.state || null,
       data.pincode || null, data.mobile || null, data.email || null, data.website || null,
       data.academicYear || null, data.board || null, data.affiliationNumber || null,
       data.principalName || null],
    );
    if (data.adminName || data.adminEmail) {
      await client.query(
        'UPDATE users SET name=COALESCE($2,name), email=COALESCE($3,email), updated_at=NOW() WHERE id=$1',
        [school.admin_user_id, data.adminName || null, data.adminEmail || null],
      );
    }
    return updated;
  });
}

export async function getOverview(schoolId: UUID) {
  const school = await getSchoolProfile(schoolId);
  const year = school.academic_year;
  const [[stats], [feeStats], classSummary, pendingRows, upcomingRows, announcements] = await Promise.all([
    query<OverviewStatsRow>(`
      SELECT
        COUNT(DISTINCT st.id) FILTER (WHERE st.status='ACTIVE' AND st.school_link_status='APPROVED') AS total_students,
        COUNT(DISTINCT t.id) FILTER (WHERE t.status='ACTIVE') AS total_teachers,
        COUNT(DISTINCT sc.id) FILTER (WHERE COALESCE(sc.is_active,TRUE)=TRUE AND sc.academic_year=$2) AS total_classes,
        COUNT(DISTINCT a.student_id) FILTER (WHERE a.status IN ('PRESENT','LATE','HALF_DAY')) AS attended_today,
        COUNT(DISTINCT st.id) FILTER (WHERE st.status='ACTIVE' AND st.school_link_status='APPROVED') AS attendance_denominator
      FROM schools s
      LEFT JOIN students st ON st.school_id=s.id
      LEFT JOIN teachers t ON t.school_id=s.id
      LEFT JOIN school_classes sc ON sc.school_id=s.id
      LEFT JOIN attendance a ON a.student_id=st.id AND a.date=CURRENT_DATE
      WHERE s.id=$1`, [schoolId, year]).then((r) => r.rows),
    query<FeeStatsRow>(`
      SELECT COALESCE(SUM(amount_paid),0) AS collected,
             COALESCE(SUM(GREATEST(amount_due-amount_paid-amount_waived,0)),0) AS pending,
             COUNT(*) FILTER (WHERE status='PAID') AS paid_count,
             COUNT(*) FILTER (WHERE status IN ('PENDING','PARTIAL','OVERDUE')) AS pending_count
      FROM fee_invoices WHERE school_id=$1 AND academic_year=$2`, [schoolId, year]).then((r) => r.rows),
    query(`
      SELECT sc.id, sc.class_name, sc.section,
             COUNT(st.id) FILTER (WHERE st.status='ACTIVE' AND st.school_link_status='APPROVED') AS total,
             COUNT(a.id) FILTER (WHERE a.status IN ('PRESENT','LATE','HALF_DAY')) AS present,
             COUNT(a.id) FILTER (WHERE a.status='ABSENT') AS absent
      FROM school_classes sc
      LEFT JOIN students st ON st.class_id=sc.id
      LEFT JOIN attendance a ON a.student_id=st.id AND a.date=CURRENT_DATE
      WHERE sc.school_id=$1 AND sc.academic_year=$2 AND COALESCE(sc.is_active,TRUE)=TRUE
      GROUP BY sc.id ORDER BY NULLIF(regexp_replace(sc.class_name,'[^0-9]','','g'),'')::INT NULLS LAST, sc.class_name, sc.section`,
      [schoolId, year]).then((r) => r.rows),
    query<CountRow>("SELECT COUNT(*)::INT AS count FROM student_school_requests WHERE requested_school_id=$1 AND status='PENDING'", [schoolId]).then((r) => r.rows),
    query<CountRow>("SELECT COUNT(*)::INT AS count FROM exams WHERE school_id=$1 AND status NOT IN ('COMPLETED','CANCELLED') AND end_time>=NOW()", [schoolId]).then((r) => r.rows),
    query('SELECT id,title,published_at FROM announcements WHERE school_id=$1 ORDER BY published_at DESC LIMIT 5', [schoolId]).then((r) => r.rows),
  ]);

  const summary = stats || {
    total_students: 0, total_teachers: 0, total_classes: 0, attended_today: 0, attendance_denominator: 0,
  };
  const denominator = Number(summary.attendance_denominator || 0);
  summary.today_attendance = denominator ? Math.round((Number(summary.attended_today || 0) / denominator) * 100) : 0;
  summary.pending_enrollment_requests = Number(pendingRows?.[0]?.count || 0);
  summary.upcoming_exams = Number(upcomingRows?.[0]?.count || 0);

  const onboardingChecks = {
    profile: Boolean(school.name && school.udise_code && school.city && school.state),
    classes: Number(summary.total_classes || 0) > 0,
    teachers: Number(summary.total_teachers || 0) > 0,
    students: Number(summary.total_students || 0) > 0,
    fees: Number(feeStats?.pending_count || 0) + Number(feeStats?.paid_count || 0) > 0,
  };
  const completed = Object.values(onboardingChecks).filter(Boolean).length;
  return {
    school,
    stats: summary,
    feeStats: feeStats || {},
    classSummary,
    announcements,
    onboarding: { checks: onboardingChecks, completed, total: 5, isComplete: completed === 5 },
  };
}

async function createStudentInClient(
  client: PoolClient,
  schoolId: UUID,
  schoolClass: SchoolClassRow,
  schoolYear: string,
  data: StudentCreateInput,
) {
  const { rows: existingMobile } = await client.query<UserIdRow>(
    'SELECT id,role FROM users WHERE mobile=$1 LIMIT 1', [data.mobile],
  );
  if (existingMobile.length) {
    throw Object.assign(new Error(`Mobile ${data.mobile} already belongs to an account`), { statusCode: 409 });
  }
  if (data.email) {
    const { rows } = await client.query('SELECT 1 FROM users WHERE LOWER(email)=LOWER($1) LIMIT 1', [data.email]);
    if (rows.length) throw Object.assign(new Error(`Email ${data.email} is already in use`), { statusCode: 409 });
  }

  const username = await allocateUsername(client, data.name, data.username);
  const temporaryPassword = data.password || generateTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);
  const { rows: [user] } = await client.query<UserIdRow>(
    `INSERT INTO users (mobile,name,username,email,password_hash,password_changed_at,must_change_password,role,language)
     VALUES ($1,$2,$3,$4,$5,NOW(),$6,'STUDENT',$7)
     RETURNING id,name,username,email,mobile`,
    [data.mobile, data.name, username, data.email || null, passwordHash, !data.password, data.language || 'hi'],
  );
  if (!user) throw new Error('Student user insert returned no row');
  const { rows: [student] } = await client.query<CreatedStudentRow>(
    `INSERT INTO students
      (user_id,school_id,class_id,roll_number,academic_year,grade_level,date_of_birth,gender,school_link_status,school_link_reviewed_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'APPROVED',NOW())
     RETURNING id,student_code,roll_number,grade_level,academic_year`,
    [user.id, schoolId, schoolClass.id, data.rollNumber || null, schoolYear,
     schoolClass.class_name, data.dob || null, data.gender || null],
  );
  if (!student) throw new Error('Student profile insert returned no row');

  if (data.parentMobile || data.parentEmail) {
    const { rows: [parent] } = await client.query<GenericIdRow>(
      `SELECT id FROM users
       WHERE role='PARENT' AND ((mobile IS NOT NULL AND mobile=$1) OR (email IS NOT NULL AND LOWER(email)=LOWER($2)))
       LIMIT 1`,
      [data.parentMobile || '', data.parentEmail || ''],
    );
    if (parent) {
      await client.query(
        `INSERT INTO parent_student_links(parent_user_id,student_id,relation,is_primary)
         VALUES($1,$2,$3,TRUE) ON CONFLICT(parent_user_id,student_id) DO UPDATE SET relation=EXCLUDED.relation`,
        [parent.id, student.id, data.parentRelation || 'PARENT'],
      );
    } else {
      await client.query(
        `INSERT INTO parent_link_requests(student_id,parent_name,parent_mobile,parent_email,relation,status)
         VALUES($1,$2,$3,$4,$5,'PENDING')`,
        [student.id, data.parentName || null, data.parentMobile || null, data.parentEmail || null, data.parentRelation || 'PARENT'],
      );
    }
  }
  return { ...student, ...user, temporaryPassword: data.password ? null : temporaryPassword };
}

export async function addStudent(schoolId: UUID, data: StudentCreateInput) {
  const school = await getSchoolMeta(schoolId);
  return transaction(async (client) => {
    const schoolClass = await ensureClass(client, schoolId, data.classId);
    const result = await createStudentInClient(client, schoolId, schoolClass, school.academic_year, data);
    await client.query("UPDATE schools SET total_students=(SELECT COUNT(*) FROM students WHERE school_id=$1 AND status='ACTIVE' AND school_link_status='APPROVED'),updated_at=NOW() WHERE id=$1", [schoolId]);
    return result;
  });
}

export async function bulkAddStudents(schoolId: UUID, students: StudentCreateInput[]) {
  const school = await getSchoolMeta(schoolId);
  return transaction(async (client) => {
    const created = [];
    for (const data of students) {
      const schoolClass = await ensureClass(client, schoolId, data.classId);
      created.push(await createStudentInClient(client, schoolId, schoolClass, school.academic_year, data));
    }
    await client.query("UPDATE schools SET total_students=(SELECT COUNT(*) FROM students WHERE school_id=$1 AND status='ACTIVE' AND school_link_status='APPROVED'),updated_at=NOW() WHERE id=$1", [schoolId]);
    return created;
  });
}

export async function getStudentDetail(schoolId: UUID, studentId: UUID) {
  const { rows: [student] } = await query<StudentDetailRow>(
    `SELECT s.id,s.student_code,s.roll_number,s.grade_level,s.academic_year,s.date_of_birth,s.gender,s.status,s.school_link_status,
            u.name,u.username,u.email,u.mobile,u.language,
            sc.id AS class_id,sc.class_name,sc.section,
            COALESCE((SELECT json_agg(json_build_object('id',pu.id,'name',pu.name,'mobile',pu.mobile,'email',pu.email,'relation',psl.relation,'isPrimary',psl.is_primary))
                      FROM parent_student_links psl JOIN users pu ON pu.id=psl.parent_user_id WHERE psl.student_id=s.id),'[]'::json) AS parents
     FROM students s JOIN users u ON u.id=s.user_id
     LEFT JOIN school_classes sc ON sc.id=s.class_id
     WHERE s.id=$1 AND s.school_id=$2 AND s.school_link_status='APPROVED'`,
    [studentId, schoolId],
  );
  if (!student) throw Object.assign(new Error('Student not found in this school'), { statusCode: 404 });
  const [attendance, fees, results, parentRequests] = await Promise.all([
    query('SELECT year,month,working_days,present_days,absent_days,late_days,half_days,percentage FROM attendance_monthly_summary WHERE student_id=$1 ORDER BY year DESC,month DESC LIMIT 12', [studentId]).then((r) => r.rows),
    query('SELECT id,invoice_number,term,amount_due,amount_paid,amount_waived,status,due_date FROM fee_invoices WHERE student_id=$1 AND academic_year=$2 ORDER BY term', [studentId, student.academic_year]).then((r) => r.rows),
    query(`SELECT e.id,e.title,ea.total_marks,ea.correct_count,ea.wrong_count,ea.rank_school,ea.submitted_at,
                  ROUND((ea.total_marks/NULLIF(e.total_questions*e.marks_per_question,0))*100,1) AS percentage
           FROM exam_attempts ea JOIN exams e ON e.id=ea.exam_id
           WHERE ea.student_id=$1 AND ea.status='SCORED' ORDER BY ea.submitted_at DESC LIMIT 10`, [studentId]).then((r) => r.rows),
    query('SELECT id,parent_name,parent_mobile,parent_email,relation,status,created_at FROM parent_link_requests WHERE student_id=$1 ORDER BY created_at DESC', [studentId]).then((r) => r.rows),
  ]);
  return { ...student, attendance, fees, results, parentRequests };
}

export async function updateStudent(schoolId: UUID, studentId: UUID, data: StudentUpdateInput) {
  return transaction(async (client) => {
    const { rows: [current] } = await client.query<CurrentStudentRow>(
      `SELECT s.*,u.id AS user_id FROM students s JOIN users u ON u.id=s.user_id
       WHERE s.id=$1 AND s.school_id=$2 AND s.school_link_status='APPROVED' FOR UPDATE`,
      [studentId, schoolId],
    );
    if (!current) throw Object.assign(new Error('Student not found in this school'), { statusCode: 404 });
    let classRow: SchoolClassRow | null = null;
    if (data.classId) classRow = await ensureClass(client, schoolId, data.classId);
    await client.query(
      'UPDATE users SET name=COALESCE($2,name),email=COALESCE($3,email),mobile=COALESCE($4,mobile),updated_at=NOW() WHERE id=$1',
      [current.user_id, data.name || null, data.email || null, data.mobile || null],
    );
    const { rows: [updated] } = await client.query(
      `UPDATE students SET class_id=COALESCE($3,class_id),grade_level=COALESCE($4,grade_level),
              academic_year=COALESCE($5,academic_year),roll_number=COALESCE($6,roll_number),status=COALESCE($7,status),updated_at=NOW()
       WHERE id=$1 AND school_id=$2 RETURNING *`,
      [studentId, schoolId, classRow?.id || null, classRow?.class_name || null, classRow?.academic_year || null,
       data.rollNumber || null, data.status || null],
    );
    return updated;
  });
}

export async function linkParent(schoolId: UUID, studentId: UUID, data: ParentLinkInput) {
  return transaction(async (client) => {
    const { rows: [student] } = await client.query<GenericIdRow>(
      "SELECT id FROM students WHERE id=$1 AND school_id=$2 AND school_link_status='APPROVED'",
      [studentId, schoolId],
    );
    if (!student) throw Object.assign(new Error('Student not found in this school'), { statusCode: 404 });
    const { rows: [parent] } = await client.query<ParentRow>(
      `SELECT id,name,mobile,email FROM users WHERE role='PARENT' AND ((mobile IS NOT NULL AND mobile=$1) OR (email IS NOT NULL AND LOWER(email)=LOWER($2))) LIMIT 1`,
      [data.mobile || '', data.email || ''],
    );
    if (parent) {
      await client.query('INSERT INTO parent_student_links(parent_user_id,student_id,relation,is_primary) VALUES($1,$2,$3,$4) ON CONFLICT(parent_user_id,student_id) DO UPDATE SET relation=EXCLUDED.relation,is_primary=EXCLUDED.is_primary', [parent.id, studentId, data.relation || 'PARENT', data.isPrimary !== false]);
      return { status: 'LINKED', parent };
    }
    const { rows: [request] } = await client.query(
      `INSERT INTO parent_link_requests(student_id,parent_name,parent_mobile,parent_email,relation,status)
       VALUES($1,$2,$3,$4,$5,'PENDING') RETURNING *`,
      [studentId, data.name || null, data.mobile || null, data.email || null, data.relation || 'PARENT'],
    );
    return { status: 'PENDING', request };
  });
}

export async function getClasses(schoolId: UUID, includeInactive = false) {
  const { rows } = await query(
    `SELECT sc.id,sc.class_name,sc.section,sc.academic_year,sc.room_number,COALESCE(sc.is_active,TRUE) AS is_active,
            COUNT(DISTINCT st.id) FILTER(WHERE st.status='ACTIVE' AND st.school_link_status='APPROVED')::INT AS student_count,
            COUNT(DISTINCT ta.teacher_id)::INT AS teacher_count
     FROM school_classes sc
     LEFT JOIN students st ON st.class_id=sc.id
     LEFT JOIN teacher_assignments ta ON ta.class_id=sc.id AND ta.academic_year=sc.academic_year
     WHERE sc.school_id=$1 ${includeInactive ? '' : 'AND COALESCE(sc.is_active,TRUE)=TRUE'}
     GROUP BY sc.id
     ORDER BY NULLIF(regexp_replace(sc.class_name,'[^0-9]','','g'),'')::INT NULLS LAST,sc.class_name,sc.section`,
    [schoolId],
  );
  return rows;
}

export async function createClass(schoolId: UUID, data: ClassInput) {
  const school = await getSchoolMeta(schoolId);
  const { rows: [row] } = await query(
    `INSERT INTO school_classes(school_id,class_name,section,academic_year,room_number,is_active)
     VALUES($1,$2,$3,$4,$5,TRUE) RETURNING *`,
    [schoolId, data.className, data.section || 'A', data.academicYear || school.academic_year, data.roomNumber || null],
  );
  return row;
}

export async function updateClass(schoolId: UUID, classId: UUID, data: ClassUpdateInput) {
  const { rows: [row] } = await query(
    `UPDATE school_classes SET class_name=COALESCE($3,class_name),section=COALESCE($4,section),
            academic_year=COALESCE($5,academic_year),room_number=COALESCE($6,room_number),is_active=COALESCE($7,is_active)
     WHERE id=$1 AND school_id=$2 RETURNING *`,
    [classId, schoolId, data.className || null, data.section || null, data.academicYear || null,
     data.roomNumber ?? null, typeof data.isActive === 'boolean' ? data.isActive : null],
  );
  if (!row) throw Object.assign(new Error('Class not found'), { statusCode: 404 });
  return row;
}

export async function archiveClass(schoolId: UUID, classId: UUID) {
  const { rows: [count] } = await query<CountRow>(
    "SELECT COUNT(*)::INT AS count FROM students WHERE class_id=$1 AND school_id=$2 AND status='ACTIVE' AND school_link_status='APPROVED'",
    [classId, schoolId],
  );
  if (Number(count?.count || 0) > 0) {
    throw Object.assign(new Error('Move active Students out of this class before archiving it'), { statusCode: 409 });
  }
  return updateClass(schoolId, classId, { isActive: false });
}

export async function getSubjects() {
  return (await query('SELECT id,code,name,name_hi,color_hex,board FROM subjects WHERE is_active=TRUE ORDER BY sort_order,name')).rows;
}

export async function getTeachers(schoolId: UUID) {
  const { rows } = await query(
    `SELECT t.id,t.employee_id,t.designation,t.qualification,t.experience_yrs,t.employment_type,t.status,t.joined_date,
            u.name,u.username,u.email,u.mobile,
            COALESCE(json_agg(DISTINCT jsonb_build_object('id',ta.id,'classId',sc.id,'className',sc.class_name,'section',sc.section,'subjectCode',ta.subject_code,'isClassTeacher',ta.is_class_teacher)) FILTER(WHERE ta.id IS NOT NULL),'[]'::json) AS assignments
     FROM teachers t JOIN users u ON u.id=t.user_id
     LEFT JOIN teacher_assignments ta ON ta.teacher_id=t.id
     LEFT JOIN school_classes sc ON sc.id=ta.class_id
     WHERE t.school_id=$1
     GROUP BY t.id,u.id ORDER BY CASE WHEN t.status='ACTIVE' THEN 0 ELSE 1 END,u.name`,
    [schoolId],
  );
  return rows;
}

async function validateAssignments(client: PoolClient, schoolId: UUID, assignments: TeacherAssignmentInput[]): Promise<void> {
  for (const assignment of assignments) {
    await ensureClass(client, schoolId, assignment.classId);
    const { rows } = await client.query('SELECT 1 FROM subjects WHERE code=$1 AND is_active=TRUE', [assignment.subjectCode]);
    if (!rows.length) {
      throw Object.assign(new Error(`Unknown subject code ${assignment.subjectCode}`), { statusCode: 400 });
    }
  }
}

async function replaceAssignments(
  client: PoolClient,
  teacherId: UUID,
  schoolId: UUID,
  academicYear: string,
  assignments: TeacherAssignmentInput[],
): Promise<void> {
  await validateAssignments(client, schoolId, assignments);
  await client.query('DELETE FROM teacher_assignments WHERE teacher_id=$1 AND academic_year=$2', [teacherId, academicYear]);
  for (const assignment of assignments) {
    await client.query(
      `INSERT INTO teacher_assignments(teacher_id,school_id,class_id,subject_code,academic_year,is_class_teacher)
       VALUES($1,$2,$3,$4,$5,$6)`,
      [teacherId, schoolId, assignment.classId, assignment.subjectCode, academicYear, Boolean(assignment.isClassTeacher)],
    );
  }
}

export async function addTeacher(schoolId: UUID, data: TeacherInput) {
  const school = await getSchoolMeta(schoolId);
  return transaction(async (client) => {
    const { rows: existing } = await client.query(
      'SELECT 1 FROM users WHERE mobile=$1 OR ($2::text IS NOT NULL AND LOWER(email)=LOWER($2)) LIMIT 1',
      [data.mobile, data.email || null],
    );
    if (existing.length) throw Object.assign(new Error('Teacher mobile/email is already registered'), { statusCode: 409 });
    const username = await allocateUsername(client, data.name, data.username);
    const temporaryPassword = data.password || generateTemporaryPassword();
    const passwordHash = await hashPassword(temporaryPassword);
    const { rows: [user] } = await client.query<UserIdRow>(
      `INSERT INTO users(mobile,name,username,email,password_hash,password_changed_at,must_change_password,role,language)
       VALUES($1,$2,$3,$4,$5,NOW(),$6,'TEACHER',$7) RETURNING id,name,username,email,mobile`,
      [data.mobile, data.name, username, data.email || null, passwordHash, !data.password, data.language || 'en'],
    );
    if (!user) throw new Error('Teacher user insert returned no row');
    const { rows: [teacher] } = await client.query<MutableSchoolRow>(
      `INSERT INTO teachers(user_id,school_id,employee_id,designation,qualification,experience_yrs,employment_type,status,joined_date,email_official)
       VALUES($1,$2,$3,$4,$5,$6,$7,'ACTIVE',$8,$9) RETURNING *`,
      [user.id, schoolId, data.employeeId || null, data.designation || 'Teacher', data.qualification || null,
       data.experienceYears || 0, data.employmentType || 'FULL_TIME', data.joinedDate || new Date(), data.email || null],
    );
    if (!teacher) throw new Error('Teacher profile insert returned no row');
    await replaceAssignments(client, teacher.id, schoolId, school.academic_year, data.assignments || []);
    await client.query("UPDATE schools SET total_teachers=(SELECT COUNT(*) FROM teachers WHERE school_id=$1 AND status='ACTIVE'),updated_at=NOW() WHERE id=$1", [schoolId]);
    return { ...teacher, ...user, temporaryPassword: data.password ? null : temporaryPassword };
  });
}

export async function updateTeacher(schoolId: UUID, teacherId: UUID, data: Partial<TeacherInput>) {
  const school = await getSchoolMeta(schoolId);
  return transaction(async (client) => {
    const { rows: [teacher] } = await client.query<TeacherCurrentRow>(
      'SELECT t.*,u.id AS uid FROM teachers t JOIN users u ON u.id=t.user_id WHERE t.id=$1 AND t.school_id=$2 FOR UPDATE',
      [teacherId, schoolId],
    );
    if (!teacher) throw Object.assign(new Error('Teacher not found'), { statusCode: 404 });
    await client.query(
      'UPDATE users SET name=COALESCE($2,name),email=COALESCE($3,email),mobile=COALESCE($4,mobile),updated_at=NOW() WHERE id=$1',
      [teacher.uid, data.name || null, data.email || null, data.mobile || null],
    );
    const { rows: [updated] } = await client.query(
      `UPDATE teachers SET employee_id=COALESCE($3,employee_id),designation=COALESCE($4,designation),qualification=COALESCE($5,qualification),experience_yrs=COALESCE($6,experience_yrs),employment_type=COALESCE($7,employment_type),status=COALESCE($8,status),updated_at=NOW()
       WHERE id=$1 AND school_id=$2 RETURNING *`,
      [teacherId, schoolId, data.employeeId || null, data.designation || null, data.qualification || null,
       data.experienceYears ?? null, data.employmentType || null, data.status || null],
    );
    if (data.assignments) await replaceAssignments(client, teacherId, schoolId, school.academic_year, data.assignments);
    await client.query("UPDATE schools SET total_teachers=(SELECT COUNT(*) FROM teachers WHERE school_id=$1 AND status='ACTIVE'),updated_at=NOW() WHERE id=$1", [schoolId]);
    return updated;
  });
}

export async function deactivateTeacher(schoolId: UUID, teacherId: UUID) {
  return updateTeacher(schoolId, teacherId, { status: 'INACTIVE', assignments: [] });
}

export async function getAttendanceRoster(schoolId: UUID, classId: UUID, date: string) {
  const { rows } = await query(
    `SELECT st.id,st.student_code,st.roll_number,u.name,
            COALESCE(a.status::text,'') AS attendance_status,a.remark
     FROM students st JOIN users u ON u.id=st.user_id
     JOIN school_classes sc ON sc.id=st.class_id AND sc.school_id=$1
     LEFT JOIN attendance a ON a.student_id=st.id AND a.date=$3
     WHERE st.school_id=$1 AND st.class_id=$2 AND st.status='ACTIVE' AND st.school_link_status='APPROVED'
     ORDER BY st.roll_number NULLS LAST,u.name`,
    [schoolId, classId, date],
  );
  return rows;
}

export async function markAttendance(
  schoolId: UUID,
  classId: UUID,
  date: string,
  records: AttendanceInput[],
  markedBy: UUID,
) {
  return transaction(async (client) => {
    await ensureClass(client, schoolId, classId);
    const ids = records.map((record) => record.studentId);
    const { rows: validRows } = await client.query<GenericIdRow>(
      `SELECT id FROM students WHERE school_id=$1 AND class_id=$2 AND status='ACTIVE' AND school_link_status='APPROVED' AND id=ANY($3::uuid[])`,
      [schoolId, classId, ids],
    );
    if (validRows.length !== ids.length) {
      throw Object.assign(new Error('Attendance contains Students outside this approved class roster'), { statusCode: 400 });
    }
    const results: AttendanceSavedRow[] = [];
    for (const record of records) {
      const { rows: [attendance] } = await client.query<AttendanceSavedRow>(
        `INSERT INTO attendance(student_id,school_id,class_id,date,status,marked_by,remark)
         VALUES($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT(student_id,date) DO UPDATE SET status=EXCLUDED.status,remark=EXCLUDED.remark,marked_by=EXCLUDED.marked_by
         RETURNING id,student_id,status`,
        [record.studentId, schoolId, classId, date, record.status, markedBy, record.remark || null],
      );
      if (attendance) results.push(attendance);
    }
    const absentIds = records.filter((record) => record.status === 'ABSENT').map((record) => record.studentId);
    if (absentIds.length) {
      notifyAbsentParents(absentIds, date).catch((error: unknown) => logger.error('Absent notify error:', error));
    }
    return results;
  });
}

export async function notifyAbsentParents(studentIds: UUID[], date: string): Promise<void> {
  const { rows } = await query<AbsentParentRow>(
    `SELECT s.id AS student_id,u.name AS student_name,pu.id AS parent_user_id,pu.mobile AS parent_mobile,s.school_id
     FROM students s JOIN users u ON u.id=s.user_id
     JOIN parent_student_links psl ON psl.student_id=s.id
     JOIN users pu ON pu.id=psl.parent_user_id
     WHERE s.id=ANY($1::uuid[])`, [studentIds],
  );
  for (const row of rows) {
    try {
      await notificationService.notifyAttendanceAbsent(row.parent_mobile, row.student_name, date);
      await notificationService.saveNotification({
        userId: row.parent_user_id,
        schoolId: row.school_id,
        type: 'ATTENDANCE_ABSENT',
        title: `${row.student_name} absent`,
        body: `${row.student_name} was marked absent on ${date}.`,
        refId: row.student_id,
        refType: 'STUDENT',
      });
    } catch (error: unknown) {
      logger.error('Attendance parent notification failed:', errorMessage(error));
    }
  }
}

export async function getAttendanceSummary(schoolId: UUID, date: string) {
  const { rows } = await query(
    `SELECT sc.id,sc.class_name,sc.section,
            COUNT(st.id) FILTER(WHERE st.status='ACTIVE' AND st.school_link_status='APPROVED')::INT AS total_students,
            COUNT(a.id) FILTER(WHERE a.status='PRESENT')::INT AS present,
            COUNT(a.id) FILTER(WHERE a.status='ABSENT')::INT AS absent,
            COUNT(a.id) FILTER(WHERE a.status='LATE')::INT AS late,
            COUNT(a.id) FILTER(WHERE a.status='HALF_DAY')::INT AS half_day,
            COUNT(a.id) FILTER(WHERE a.status='HOLIDAY')::INT AS holiday
     FROM school_classes sc
     LEFT JOIN students st ON st.class_id=sc.id
     LEFT JOIN attendance a ON a.student_id=st.id AND a.date=$2
     WHERE sc.school_id=$1 AND COALESCE(sc.is_active,TRUE)=TRUE
     GROUP BY sc.id ORDER BY sc.class_name,sc.section`,
    [schoolId, date],
  );
  return rows;
}

export async function getFeeOverview(schoolId: UUID, academicYear?: string) {
  const school = await getSchoolMeta(schoolId);
  const year = academicYear || school.academic_year;
  await query("UPDATE fee_invoices SET status='OVERDUE',updated_at=NOW() WHERE school_id=$1 AND academic_year=$2 AND due_date<CURRENT_DATE AND status IN ('PENDING','PARTIAL')", [schoolId, year]);
  const { rows: invoices } = await query<FeeInvoiceOverviewRow>(
    `SELECT fi.id,st.id AS student_id,st.student_code,u.name,sc.class_name,sc.section,
            fi.term,fi.invoice_number,fi.amount_due,fi.amount_paid,fi.amount_waived,
            GREATEST(fi.amount_due-fi.amount_paid-fi.amount_waived,0) AS outstanding,
            fi.status,fi.due_date
     FROM fee_invoices fi JOIN students st ON st.id=fi.student_id JOIN users u ON u.id=st.user_id
     LEFT JOIN school_classes sc ON sc.id=st.class_id
     WHERE fi.school_id=$1 AND fi.academic_year=$2 AND st.school_link_status='APPROVED'
     ORDER BY CASE fi.status WHEN 'OVERDUE' THEN 0 WHEN 'PENDING' THEN 1 WHEN 'PARTIAL' THEN 2 ELSE 3 END,fi.due_date,u.name`,
    [schoolId, year],
  );
  const summary: Record<string, number> = {
    amountDue: 0, collected: 0, outstanding: 0, PAID: 0, PENDING: 0, PARTIAL: 0, OVERDUE: 0, WAIVED: 0,
  };
  for (const invoice of invoices) {
    summary.amountDue = (summary.amountDue || 0) + Number(invoice.amount_due || 0);
    summary.collected = (summary.collected || 0) + Number(invoice.amount_paid || 0);
    summary.outstanding = (summary.outstanding || 0) + Number(invoice.outstanding || 0);
    summary[invoice.status] = (summary[invoice.status] || 0) + 1;
  }
  return { academicYear: year, summary, invoices };
}

export async function getFeeStructures(schoolId: UUID, academicYear?: string) {
  const school = await getSchoolMeta(schoolId);
  const year = academicYear || school.academic_year;
  const { rows } = await query('SELECT * FROM fee_structures WHERE school_id=$1 AND academic_year=$2 ORDER BY class_name,term,fee_head', [schoolId, year]);
  return { academicYear: year, structures: rows };
}

export async function upsertFeeStructure(schoolId: UUID, data: FeeStructureInput) {
  const school = await getSchoolMeta(schoolId);
  const year = data.academicYear || school.academic_year;
  const { rows: [row] } = await query(
    `INSERT INTO fee_structures(school_id,class_name,academic_year,term,fee_head,amount,due_date,is_optional)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT(school_id,class_name,academic_year,term,fee_head) DO UPDATE SET amount=EXCLUDED.amount,due_date=EXCLUDED.due_date,is_optional=EXCLUDED.is_optional,updated_at=NOW()
     RETURNING *`,
    [schoolId, data.className, year, data.term, data.feeHead, data.amount, data.dueDate || null, Boolean(data.isOptional)],
  );
  return row;
}

export async function generateFeeInvoices(schoolId: UUID, data: GenerateInvoicesInput) {
  const school = await getSchoolMeta(schoolId);
  const year = data.academicYear || school.academic_year;
  return transaction(async (client) => {
    const schoolClass = await ensureClass(client, schoolId, data.classId);
    const { rows: [total] } = await client.query<FeeTotalRow>(
      `SELECT COALESCE(SUM(amount),0) AS amount,MAX(due_date) AS default_due FROM fee_structures
       WHERE school_id=$1 AND class_name=$2 AND academic_year=$3 AND term=$4 AND is_optional=FALSE`,
      [schoolId, schoolClass.class_name, year, data.term],
    );
    if (!total || Number(total.amount || 0) <= 0) {
      throw Object.assign(new Error('Create a mandatory fee structure for this class/term first'), { statusCode: 400 });
    }
    const { rows: students } = await client.query<FeeStudentRow>(
      "SELECT id,student_code FROM students WHERE school_id=$1 AND class_id=$2 AND status='ACTIVE' AND school_link_status='APPROVED'",
      [schoolId, data.classId],
    );
    let created = 0;
    for (const student of students) {
      const invoiceNumber = `VS-INV-${year.replace(/[^0-9]/g, '')}-T${data.term}-${student.student_code}`;
      const result = await client.query(
        `INSERT INTO fee_invoices(school_id,student_id,academic_year,term,invoice_number,amount_due,due_date,status)
         VALUES($1,$2,$3,$4,$5,$6,$7,'PENDING') ON CONFLICT(student_id,academic_year,term) DO NOTHING RETURNING id`,
        [schoolId, student.id, year, data.term, invoiceNumber, total.amount, data.dueDate || total.default_due || null],
      );
      created += result.rowCount || 0;
    }
    return { created, students: students.length, amountPerStudent: Number(total.amount), academicYear: year, term: data.term };
  });
}

export async function recordFeePayment(schoolId: UUID, data: FeePaymentInput) {
  return transaction(async (client) => {
    const { rows: [invoice] } = await client.query<FeeInvoiceRow>(
      'SELECT * FROM fee_invoices WHERE id=$1 AND school_id=$2 FOR UPDATE', [data.invoiceId, schoolId],
    );
    if (!invoice) throw Object.assign(new Error('Invoice not found'), { statusCode: 404 });
    if (invoice.status === 'PAID' || invoice.status === 'WAIVED') {
      throw Object.assign(new Error('Invoice has no collectible balance'), { statusCode: 409 });
    }
    const outstanding = Number(invoice.amount_due) - Number(invoice.amount_paid) - Number(invoice.amount_waived);
    if (Number(data.amount) > outstanding + 0.001) {
      throw Object.assign(new Error(`Payment exceeds outstanding amount ₹${outstanding.toFixed(2)}`), { statusCode: 400 });
    }
    const { rows: [sequence] } = await client.query<SequenceRow>("SELECT nextval('receipt_number_seq') AS seq");
    if (!sequence) throw new Error('Receipt sequence returned no row');
    const receiptNumber = `VS-REC-${new Date().getFullYear()}-${String(sequence.seq).padStart(6, '0')}`;
    const { rows: [payment] } = await client.query(
      `INSERT INTO fee_payments(invoice_id,school_id,student_id,amount,mode,razorpay_payment_id,transaction_ref,collected_by,paid_at,notes,receipt_number)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [invoice.id, schoolId, invoice.student_id, data.amount, data.paymentMode,
       data.razorpayPaymentId || null, data.transactionRef || null, data.collectedBy,
       data.paymentDate || new Date(), data.notes || null, receiptNumber],
    );
    return { payment, receiptNumber };
  });
}

export async function getFeePayments(schoolId: UUID, invoiceId?: UUID | null) {
  return (await query(
    'SELECT fp.*,u.name AS collected_by_name FROM fee_payments fp LEFT JOIN users u ON u.id=fp.collected_by WHERE fp.school_id=$1 AND ($2::uuid IS NULL OR fp.invoice_id=$2) ORDER BY fp.paid_at DESC LIMIT 100',
    [schoolId, invoiceId || null],
  )).rows;
}

export async function sendFeeReminders(schoolId: UUID) {
  const { rows } = await query<FeeReminderRow>(
    `SELECT fi.id,u.name AS student_name,pu.id AS parent_user_id,pu.mobile AS parent_mobile,
            GREATEST(fi.amount_due-fi.amount_paid-fi.amount_waived,0) AS outstanding,fi.due_date
     FROM fee_invoices fi JOIN students st ON st.id=fi.student_id JOIN users u ON u.id=st.user_id
     JOIN parent_student_links psl ON psl.student_id=st.id AND psl.is_primary=TRUE
     JOIN users pu ON pu.id=psl.parent_user_id
     WHERE fi.school_id=$1 AND fi.status IN('PENDING','PARTIAL','OVERDUE') AND st.school_link_status='APPROVED'`,
    [schoolId],
  );
  let sent = 0;
  for (const row of rows) {
    try {
      await notificationService.notifyFeeReminder(
        row.parent_mobile,
        row.student_name,
        row.outstanding,
        row.due_date ? new Date(row.due_date).toLocaleDateString('en-IN') : 'soon',
      );
      await notificationService.saveNotification({
        userId: row.parent_user_id,
        schoolId,
        type: row.due_date && new Date(row.due_date) < new Date() ? 'FEE_OVERDUE' : 'FEE_REMINDER',
        title: `Fee reminder for ${row.student_name}`,
        body: `Outstanding fee: ₹${row.outstanding}`,
        refId: row.id,
        refType: 'FEE_INVOICE',
      });
      sent += 1;
    } catch (error: unknown) {
      logger.error('Fee reminder failed:', errorMessage(error));
    }
  }
  return { sent, total: rows.length };
}

export async function getTimetable(schoolId: UUID, classId: UUID) {
  const { rows } = await query(
    `SELECT tp.id,tp.day,tp.period_number,tp.start_time,tp.end_time,tp.subject_code,tp.teacher_id,tp.room_number,tp.is_break,tp.break_label,tp.academic_year,
            subj.name AS subject,subj.name_hi AS subject_hi,u.name AS teacher_name
     FROM timetable_periods tp
     LEFT JOIN subjects subj ON subj.code=tp.subject_code
     LEFT JOIN teachers t ON t.id=tp.teacher_id
     LEFT JOIN users u ON u.id=t.user_id
     WHERE tp.class_id=$1 AND tp.school_id=$2
     ORDER BY tp.day,tp.period_number`, [classId, schoolId],
  );
  return rows;
}

export async function saveTimetable(classId: UUID, schoolId: UUID, periods: TimetableInput[]) {
  const school = await getSchoolMeta(schoolId);
  return transaction(async (client) => {
    await ensureClass(client, schoolId, classId);
    for (const period of periods) {
      if (!period.isBreak && !period.subjectCode) {
        throw Object.assign(new Error('Subject is required for teaching periods'), { statusCode: 400 });
      }
      if (period.teacherId) {
        const { rows: [teacher] } = await client.query<GenericIdRow>(
          "SELECT id FROM teachers WHERE id=$1 AND school_id=$2 AND status='ACTIVE'", [period.teacherId, schoolId],
        );
        if (!teacher) {
          throw Object.assign(new Error('Timetable teacher is not active in this school'), { statusCode: 400 });
        }
        const { rows: conflicts } = await client.query(
          'SELECT 1 FROM timetable_periods WHERE school_id=$1 AND teacher_id=$2 AND class_id<>$3 AND day=$4 AND period_number=$5 AND academic_year=$6 LIMIT 1',
          [schoolId, period.teacherId, classId, period.day, period.periodNumber, school.academic_year],
        );
        if (conflicts.length) {
          throw Object.assign(new Error(`Teacher conflict on ${period.day} period ${period.periodNumber}`), { statusCode: 409 });
        }
      }
    }
    await client.query('DELETE FROM timetable_periods WHERE class_id=$1 AND school_id=$2 AND academic_year=$3', [classId, schoolId, school.academic_year]);
    for (const period of periods) {
      await client.query(
        `INSERT INTO timetable_periods(school_id,class_id,teacher_id,subject_code,day,period_number,start_time,end_time,room_number,academic_year,is_break,break_label)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [schoolId, classId, period.teacherId || null, period.isBreak ? null : period.subjectCode, period.day, period.periodNumber,
         period.startTime, period.endTime, period.roomNumber || null, school.academic_year, Boolean(period.isBreak),
         period.isBreak ? (period.breakLabel || 'Break') : null],
      );
    }
    return getTimetable(schoolId, classId);
  });
}

export async function getExams(schoolId: UUID) {
  return (await query(
    `SELECT e.id,e.title,e.description,e.type,e.status,e.class_names,e.subject_codes,e.total_questions,e.duration_mins,e.marks_per_question,e.negative_marks,e.start_time,e.end_time,e.results_at,
            COUNT(DISTINCT q.id)::INT AS question_count,COUNT(DISTINCT er.id)::INT AS registrations,COUNT(DISTINCT ea.id) FILTER(WHERE ea.status='SCORED')::INT AS scored_attempts
     FROM exams e LEFT JOIN exam_questions q ON q.exam_id=e.id LEFT JOIN exam_registrations er ON er.exam_id=e.id LEFT JOIN exam_attempts ea ON ea.exam_id=e.id
     WHERE e.school_id=$1 GROUP BY e.id ORDER BY e.start_time DESC`, [schoolId],
  )).rows;
}

export async function getExamDetail(schoolId: UUID, examId: UUID) {
  const { rows: [exam] } = await query<ExamDetailRow>('SELECT * FROM exams WHERE id=$1 AND school_id=$2', [examId, schoolId]);
  if (!exam) throw Object.assign(new Error('School exam not found'), { statusCode: 404 });
  const questions = (await query(
    'SELECT id,question_text,question_hi,option_a,option_b,option_c,option_d,correct_option,explanation,subject_code,difficulty,sort_order FROM exam_questions WHERE exam_id=$1 ORDER BY sort_order,id',
    [examId],
  )).rows;
  return { ...exam, questions };
}

export async function createSchoolExam(schoolId: UUID, userId: UUID, data: SchoolExamInput) {
  const exam = await competitionService.createExam({ ...data, schoolId, type: 'SCHOOL_TEST' }, userId);
  if (!exam || typeof exam.id !== 'string') throw new Error('School exam insert returned no id');
  if (data.questions?.length) await competitionService.addQuestions(exam.id, data.questions);
  return getExamDetail(schoolId, exam.id);
}

export async function addExamQuestions(schoolId: UUID, examId: UUID, questions: ExamQuestionInput[]) {
  await getExamDetail(schoolId, examId);
  await competitionService.addQuestions(examId, questions);
  return getExamDetail(schoolId, examId);
}

export async function updateExamStatus(schoolId: UUID, examId: UUID, status: string) {
  const { rows: [row] } = await query(
    'UPDATE exams SET status=$3,updated_at=NOW() WHERE id=$1 AND school_id=$2 RETURNING id,title,status',
    [examId, schoolId, status],
  );
  if (!row) throw Object.assign(new Error('School exam not found'), { statusCode: 404 });
  return row;
}

export async function getResults(schoolId: UUID) {
  return (await query(
    `SELECT e.id AS exam_id,e.title AS exam_name,e.total_questions,e.marks_per_question,sc.class_name,sc.section,
            ROUND(AVG((ea.total_marks/NULLIF(e.total_questions*e.marks_per_question,0))*100),1) AS avg_score,
            COUNT(ea.id) FILTER(WHERE (ea.total_marks/NULLIF(e.total_questions*e.marks_per_question,0))*100>=33)::INT AS pass_count,
            COUNT(ea.id)::INT AS total_attempts
     FROM exams e JOIN exam_attempts ea ON ea.exam_id=e.id AND ea.status='SCORED'
     JOIN students st ON st.id=ea.student_id AND st.school_id=$1 AND st.school_link_status='APPROVED'
     JOIN school_classes sc ON sc.id=st.class_id
     WHERE e.school_id=$1
     GROUP BY e.id,sc.id ORDER BY e.start_time DESC,sc.class_name,sc.section`, [schoolId],
  )).rows;
}

export async function getResultDetail(schoolId: UUID, examId: UUID) {
  const { rows: [exam] } = await query<ExamDetailRow>(
    'SELECT id,title,total_questions,marks_per_question,status FROM exams WHERE id=$1 AND school_id=$2',
    [examId, schoolId],
  );
  if (!exam) throw Object.assign(new Error('School exam not found'), { statusCode: 404 });
  const maxMarks = Number(exam.total_questions) * Number(exam.marks_per_question);
  const rows = (await query(
    `SELECT st.id AS student_id,st.student_code,st.roll_number,u.name,sc.class_name,sc.section,
            ea.total_marks,ea.correct_count,ea.wrong_count,ea.skipped_count,ea.rank_school,ea.submitted_at,
            ROUND((ea.total_marks/NULLIF($3::numeric,0))*100,1) AS percentage
     FROM exam_attempts ea JOIN students st ON st.id=ea.student_id JOIN users u ON u.id=st.user_id LEFT JOIN school_classes sc ON sc.id=st.class_id
     WHERE ea.exam_id=$1 AND st.school_id=$2 AND st.school_link_status='APPROVED' AND ea.status='SCORED'
     ORDER BY ea.total_marks DESC,ea.submitted_at`,
    [examId, schoolId, maxMarks],
  )).rows;
  return { exam, students: rows };
}

function audienceToRoles(audience: AnnouncementInput['audience']): string[] {
  if (audience === 'PARENTS') return ['PARENT'];
  if (audience === 'STUDENTS') return ['STUDENT'];
  if (audience === 'TEACHERS') return ['TEACHER'];
  return ['PARENT', 'STUDENT', 'TEACHER'];
}

export async function getAnnouncements(schoolId: UUID) {
  return (await query(
    `SELECT a.*,u.name AS created_by_name,
            CASE WHEN a.target_roles=ARRAY['PARENT']::text[] THEN 'PARENTS'
                 WHEN a.target_roles=ARRAY['STUDENT']::text[] THEN 'STUDENTS'
                 WHEN a.target_roles=ARRAY['TEACHER']::text[] THEN 'TEACHERS'
                 ELSE 'ALL' END AS audience,
            (SELECT COUNT(*)::INT FROM notifications n WHERE n.reference_id=a.id AND n.type='ANNOUNCEMENT') AS sent_count
     FROM announcements a JOIN users u ON u.id=a.created_by WHERE a.school_id=$1 ORDER BY a.published_at DESC LIMIT 50`, [schoolId],
  )).rows;
}

export async function publishAnnouncement(schoolId: UUID, createdBy: UUID, data: AnnouncementInput) {
  const roles = audienceToRoles(data.audience || 'ALL');
  const targetClasses = data.targetClass ? [data.targetClass] : [];
  const { rows: [announcement] } = await query<AnnouncementRow>(
    `INSERT INTO announcements(school_id,created_by,title,body,target_classes,target_roles,is_pinned,send_whatsapp,published_at,expires_at)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,NOW(),$9) RETURNING *`,
    [schoolId, createdBy, data.title, data.body, targetClasses, roles, Boolean(data.isPinned), data.sendWhatsapp !== false, data.expiresAt || null],
  );
  if (!announcement) throw new Error('Announcement insert returned no row');
  notifyAnnouncementRecipients(announcement).catch((error: unknown) => logger.error('Announcement notification error:', error));
  return announcement;
}

async function notifyAnnouncementRecipients(announcement: AnnouncementRow): Promise<void> {
  const school = await getSchoolMeta(announcement.school_id);
  const { rows: recipients } = await query<AnnouncementRecipientRow>(
    `SELECT DISTINCT recipient_id,mobile,role FROM (
       SELECT u.id AS recipient_id,u.mobile,u.role::text AS role
       FROM students st JOIN users u ON u.id=st.user_id
       LEFT JOIN school_classes sc ON sc.id=st.class_id
       WHERE st.school_id=$1 AND st.status='ACTIVE' AND st.school_link_status='APPROVED'
         AND 'STUDENT'=ANY($2::text[]) AND (cardinality($3::text[])=0 OR sc.class_name=ANY($3::text[]))
       UNION ALL
       SELECT pu.id,pu.mobile,pu.role::text
       FROM students st JOIN parent_student_links psl ON psl.student_id=st.id JOIN users pu ON pu.id=psl.parent_user_id
       LEFT JOIN school_classes sc ON sc.id=st.class_id
       WHERE st.school_id=$1 AND st.status='ACTIVE' AND st.school_link_status='APPROVED'
         AND 'PARENT'=ANY($2::text[]) AND (cardinality($3::text[])=0 OR sc.class_name=ANY($3::text[]))
       UNION ALL
       SELECT u.id,u.mobile,u.role::text FROM teachers t JOIN users u ON u.id=t.user_id
       WHERE t.school_id=$1 AND t.status='ACTIVE' AND 'TEACHER'=ANY($2::text[])
     ) x`,
    [announcement.school_id, announcement.target_roles, announcement.target_classes],
  );
  for (const recipient of recipients) {
    try {
      await notificationService.saveNotification({
        userId: recipient.recipient_id,
        schoolId: announcement.school_id,
        type: 'ANNOUNCEMENT',
        title: announcement.title,
        body: announcement.body,
        refId: announcement.id,
        refType: 'ANNOUNCEMENT',
      });
      if (announcement.send_whatsapp && recipient.role === 'PARENT' && recipient.mobile) {
        await notificationService.notifyAnnouncement(recipient.mobile, school.name, announcement.body.slice(0, 200));
      }
    } catch (error: unknown) {
      logger.error('Announcement delivery failed:', errorMessage(error));
    }
  }
}
