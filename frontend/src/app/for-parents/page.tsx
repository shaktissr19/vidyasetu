import PublicModulePage, { type PublicModuleConfig } from '@/components/public/PublicModulePage';

const CONFIG: PublicModuleConfig = {
  eyebrow: 'For Parents & Guardians',
  title: 'Stay informed about your child with',
  accentTitle: 'clear school-connected visibility',
  summary: 'VidyaSetu gives Parents one protected place for linked children, attendance, academic performance, report cards, fees, school notifications, teacher communication, formal grievances and moderated Education Community.',
  audience: 'parents and guardians',
  loginRole: 'parent',
  metrics: [
    { key: 'parents', label: 'Active parent accounts' },
    { key: 'students', label: 'Active students' },
    { key: 'schools', label: 'Active schools' },
    { key: 'groups', label: 'Active Communities' },
  ],
  capabilities: [
    {
      icon: '👨‍👩‍👧', title: 'More than one child in one Parent account',
      description: 'A Parent can have multiple linked children and switch between each child’s authorised school information without sharing student credentials.',
      bullets: ['Multiple linked children', 'School and class context', 'Protected family access'],
    },
    {
      icon: '📊', title: 'Academic performance visibility',
      description: 'Review the child’s performance information from the Parent workspace instead of relying only on periodic paper updates.',
      bullets: ['Recent performance', 'Subject-level context', 'Child-specific progress views'],
    },
    {
      icon: '📅', title: 'Attendance at a glance',
      description: 'School-entered attendance is surfaced to the linked Parent with summary and detail views.',
      bullets: ['Attendance percentage', 'Present / absent / late states', 'Child-specific records'],
    },
    {
      icon: '📄', title: 'Report cards and results',
      description: 'Open published report-card information for a linked child from the Parent account.',
      bullets: ['Exam result visibility', 'Subject marks', 'Report-card access'],
    },
    {
      icon: '💳', title: 'Fees and dues',
      description: 'See school-generated fee information, including paid and outstanding amounts and due-date context where available.',
      bullets: ['Fee items and invoices', 'Paid / outstanding amounts', 'Due-date visibility'],
    },
    {
      icon: '💬', title: 'Teacher communication',
      description: 'Parents can identify the child’s teacher context and exchange child-specific messages through the protected Parent workspace.',
      bullets: ['Teacher lookup', 'Child-specific thread', 'School-family communication'],
    },
    {
      icon: '🛡️', title: 'Concern & Grievance Centre',
      description: 'Raise a formal child-linked concern when normal messaging is not enough, follow the school response and escalate unresolved matters when required.',
      bullets: ['Ticket number and audit timeline', 'School acknowledgement and resolution', 'Parent close / reopen / escalation controls'],
    },
    {
      icon: '📎', title: 'Evidence for formal concerns',
      description: 'Parents can attach supported evidence to a grievance through private signed storage rather than exposing files as public links.',
      bullets: ['Private evidence upload', 'School/Admin authorised viewing', 'File-size and type controls'],
    },
    {
      icon: '🔔', title: 'School and platform notifications',
      description: 'Keep school/platform updates together in the Parent account with read-state tracking.',
      bullets: ['Notification inbox', 'Read/unread state', 'School-linked updates'],
    },
    {
      icon: '🌐', title: 'Parent Education Community',
      description: 'Connect with other Parents in moderated communities while each child’s private records remain visible only to authorised family accounts.',
      bullets: ['Parent-only or school-linked communities', 'Controlled membership', 'Posts, resources and reporting'],
    },
  ],
  steps: [
    { title: 'Sign in as Parent', description: 'Use the Parent account type so VidyaSetu loads only children linked to that Parent identity.' },
    { title: 'Choose a child', description: 'Open the child whose attendance, results, fees, communication or school concern you want to review.' },
    { title: 'Follow everyday school information', description: 'Check performance, attendance, report cards, fees and notifications from one Parent view.' },
    { title: 'Use the right communication channel', description: 'Message teachers for routine communication, raise a formal grievance when accountability and an audit trail are required, and use Education Community for moderated peer discussion.' },
  ],
  proofTitle: 'Family visibility without exposing student privacy',
  proofIntro: 'Parent access is child-linked and authenticated. Public school information is separate from private attendance, marks, fees, messages and grievance records.',
  proofs: [
    { icon: '🧒', title: 'Linked-child dashboard', description: 'Child selection plus child-specific performance and school context.' },
    { icon: '📆', title: 'Attendance & report card', description: 'Dedicated child attendance and report-card data in the Parent module.' },
    { icon: '🛡️', title: 'Tracked concerns', description: 'School-linked tickets, evidence, replies, status history, resolution, reopen and escalation.' },
    { icon: '🌐', title: 'Communication & Community', description: 'Teacher messaging, notifications and moderated Parent Education Community.' },
  ],
  loginTitle: 'Login to Parent Dashboard',
  loginText: 'Children, results, attendance, fees, messages and grievance tickets are private family records. Sign in as Parent to view only the children linked to your account.',
};

export default function ParentsPublicPage() {
  return <PublicModulePage config={CONFIG} />;
}
