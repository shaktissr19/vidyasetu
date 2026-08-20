import type { PaginationMeta, UserRole } from '@vidyasetu/contracts';

export interface ApiEnvelope<T> {
  success?: boolean;
  data: T;
  message?: string;
  meta?: PaginationMeta;
}

export interface ApiListResponse<T> {
  success?: boolean;
  data: T[];
  meta: PaginationMeta;
  message?: string;
}

export interface AdminSchool {
  id: string;
  name: string;
  district?: string | null;
  state?: string | null;
  student_count?: string | number | null;
  created_at?: string | null;
  plan?: string | null;
  status: string;
}

export interface AdminUser {
  id: string;
  name?: string | null;
  mobile?: string | null;
  role: UserRole | string;
  status: string;
  last_login_at?: string | null;
}

export interface PlatformConfigItem {
  key: string;
  value: string | number;
  description?: string | null;
}

export interface SupportTicket {
  id: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | string;
  category?: string | null;
  subject: string;
  school_name?: string | null;
  created_at: string;
  status: string;
  description?: string | null;
  raised_by_name?: string | null;
  resolution?: string | null;
}

export interface AnalyticsStateRow {
  state: string;
  student_count: string | number;
}

export interface AdminAnalytics {
  students?: { total?: string | number; new_this_month?: string | number };
  schools?: { active?: string | number; new_this_month?: string | number; paid?: string | number };
  mrr?: string | number;
  dau?: string | number;
  topStates?: AnalyticsStateRow[];
  pendingSchools?: AdminSchool[];
}

export interface RevenuePlanBreakdown {
  plan: string;
  school_count?: string | number | null;
  monthly_revenue?: string | number | null;
}

export interface RevenueTrendRow {
  month: string;
  revenue?: string | number | null;
}

export interface AdminRevenue {
  mrr?: number;
  arr?: number;
  planBreakdown?: RevenuePlanBreakdown[];
  monthlyTrend?: RevenueTrendRow[];
}

export interface CompetitionExam {
  id: string;
  title: string;
  status: string;
  start_time?: string | null;
  end_time?: string | null;
  duration_mins?: number | null;
  total_questions?: number | null;
  total_marks?: number | null;
  prize_pool?: string | number | null;
  class_names?: string[] | null;
  registered?: boolean;
  attempt_id?: string | null;
  registration_count?: string | number | null;
}

export interface CompetitionLeaderboardRow {
  id?: string;
  rank?: number;
  student_name?: string | null;
  school_name?: string | null;
  score?: string | number | null;
  max_marks?: string | number | null;
}

export interface ParentChild {
  id: string;
  name?: string | null;
  student_code?: string | null;
  grade_level?: string | number | null;
  class_name?: string | null;
  school_name?: string | null;
}

export interface ParentFee {
  id: string;
  invoice_number?: string | null;
  fee_name?: string | null;
  total_amount?: string | number | null;
  paid_amount?: string | number | null;
  outstanding?: string | number | null;
  due_date?: string | null;
  status?: string | null;
}

export interface ParentSubjectResult {
  subject_name?: string | null;
  subject_code?: string | null;
  marks_obtained?: string | number | null;
  max_marks?: string | number | null;
  percentage?: string | number | null;
  grade?: string | null;
}

export interface ParentExamResult {
  id?: string;
  title?: string | null;
  exam_name?: string | null;
  percentage?: string | number | null;
  results?: ParentSubjectResult[];
}

export interface ParentDashboard {
  attendance?: { percentage?: number; present?: number; absent?: number; late?: number };
  fees?: ParentFee[];
  upcoming_exams?: CompetitionExam[];
  recent_results?: ParentExamResult[];
  announcements?: SchoolAnnouncement[];
}

export interface ParentMessage {
  id: string;
  body: string;
  sender_name?: string | null;
  sender_role?: string | null;
  created_at?: string | null;
  is_mine?: boolean;
}

export interface ParentNotification {
  id: string;
  type: string;
  title?: string | null;
  message?: string | null;
  body?: string | null;
  is_read?: boolean;
  created_at?: string | null;
}

export interface AttendanceRecord {
  id?: string;
  student_id?: string;
  student_name?: string;
  student_code?: string;
  roll_number?: string | number | null;
  date?: string | null;
  status: string;
  remarks?: string | null;
}

export interface AttendanceSummary {
  percentage?: number;
  present?: number;
  absent?: number;
  late?: number;
  half_day?: number;
  total?: number;
  records?: AttendanceRecord[];
}

