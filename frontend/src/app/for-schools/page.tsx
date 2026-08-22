import PublicModulePage, { type PublicModuleConfig } from '@/components/public/PublicModulePage';

const CONFIG: PublicModuleConfig = {
  eyebrow: 'For Schools & Teachers',
  title: 'Run academics and daily school operations from',
  accentTitle: 'one connected workspace',
  summary: 'VidyaSetu gives schools a structured operating layer for student records, classes, teachers, attendance, fees, timetables, exams, results, announcements, enrollments and parent connectivity.',
  audience: 'schools and teachers',
  loginRole: 'school',
  secondaryLogin: { role: 'teacher', label: 'Teacher login' },
  metrics: [
    { key: 'schools', label: 'Active schools' },
    { key: 'students', label: 'Active students' },
    { key: 'teachers', label: 'Teachers' },
    { key: 'parents', label: 'Parent accounts' },
  ],
  capabilities: [
    {
      icon: '🏫',
      title: 'School profile and structure',
      description: 'Maintain the institution profile and organise classes, sections, academic year and school context from a single workspace.',
      bullets: ['School profile and board details', 'Class and section management', 'Academic-year context'],
    },
    {
      icon: '🎓',
      title: 'Student administration',
      description: 'Schools can add students individually or in bulk, update records and manage school-link enrollment requests.',
      bullets: ['Student roster', 'Bulk student onboarding', 'Enrollment approval workflow'],
    },
    {
      icon: '👩‍🏫',
      title: 'Teacher management',
      description: 'Create teacher identities, maintain employment details and assign teachers to subjects and classes.',
      bullets: ['Teacher roster', 'Subject/class assignments', 'Class-teacher designation'],
    },
    {
      icon: '📅',
      title: 'Attendance operations',
      description: 'Teachers and schools can work from class rosters, mark daily attendance and review attendance summaries.',
      bullets: ['Class attendance roster', 'Present/absent/late/half-day states', 'Attendance summaries'],
    },
    {
      icon: '💰',
      title: 'Fees and collections',
      description: 'School Admins can configure fee structures, generate invoices, record payments and review collection status.',
      bullets: ['Fee structures', 'Invoice generation', 'Payment records and reminders'],
    },
    {
      icon: '🗓️',
      title: 'Timetable management',
      description: 'Create class timetables with periods, subjects, teachers, rooms and breaks in the school workspace.',
      bullets: ['Day and period planning', 'Teacher/subject allocation', 'Room and break scheduling'],
    },
    {
      icon: '📝',
      title: 'Exams and results',
      description: 'Schools can create school tests, add questions, move exams through lifecycle states and review results.',
      bullets: ['Exam creation', 'Question management', 'Result views and status controls'],
    },
    {
      icon: '📣',
      title: 'Announcements',
      description: 'Publish school announcements for all users or specific student, parent and teacher audiences.',
      bullets: ['Audience targeting', 'Class targeting', 'Pinned and expiry controls'],
    },
    {
      icon: '👥',
      title: 'School and class Groups',
      description: 'Schools can participate in moderated collaboration Groups with school/class scope and controlled membership.',
      bullets: ['School/class Group scope', 'Owner/moderator governance', 'Private posts and comments'],
    },
  ],
  steps: [
    { title: 'School account', description: 'A School Admin signs in to the institution workspace and maintains school profile and academic structure.' },
    { title: 'Build the roster', description: 'Create classes, students and teachers, then connect teacher assignments and student enrollment context.' },
    { title: 'Operate daily', description: 'Use attendance, timetable, fees, announcements and school exams as part of the normal school workflow.' },
    { title: 'Connect families', description: 'Parent-linked records, notifications and messaging make attendance, results and fees visible to families.' },
  ],
  proofTitle: 'Operational coverage already present in the School module',
  proofIntro: 'The current School API includes read and write workflows for core academic and administrative operations.',
  proofs: [
    { icon: '👨‍🎓', title: 'Students & enrollment', description: 'Roster management, student detail, parent links and school enrollment-request review.' },
    { icon: '🏷️', title: 'Classes & teachers', description: 'Class structure, teachers, assignments, subjects and teacher status.' },
    { icon: '📊', title: 'Attendance & results', description: 'Attendance roster/marking, exam lifecycle, result views and report data.' },
    { icon: '🧾', title: 'Fees & communication', description: 'Fee structures, invoices, payments, reminders, announcements and parent-facing visibility.' },
  ],
  loginTitle: 'Login to School Dashboard',
  loginText: 'Operational data such as student rosters, fee records, attendance and results is private. School and Teacher accounts must sign in to access it.',
  schoolDirectory: true,
};

export default function SchoolsPublicPage() {
  return <PublicModulePage config={CONFIG} />;
}
