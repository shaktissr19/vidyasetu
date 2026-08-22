import PublicModulePage, { type PublicModuleConfig } from '@/components/public/PublicModulePage';

const CONFIG: PublicModuleConfig = {
  eyebrow: 'For Indian Schools & Teachers',
  title: 'Bring academics, administration and family communication into',
  accentTitle: 'one connected school workspace',
  summary: 'VidyaSetu gives schools a practical operating layer for students, classes, teachers, attendance, fees, timetables, exams, results, announcements, enrollment, Parent concerns and Education Community—while keeping each role inside its permitted workspace.',
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
      icon: '🏫', title: 'School identity and academic structure',
      description: 'Maintain institution information, board context, academic year, classes and sections from one School workspace.',
      bullets: ['School profile and board information', 'Class and section management', 'UDISE-linked indicator where configured'],
    },
    {
      icon: '🎓', title: 'Student administration',
      description: 'Build and maintain the student roster, including school-link requests and bulk onboarding workflows.',
      bullets: ['Student roster', 'Bulk onboarding', 'Enrollment approval workflow'],
    },
    {
      icon: '👩‍🏫', title: 'Teacher management',
      description: 'Create teacher identities, maintain staff details and connect teachers to classes and subjects.',
      bullets: ['Teacher roster', 'Subject/class assignments', 'Class-teacher designation'],
    },
    {
      icon: '📅', title: 'Daily attendance',
      description: 'Use class rosters to mark attendance and surface those records to authorised students and parents.',
      bullets: ['Present / absent / late / half-day states', 'Class attendance roster', 'Attendance summaries'],
    },
    {
      icon: '💰', title: 'Fees and collection visibility',
      description: 'Configure fee structures, generate invoices and record payments while giving linked Parents clearer fee visibility.',
      bullets: ['Fee structures', 'Invoice generation', 'Payment records and reminders'],
    },
    {
      icon: '🗓️', title: 'Timetable management',
      description: 'Plan periods, subjects, teachers, rooms and breaks for each class in the same operational workspace.',
      bullets: ['Day and period planning', 'Teacher/subject allocation', 'Room and break scheduling'],
    },
    {
      icon: '📝', title: 'School exams and results',
      description: 'Create school assessments, manage questions and results, and publish the academic information students and parents need.',
      bullets: ['Exam creation', 'Question management', 'Result views and lifecycle controls'],
    },
    {
      icon: '📣', title: 'Announcements for the right audience',
      description: 'Publish school notices for students, parents or teachers with class targeting, pinning and expiry controls.',
      bullets: ['Audience targeting', 'Class targeting', 'Pinned and expiry controls'],
    },
    {
      icon: '🛡️', title: 'Parent Concern & Grievance Centre',
      description: 'Receive formal child-linked concerns in a dedicated queue, acknowledge them, communicate with the Parent and document resolution with an audit trail.',
      bullets: ['Tracked ticket and SLA', 'Parent-visible replies plus internal notes', 'Resolution, reopen and escalation workflow'],
    },
    {
      icon: '🌐', title: 'School, Teacher and Class Communities',
      description: 'Create moderated Education Communities for teachers, classes, parents or mixed learning collaboration using verified VidyaSetu identities.',
      bullets: ['School/class scope', 'Teacher and mixed learning communities', 'Owner/moderator governance and reporting'],
    },
  ],
  steps: [
    { title: 'Set up the School workspace', description: 'A School Admin signs in and maintains school profile, academic year, classes and sections.' },
    { title: 'Connect people', description: 'Onboard students and teachers, process student-school links and connect role-specific records.' },
    { title: 'Run daily operations', description: 'Use attendance, fees, timetable, announcements, school exams and results from one place.' },
    { title: 'Keep families connected', description: 'Parent visibility, teacher messaging, formal grievances and Education Community provide different channels for different needs.' },
  ],
  proofTitle: 'Built around the workflows schools already perform every day',
  proofIntro: 'VidyaSetu’s School module covers core academic operations while separating School Admin, Teacher, Student and Parent permissions.',
  proofs: [
    { icon: '👨‍🎓', title: 'Students & enrollment', description: 'Roster management, student detail, Parent links and school enrollment-request review.' },
    { icon: '🏷️', title: 'Classes & teachers', description: 'Class structure, teachers, assignments, subjects and teacher status.' },
    { icon: '🛡️', title: 'Parent concerns', description: 'School-scoped grievance queue, acknowledgement, replies, internal notes and resolution.' },
    { icon: '🌐', title: 'Communication & Community', description: 'Announcements, Parent visibility and moderated Education Communities for school-linked collaboration.' },
  ],
  loginTitle: 'Login to School Dashboard',
  loginText: 'Student rosters, fee records, attendance, results and Parent concern tickets are private. School and Teacher accounts must sign in to access only their permitted workspace.',
  schoolDirectory: true,
};

export default function SchoolsPublicPage() {
  return <PublicModulePage config={CONFIG} />;
}
