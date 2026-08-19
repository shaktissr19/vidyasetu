export type UUID = string;
export type ISODateString = string;
export type ISODateTimeString = string;
export type AcademicYear = string;

export type UserRole =
  | 'STUDENT'
  | 'SCHOOL_ADMIN'
  | 'TEACHER'
  | 'PARENT'
  | 'SUPER_ADMIN';

export type UserStatus = 'ACTIVE' | 'SUSPENDED' | 'PENDING';
export type LanguageCode = 'hi' | 'en' | 'ta' | 'te' | 'mr' | 'bn' | 'gu' | 'kn' | 'or';
export type Gender = 'MALE' | 'FEMALE' | 'OTHER';

export interface User {
  id: UUID;
  mobile: string;
  name: string | null;
  role: UserRole;
  status: UserStatus;
  language: LanguageCode;
  profilePhoto: string | null;
  lastLoginAt: ISODateTimeString | null;
  createdAt: ISODateTimeString;
  updatedAt?: ISODateTimeString;
}

export type StudentStatus = 'ACTIVE' | 'INACTIVE' | 'TRANSFERRED' | 'GRADUATED';

export interface Student {
  id: UUID;
  userId: UUID;
  schoolId: UUID;
  classId: UUID;
  rollNumber: string | null;
  academicYear: AcademicYear;
  dateOfBirth: ISODateString | null;
  gender: Gender | null;
  status: StudentStatus;
  admissionDate: ISODateString;
  xpTotal: number;
  xpLevel: number;
  streakCurrent: number;
  streakBest: number;
  lastActivity: ISODateString | null;
  primaryParentMobile: string | null;
  createdAt: ISODateTimeString;
  updatedAt: ISODateTimeString;
}

export type SchoolStatus = 'PENDING' | 'ACTIVE' | 'SUSPENDED';
export type SchoolPlan = 'FREE' | 'BASIC' | 'PRO' | 'ENTERPRISE';

export interface School {
  id: UUID;
  name: string;
  nameHi: string | null;
  udiseCode: string | null;
  adminUserId: UUID;
  status: SchoolStatus;
  plan: SchoolPlan;
  address: string | null;
  city: string | null;
  district: string | null;
  state: string;
  pincode: string | null;
  mobile: string | null;
  email: string | null;
  website: string | null;
  totalStudents: number;
  totalTeachers: number;
  academicYear: AcademicYear;
  logoUrl: string | null;
  board?: string | null;
  affiliationNumber?: string | null;
  principalName?: string | null;
  onboardingCompletedAt?: ISODateTimeString | null;
  createdAt: ISODateTimeString;
  updatedAt: ISODateTimeString;
}

export interface SchoolClass {
  id: UUID;
  schoolId: UUID;
  className: string;
  section: string;
  academicYear: AcademicYear;
  roomNumber: string | null;
  isActive: boolean;
  createdAt: ISODateTimeString;
}

export type TeacherStatus = 'ACTIVE' | 'INACTIVE' | 'ON_LEAVE';

export interface Teacher {
  id: UUID;
  userId: UUID;
  schoolId: UUID;
  employeeId: string | null;
  qualification: string | null;
  experienceYears: number;
  status: TeacherStatus;
  joinedDate: ISODateString;
  designation?: string | null;
  employmentType?: string;
  emailOfficial?: string | null;
  createdAt: ISODateTimeString;
  updatedAt: ISODateTimeString;
}

export type ParentRelation = 'FATHER' | 'MOTHER' | 'GUARDIAN' | 'PARENT';

export interface ParentStudentLink {
  id: UUID;
  parentUserId: UUID;
  studentId: UUID;
  relation: ParentRelation;
  isPrimary: boolean;
  createdAt: ISODateTimeString;
}

export interface Parent {
  user: User;
  studentLinks: ParentStudentLink[];
}

export type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'HOLIDAY' | 'HALF_DAY';

export interface Attendance {
  id: UUID;
  studentId: UUID;
  classId: UUID;
  schoolId: UUID;
  date: ISODateString;
  status: AttendanceStatus;
  remark: string | null;
  markedBy: UUID | null;
  createdAt: ISODateTimeString;
}

export interface AttendanceMonthlySummary {
  id: UUID;
  studentId: UUID;
  schoolId: UUID;
  year: number;
  month: number;
  workingDays: number;
  presentDays: number;
  absentDays: number;
  lateDays: number;
  halfDays: number;
  percentage: number;
}

