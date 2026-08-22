import PublicModulePage, { type PublicModuleConfig } from '@/components/public/PublicModulePage';

const CONFIG: PublicModuleConfig = {
  eyebrow: 'For VidyaSetu Platform Administrators',
  title: 'Govern schools, users and platform operations with',
  accentTitle: 'network-level visibility and control',
  summary: 'Platform Admin is different from School Admin. It is the protected VidyaSetu operations layer for analytics, schools, users, content, revenue, support, Competitions, grievances, configuration and Education Community governance.',
  audience: 'Platform Administrators',
  loginRole: 'admin',
  metrics: [
    { key: 'schools', label: 'Active schools' },
    { key: 'students', label: 'Active students' },
    { key: 'groups', label: 'Active Communities' },
    { key: 'competitions', label: 'Published competitions' },
  ],
  capabilities: [
    {
      icon: '📊', title: 'Platform analytics',
      description: 'Review adoption and operational indicators across the VidyaSetu network from one governance workspace.',
      bullets: ['Student and school metrics', 'Geographic/state context where available', 'Recent platform activity'],
    },
    {
      icon: '🏫', title: 'School governance',
      description: 'List and inspect schools, understand institution status and control school account state where authorised.',
      bullets: ['School directory', 'School detail', 'Activate / suspend / pending states'],
    },
    {
      icon: '👤', title: 'User administration',
      description: 'Search and review platform identities across roles without mixing those controls into School Admin permissions.',
      bullets: ['User listing', 'Status management', 'User export'],
    },
    {
      icon: '📚', title: 'Learning-content oversight',
      description: 'Use Admin content views to understand and manage the learning catalogue and platform content operations.',
      bullets: ['Content analytics', 'Learning catalogue visibility', 'Platform content operations'],
    },
    {
      icon: '🏆', title: 'Competition administration',
      description: 'Review and create platform-level Competitions while public users see only published competition information.',
      bullets: ['Competition listing', 'Competition creation', 'Published lifecycle visibility'],
    },
    {
      icon: '🌐', title: 'Education Community governance',
      description: 'Approve new Communities, review membership/report issues, change lifecycle state and recover ownership when required.',
      bullets: ['Creation decisions', 'Suspend/archive controls', 'Reports and ownership recovery'],
    },
    {
      icon: '🛡️', title: 'Escalated Parent grievance oversight',
      description: 'Review grievances across schools, prioritise escalated or overdue cases, inspect the audit timeline and intervene when school-level resolution needs platform oversight.',
      bullets: ['Escalated and overdue queue', 'Cross-school audit context', 'Replies, internal notes and status intervention'],
    },
    {
      icon: '🎫', title: 'Support operations',
      description: 'Use the protected support queue for platform issues and operational follow-up.',
      bullets: ['Support queue', 'Ticket detail', 'Resolution updates'],
    },
    {
      icon: '💹', title: 'Revenue visibility',
      description: 'Review plan and revenue context for platform operations without exposing commercial controls publicly.',
      bullets: ['Revenue summary', 'Plan breakdown', 'Trend visibility'],
    },
    {
      icon: '⚙️', title: 'Platform configuration',
      description: 'Read and update governed platform configuration values from the protected Admin workspace.',
      bullets: ['Configuration listing', 'Key-level updates', 'Feature/control settings'],
    },
  ],
  steps: [
    { title: 'Authenticate as Platform Admin', description: 'Only the SUPER_ADMIN role can access Platform Admin APIs and dashboard actions.' },
    { title: 'Observe the network', description: 'Start from analytics, schools, users, content, revenue, support, grievance and Community queues.' },
    { title: 'Take governed actions', description: 'Manage account states, configuration, Competitions, grievance intervention and Education Community lifecycle decisions.' },
    { title: 'Monitor platform health', description: 'Use the protected operational views to find unresolved support issues, overdue school responses and governance queues.' },
  ],
  proofTitle: 'Platform governance separated from school administration',
  proofIntro: 'Platform Admin routes are restricted to SUPER_ADMIN and sit above—not inside—individual School Admin workspaces.',
  proofs: [
    { icon: '📈', title: 'Analytics & revenue', description: 'Platform analytics, revenue summary and content analytics are protected Admin areas.' },
    { icon: '🏢', title: 'Schools & users', description: 'School and user listing, detail, export and status controls are available.' },
    { icon: '🛡️', title: 'Grievance oversight', description: 'Escalated/overdue Parent concerns, audit history, notes and status intervention are centrally governed.' },
    { icon: '🌐', title: 'Competitions & Community', description: 'Platform-level Competition administration and Education Community governance are part of Admin.' },
  ],
  loginTitle: 'Login to Platform Admin',
  loginText: 'Platform analytics, user controls, support tickets, grievances and governance actions are restricted to authorised VidyaSetu Platform Administrators.',
};

export default function PlatformAdminPublicPage() {
  return <PublicModulePage config={CONFIG} />;
}