export interface SchoolClass {
  id: string;
  name?: string | null;
  class_name?: string | null;
  grade_level?: string | number | null;
  section?: string | null;
  academic_year?: string | null;
  student_count?: string | number | null;
  status?: string | null;
  is_active?: boolean;
}

export interface SchoolSubject {
  id?: string;
  code: string;
  name: string;
}

export interface TeacherAssignment {
  classId?: string;
  class_id?: string;
  subjectCode?: string;
  subject_code?: string;
  isClassTeacher?: boolean;
  is_class_teacher?: boolean;
  class_name?: string | null;
  subject_name?: string | null;
}

export interface SchoolTeacher {
  id: string;
  name?: string | null;
  mobile?: string | null;
  email?: string | null;
  employee_id?: string | null;
  employeeId?: string | null;
  designation?: string | null;
  qualification?: string | null;
  experience_years?: number | null;
  employment_type?: string | null;
  status?: string | null;
  username?: string | null;
  password?: string | null;
  assignments?: TeacherAssignment[];
}

export interface SchoolStudent {
  id: string;
  name?: string | null;
  username?: string | null;
  mobile?: string | null;
  student_code?: string | null;
  grade_level?: string | number | null;
  class_id?: string | null;
  classId?: string | null;
  class_name?: string | null;
  roll_number?: string | number | null;
  rollNumber?: string | number | null;
  status?: string | null;
  parent_name?: string | null;
  parent_mobile?: string | null;
}

export interface EnrollmentRequest {
  id: string;
  student_id?: string | null;
  student_name?: string | null;
  student_code?: string | null;
  class_id?: string | null;
  class_name?: string | null;
  status?: string | null;
  requested_at?: string | null;
}

export interface SchoolProfile {
  id?: string;
  name?: string | null;
  udise_code?: string | null;
  board?: string | null;
  state?: string | null;
  district?: string | null;
  city?: string | null;
  address?: string | null;
  pincode?: string | null;
  principal_name?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
}

export interface SchoolOverview {
  school?: SchoolProfile;
  stats?: Record<string, string | number | null | undefined>;
  classes?: SchoolClass[];
  announcements?: SchoolAnnouncement[];
  recent_announcements?: SchoolAnnouncement[];
  attendance?: AttendanceSummary;
}

export interface FeeStructureRow {
  id?: string;
  class_id?: string | null;
  class_name?: string | null;
  fee_name?: string | null;
  amount?: string | number | null;
  due_day?: number | null;
}

export interface FeeInvoiceRow {
  id: string;
  student_id?: string | null;
  student_name?: string | null;
  class_label?: string | null;
  class_name?: string | null;
  invoice_number?: string | null;
  total_amount?: string | number | null;
  paid_amount?: string | number | null;
  outstanding?: string | number | null;
  status?: string | null;
  due_date?: string | null;
}

export interface FeeOverview {
  total_due?: string | number | null;
  total_collected?: string | number | null;
  total_outstanding?: string | number | null;
  collection_rate?: string | number | null;
  invoices?: FeeInvoiceRow[];
  structures?: FeeStructureRow[];
}

export interface FeePaymentReceipt {
  receiptNumber?: string | null;
  studentName?: string | null;
  classLabel?: string | null;
  invoiceNumber?: string | null;
  payment?: {
    amount?: string | number | null;
    mode?: string | null;
    reference?: string | null;
    paidAt?: string | null;
  };
}

export interface TimetablePeriod {
  id?: string;
  day: string;
  periodNumber: number;
  startTime: string;
  endTime: string;
  subjectCode: string;
  teacherId: string;
  roomNumber?: string;
  isBreak: boolean;
  breakLabel?: string;
  subject_name?: string | null;
  teacher_name?: string | null;
}

export interface SchoolExamQuestion {
  questionText: string;
  subjectCode?: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctOption: string;
  explanation: string;
  difficulty: string;
}

export interface SchoolExam {
  id: string;
  title: string;
  status: string;
  class_names?: string[];
  subject_codes?: string[];
  start_time?: string | null;
  end_time?: string | null;
  duration_mins?: number | null;
  total_questions?: number | null;
  total_marks?: number | null;
}

export interface SchoolResultRow {
  id?: string;
  student_id?: string;
  student_name?: string | null;
  subject_code?: string | null;
  subject_name?: string | null;
  marks_obtained?: string | number | null;
  max_marks?: string | number | null;
  percentage?: string | number | null;
  grade?: string | null;
}