export type FeeStatus = 'PENDING' | 'PARTIAL' | 'PAID' | 'OVERDUE' | 'WAIVED';
export type PaymentMode = 'CASH' | 'UPI' | 'BANK_TRANSFER' | 'RAZORPAY' | 'CHEQUE' | 'DD';

export interface Fee {
  id: UUID;
  schoolId: UUID;
  studentId: UUID;
  academicYear: AcademicYear;
  term: number;
  invoiceNumber: string | null;
  amountDue: number;
  amountPaid: number;
  amountWaived: number;
  status: FeeStatus;
  dueDate: ISODateString | null;
  notes: string | null;
  createdAt: ISODateTimeString;
  updatedAt: ISODateTimeString;
}

export interface FeePayment {
  id: UUID;
  invoiceId: UUID;
  schoolId: UUID;
  studentId: UUID;
  amount: number;
  mode: PaymentMode;
  transactionRef: string | null;
  receiptNumber?: string | null;
  collectedBy: UUID | null;
  paidAt: ISODateTimeString;
  notes: string | null;
  createdAt: ISODateTimeString;
}

export type DayOfWeek = 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT';

export interface TimetablePeriod {
  id: UUID;
  schoolId: UUID;
  classId: UUID;
  teacherId: UUID | null;
  subjectCode: string | null;
  day: DayOfWeek;
  periodNumber: number;
  startTime: string;
  endTime: string;
  roomNumber: string | null;
  academicYear: AcademicYear;
  isBreak: boolean;
  breakLabel: string | null;
  createdAt: ISODateTimeString;
  updatedAt: ISODateTimeString;
}

export interface Timetable {
  classId: UUID;
  academicYear: AcademicYear;
  periods: TimetablePeriod[];
}

export type ExamType = 'SCHOOL_TEST' | 'OLYMPIAD' | 'MOCK' | 'PRACTICE';
export type ExamStatus =
  | 'DRAFT'
  | 'REGISTRATION_OPEN'
  | 'REGISTRATION_CLOSED'
  | 'LIVE'
  | 'SCORING'
  | 'COMPLETED'
  | 'CANCELLED';

export type ExamAttemptStatus = 'IN_PROGRESS' | 'SUBMITTED' | 'SCORED' | 'DISQUALIFIED';

export interface Exam {
  id: UUID;
  schoolId: UUID | null;
  createdBy: UUID;
  title: string;
  titleHi: string | null;
  description: string | null;
  type: ExamType;
  status: ExamStatus;
  classNames: string[];
  subjectCodes: string[];
  totalQuestions: number;
  durationMinutes: number;
  marksPerQuestion: number;
  negativeMarks: number;
  registrationStart: ISODateTimeString | null;
  registrationEnd: ISODateTimeString | null;
  startTime: ISODateTimeString;
  endTime: ISODateTimeString;
  resultsAt: ISODateTimeString | null;
  instructions: string | null;
  instructionsHi: string | null;
  createdAt: ISODateTimeString;
  updatedAt: ISODateTimeString;
}

export interface Result {
  attemptId: UUID;
  examId: UUID;
  studentId: UUID;
  status: ExamAttemptStatus;
  totalMarks: number | null;
  correctCount: number | null;
  wrongCount: number | null;
  skippedCount: number | null;
  percentile: number | null;
  rankSchool: number | null;
  rankOverall: number | null;
  submittedAt: ISODateTimeString | null;
}

export interface Announcement {
  id: UUID;
  schoolId: UUID;
  title: string;
  body: string;
  targetRoles: UserRole[];
  createdBy?: UUID;
  createdAt: ISODateTimeString;
}

export interface ApiErrorDetail {
  code?: string;
  details?: unknown;
}

export interface ApiSuccess<T> {
  success: true;
  data: T;
  message?: string;
}

export interface ApiFailure {
  success: false;
  message: string;
  error?: ApiErrorDetail;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export interface PaginationRequest {
  page?: number;
  limit?: number;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface Paginated<T> {
  items: T[];
  pagination: PaginationMeta;
}

export interface AuthTokenClaims {
  userId: UUID;
  role: UserRole;
  schoolId?: UUID;
  teacherId?: UUID;
  iat?: number;
  exp?: number;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface AuthSession extends TokenPair {
  user: User;
}

export interface RefreshTokenRequest {
  refreshToken: string;
}

export interface RefreshTokenResponse {
  accessToken: string;
  refreshToken?: string;
}
