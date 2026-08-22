import PublicModulePage, { type PublicModuleConfig } from '@/components/public/PublicModulePage';

const CONFIG: PublicModuleConfig = {
  eyebrow: 'For Schools & Teachers',
  title: 'Run academics, administration and family engagement from',
  accentTitle: 'one connected school workspace',
  summary: 'VidyaSetu gives Indian schools a structured operating layer for students, classes, teachers, attendance, fees, timetables, exams, results, announcements, enrollment, parent visibility, grievances and moderated Education Communities.',
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
      icon: '🏫', title: 'School profile and academic structure',
      description: 'Maintain institution information and organise classes, sections and academic-year context from one workspace.',
      bullets: ['School profile and board details', 'Class and section management', 'Academic-year context'],
    },
    {
      icon: '🎓', title: 'Student administration',
      description: 'Schools can add students individually or in bulk, update records and manage school-link enrollment requests.',
      bullets: ['Student roster', 'Bulk student onboarding', 'Enrollment approval workflow'],
    },
    {
      icon: '👩‍🏫', title: 'Teacher management',
      description: 'Create teacher identities, maintain employment details and assign teachers to subjects and classes.',
      bullets: ['Teacher roster', 'Subject/class assignments', 'Class-teacher designation'],
    },
    {
      icon: '📅', title: 'Attendance operations',
      description: 'Teachers and schools can work from class rosters, mark daily attendance and review summaries.',
      bullets: ['Class attendance roster', 'Present/absent/late/half-day states', 'Attendance summaries'],
    },
    {
      icon: '💰', title: 'Fees and collections',
      description: 'School Admins can configure fee structures, generate invoices, record payments and review collection status.',
      bullets: ['Fee structures', 'Invoice generation', 'Payment records and reminders'],
    },
    {
      icon: '🗓️', title: 'Timetable management',
      description: 'Create class timetables with periods, subjects, teachers, rooms and breaks.',
      bullets: ['Day and period planning', 'Teacher/subject allocation', 'Room and break scheduling'],
    },
    {
      icon: '📝', title: 'Exams and results',
      description: 'Schools can create tests, add questions, move exams through lifecycle states and review results.',
      bullets: ['Exam creation', 'Question management', 'Result views and status controls'],
    },
    {
      icon: '📣', title: 'Announcements and school communication',
      description: 'Publish school announcements for all users or specific student, parent and teacher audiences.',
      bullets: ['Audience targeting', 'Class targeting', 'Pinned and expiry controls'],
    },
    {
      icon: '🛡️', title: 'Parent Concern & Grievance Centre',
      description: 'School Admins receive formal child-linked concerns, acknowledge them, communicate with parents and document the resolution with a complete timeline.',
      bullets: ['Tracked ticket and response SLA', 'Parent-visible replies plus private internal notes', 'Resolution and audit timeline'],
    },
    {
      icon: '🤝', title: 'School Education Communities',
      description: 'Schools and teachers can participate in moderated Communities for class, school, teacher, parent or approved mixed collaboration.',
      bullets: ['School/class Community scope', 'Teacher, Parent and mixed participation', 'Owner/moderator governance and reporting'],
    },
  ],
  steps: [
    { title: 'Set up the school workspace', description: 'A School Admin signs in, maintains institution information and organises academic structure.' },
    { title: 'Build the roster', description: 'Create classes, students and teachers, then connect teacher assignments and student enrollment context.' },
    { title: 'Operate every day', description: 'Use attendance, timetable, fees, announcements, exams and results as part of normal school operations.' },
    { title: 'Connect families', description: 'Use parent-linked records, messages and Communities for collaboration, and the Grievance Centre for formally tracked concerns.' },
  ],
  proofTitle: 'Operational coverage already present in the School module',
  proofIntro: 'The School API includes read/write workflows for core academic operations, parent connectivity, Education Communities and a formal grievance queue.',
  proofs: [
    { icon: '👨‍🎓', title: 'Students & enrollment', description: 'Roster management, student detail, parent links and school enrollment-request review.' },
    { icon: '🏷️', title: 'Classes & teachers', description: 'Class structure, teachers, assignments, subjects and teacher status.' },
    { icon: '🛡️', title: 'Parent concerns', description: 'School-scoped grievance queue, acknowledgement, replies, internal notes, review state and recorded resolution.' },
    { icon: '🤝', title: 'Family & Community engagement', description: 'Announcements, fee visibility, parent communication and moderated school/class Communities.' },
  ],
  loginTitle: 'Login to School Dashboard',
  loginText: 'Student rosters, fee records, attendance, results, Parent concern tickets and Community membership are private. School and Teacher accounts must sign in to access their permitted workspace.',
  schoolDirectory: true,
};

export default function SchoolsPublicPage() {
  return <PublicModulePage config={CONFIG} />;
}