export interface SchoolAnnouncement {
  id: string;
  title?: string | null;
  body?: string | null;
  audience?: string | null;
  priority?: string | null;
  class_ids?: string[] | null;
  published_at?: string | null;
  created_at?: string | null;
}

export interface ContentSubject {
  id: string;
  code: string;
  name: string;
  name_hi?: string | null;
  chapter_count?: string | number | null;
  progress?: number | null;
}

export interface ContentChapter {
  id: string;
  chapter_number?: string | number | null;
  title: string;
  title_hi?: string | null;
  item_count?: string | number | null;
  progress?: number | null;
}

export interface ContentItem {
  id: string;
  content_item_id?: string;
  type: string;
  title: string;
  title_hi?: string | null;
  file_url?: string | null;
  duration_seconds?: number | null;
  is_completed?: boolean;
}

export interface QuizQuestion {
  id: string;
  question?: string | null;
  question_text?: string | null;
  options?: string[];
  option_a?: string | null;
  option_b?: string | null;
  option_c?: string | null;
  option_d?: string | null;
}

export interface QuizData {
  id?: string;
  title?: string | null;
  questions: QuizQuestion[];
}

export interface QuizResult {
  passed?: boolean;
  score?: number;
  correctCount?: number;
  totalQuestions?: number;
}

export interface DoubtAnswer {
  id: string;
  body?: string | null;
  author_name?: string | null;
  is_ai?: boolean;
  upvotes?: number;
  is_best?: boolean;
}

export interface Doubt {
  id: string;
  title: string;
  body?: string | null;
  status: string;
  subject_id?: string | null;
  subject_name?: string | null;
  author_name?: string | null;
  created_at?: string | null;
  answers?: DoubtAnswer[];
}

export interface StudentProfile {
  id?: string;
  name?: string | null;
  username?: string | null;
  mobile?: string | null;
  student_code?: string | null;
  school_link_status?: string | null;
  grade_level?: string | number | null;
  school_id?: string | null;
  school_name?: string | null;
  class_id?: string | null;
  class_name?: string | null;
  roll_number?: string | number | null;
  preferred_language?: string | null;
}

export interface StudentDashboard {
  student?: StudentProfile;
  profile?: StudentProfile;
  attendance?: AttendanceSummary;
  subjects?: ContentSubject[];
  upcomingExams?: CompetitionExam[];
  upcoming_exams?: CompetitionExam[];
  recentResults?: ParentExamResult[];
  recent_results?: ParentExamResult[];
  recentContent?: ContentItem[];
  recent_content?: ContentItem[];
  badges?: StudentBadge[];
  xp?: number;
  streak?: number;
  school?: SchoolProfile;
  timetable?: TimetablePeriod[];
  announcements?: SchoolAnnouncement[];
}

export interface StudentBadge {
  id?: string;
  badge_code?: string;
  code?: string;
  name?: string | null;
  description?: string | null;
  earned_at?: string | null;
  xp_reward?: number | null;
}

export interface LeaderboardRow {
  id?: string;
  rank?: number;
  student_name?: string | null;
  name?: string | null;
  school_name?: string | null;
  xp?: number | null;
  score?: string | number | null;
  is_current_user?: boolean;
}

export interface ReportCardRow {
  subject_code?: string | null;
  subject_name?: string | null;
  marks_obtained?: string | number | null;
  max_marks?: string | number | null;
  percentage?: string | number | null;
  grade?: string | null;
}

export interface ReportCardData {
  term?: string | null;
  year?: string | number | null;
  results?: ReportCardRow[];
  total_marks?: string | number | null;
  total_max_marks?: string | number | null;
  percentage?: string | number | null;
}

export interface OfflineDownload {
  id?: string;
  content_item_id: string;
  title?: string | null;
  file_url?: string | null;
  downloaded_at?: string | null;
  subject_code?: string | null;
}

export interface ExamAttemptQuestion {
  id: string;
  question?: string | null;
  question_text?: string | null;
  options?: string[];
}

export interface ExamAttempt {
  attemptId?: string;
  id?: string;
  endsAt: string;
  exam: CompetitionExam;
  questions: ExamAttemptQuestion[];
}

export interface ExamAttemptResult {
  score?: string | number | null;
  maxMarks?: string | number | null;
  correctCount?: number | null;
  wrongCount?: number | null;
  skippedCount?: number | null;
  rankOverall?: number | null;
}
