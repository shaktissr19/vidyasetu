import PublicModulePage, { type PublicModuleConfig } from '@/components/public/PublicModulePage';

const CONFIG: PublicModuleConfig = {
  eyebrow: 'For Platform Administrators',
  title: 'Govern the VidyaSetu network with',
  accentTitle: 'visibility and operational control',
  summary: 'The Platform Admin experience is for VidyaSetu operations—not School Admins. It covers platform analytics, schools, users, content, revenue, support, competitions, configuration, Group governance and escalated Parent grievance oversight.',
  audience: 'Platform Administrators',
  loginRole: 'admin',
  metrics: [
    { key: 'schools', label: 'Active schools' },
    { key: 'students', label: 'Active students' },
    { key: 'groups', label: 'Active Groups' },
    { key: 'competitions', label: 'Published competitions' },
  ],
  capabilities: [
    {
      icon: '📊', title: 'Platform analytics',
      description: 'Review top-level adoption and operational indicators across the VidyaSetu platform.',
      bullets: ['Student and school metrics', 'State-level visibility', 'Recent platform activity context'],
    },
    {
      icon: '🏫', title: 'School governance',
      description: 'Platform Admin can list schools, inspect institution records and control school account status.',
      bullets: ['School directory', 'School detail', 'Activate / suspend / pending states'],
    },
    {
      icon: '👤', title: 'User administration',
      description: 'Search and review platform users, export user data and manage account status where authorised.',
      bullets: ['User listing', 'Status management', 'User export'],
    },
    {
      icon: '📚', title: 'Content oversight',
      description: 'The Admin module includes content analytics and management entry points for the learning catalogue.',
      bullets: ['Content analytics', 'Learning catalogue visibility', 'Platform content operations'],
    },
    {
      icon: '🏆', title: 'Competition administration',
      description: 'Platform Admin can review and create platform-level competitions in addition to the public competition catalogue.',
      bullets: ['Competition listing', 'Competition creation', 'Published lifecycle visibility'],
    },
    {
      icon: '👥', title: 'Group governance',
      description: 'Approve new Groups, change Group status, review members, transfer ownership and resolve reports.',
      bullets: ['Creation decisions', 'Suspend/archive controls', 'Reports and ownership recovery'],
    },
    {
      icon: '🛡️', title: 'Escalated Parent grievance oversight',
      description: 'Platform Admin can review grievances across schools, prioritise escalated or overdue cases, inspect the complete audit timeline and intervene when school-level resolution needs platform oversight.',
      bullets: ['Escalated and overdue queue', 'Cross-school audit context', 'Visible replies, internal notes and status intervention'],
    },
    {
      icon: '🎫', title: 'Support operations',
      description: 'The Admin workspace includes support-ticket review and update flows for platform issues.',
      bullets: ['Support queue', 'Ticket detail', 'Resolution updates'],
    },
    {
      icon: '💹', title: 'Revenue visibility',
      description: 'Revenue views provide plan and commercial context for platform operations.',
      bullets: ['Revenue summary', 'Plan breakdown', 'Trend visibility'],
    },
    {
      icon: '⚙️', title: 'Platform configuration',
      description: 'Operational configuration values can be read and updated from the protected Admin workspace.',
      bullets: ['Configuration listing', 'Key-level updates', 'Feature/control settings'],
    },
  ],
  steps: [
    { title: 'Authenticate as Platform Admin', description: 'Only the SUPER_ADMIN role can access the Platform Admin APIs and dashboard.' },
    { title: 'Observe the network', description: 'Start from analytics, schools, users, content, revenue, support and governance queues.' },
    { title: 'Take governed actions', description: 'Change account states, manage configuration, create competitions, review Group lifecycle decisions and intervene in escalated Parent grievances.' },
    { title: 'Audit platform health', description: 'Use operational views to monitor adoption, unresolved issues, overdue school responses, governance queues and platform configuration.' },
  ],
  proofTitle: 'Protected platform operations already implemented',
  proofIntro: 'These areas map directly to SUPER_ADMIN routes and are intentionally separated from School Admin functionality.',
  proofs: [
    { icon: '📈', title: 'Analytics & revenue', description: 'Platform analytics, revenue summary and content analytics are protected admin endpoints.' },
    { icon: '🏢', title: 'Schools & users', description: 'School and user listing, detail, export and status controls are available.' },
    { icon: '🛡️', title: 'Grievance oversight', description: 'Escalated/overdue Parent concerns, audit history, internal notes and platform status intervention are centrally governed.' },
    { icon: '👥', title: 'Competitions & Groups', description: 'Platform-level competition creation and full Group governance are part of Admin.' },
  ],
  loginTitle: 'Login to Platform Admin',
  loginText: 'Platform analytics, user controls, support tickets, grievances and governance actions are restricted to authorised Platform Administrators.',
};

export default function PlatformAdminPublicPage() {
  return <PublicModulePage config={CONFIG} />;
}
