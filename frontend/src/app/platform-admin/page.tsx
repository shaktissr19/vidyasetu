import PublicModulePage, { type PublicModuleConfig } from '@/components/public/PublicModulePage';

const CONFIG: PublicModuleConfig = {
  eyebrow: 'For Platform Administrators',
  title: 'Govern the VidyaSetu education network with',
  accentTitle: 'visibility, safety and operational control',
  summary: 'Platform Admin is distinct from School Admin. It provides network-level oversight for schools, users, learning content, competitions, Education Communities, grievances, support, revenue and configuration across VidyaSetu.',
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
      description: 'Review top-level adoption and operational indicators across the VidyaSetu education network.',
      bullets: ['Student and school metrics', 'State-level visibility', 'Recent platform activity context'],
    },
    {
      icon: '🏫', title: 'School governance',
      description: 'List schools, inspect institution records and manage school account lifecycle where authorised.',
      bullets: ['School directory', 'School detail', 'Activate / suspend / pending states'],
    },
    {
      icon: '👤', title: 'User administration',
      description: 'Search and review platform users, export data and manage account status where authorised.',
      bullets: ['User listing', 'Status management', 'User export'],
    },
    {
      icon: '📚', title: 'Learning-content oversight',
      description: 'Monitor and manage the learning catalogue that powers student subject and chapter experiences.',
      bullets: ['Content analytics', 'Learning catalogue visibility', 'Platform content operations'],
    },
    {
      icon: '🏆', title: 'Competition administration',
      description: 'Review and create platform-level academic competitions in addition to the public catalogue.',
      bullets: ['Competition listing', 'Competition creation', 'Published lifecycle visibility'],
    },
    {
      icon: '🤝', title: 'Education Community governance',
      description: 'Approve new Communities, change lifecycle status, review membership, transfer ownership and resolve reports.',
      bullets: ['Creation decisions', 'Suspend/archive controls', 'Reports and ownership recovery'],
    },
    {
      icon: '🛡️', title: 'Parent grievance oversight',
      description: 'Review grievances across schools, prioritise escalated or overdue cases, inspect audit history and intervene when school-level resolution needs platform oversight.',
      bullets: ['Escalated and overdue queue', 'Cross-school audit context', 'Replies, internal notes and status intervention'],
    },
    {
      icon: '🎫', title: 'Support operations',
      description: 'Review and update platform support tickets for users and institutions.',
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
    { title: 'Authenticate as Platform Admin', description: 'Only the SUPER_ADMIN role can access Platform Admin APIs and dashboard functions.' },
    { title: 'Observe the network', description: 'Start from analytics, schools, users, content, revenue, support, grievances and Community governance queues.' },
    { title: 'Take governed actions', description: 'Manage account states, configuration, competitions, Community lifecycle decisions and escalated Parent grievances.' },
    { title: 'Audit platform health', description: 'Monitor adoption, unresolved issues, overdue school responses, moderation queues and operational configuration.' },
  ],
  proofTitle: 'Protected platform operations already implemented',
  proofIntro: 'These areas map directly to SUPER_ADMIN routes and are intentionally separated from individual School Admin functionality.',
  proofs: [
    { icon: '📈', title: 'Analytics & revenue', description: 'Platform analytics, revenue summary and content analytics are protected admin endpoints.' },
    { icon: '🏢', title: 'Schools & users', description: 'School and user listing, detail, export and status controls are available.' },
    { icon: '🛡️', title: 'Grievance oversight', description: 'Escalated/overdue Parent concerns, audit history, internal notes and platform status intervention are centrally governed.' },
    { icon: '🤝', title: 'Competitions & Communities', description: 'Platform-level competition creation and full Education Community governance are part of Admin.' },
  ],
  loginTitle: 'Login to Platform Admin',
  loginText: 'Platform analytics, user controls, support tickets, grievances, Community governance and other network-level actions are restricted to authorised Platform Administrators.',
};

export default function PlatformAdminPublicPage() {
  return <PublicModulePage config={CONFIG} />;
}
