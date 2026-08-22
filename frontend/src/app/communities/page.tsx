import PublicModulePage, { type PublicModuleConfig } from '@/components/public/PublicModulePage';

const CONFIG: PublicModuleConfig = {
  eyebrow: 'Education Communities',
  title: 'A safe social layer for',
  accentTitle: 'learning, school and family collaboration',
  summary: 'VidyaSetu Communities connect students, parents, teachers and schools in moderated spaces for learning, discussion, peer support and school-family interaction. Membership is controlled, invitations require consent and formal grievances remain separately tracked for accountable resolution.',
  audience: 'Education Community participants',
  loginRole: 'student',
  secondaryLogin: { role: 'parent', label: 'Parent login' },
  metrics: [
    { key: 'groups', label: 'Active Communities' },
    { key: 'students', label: 'Active students' },
    { key: 'parents', label: 'Parent accounts' },
    { key: 'teachers', label: 'Teachers' },
  ],
  capabilities: [
    {
      icon: '🎓',
      title: 'Student Communities',
      description: 'Students can learn together in moderated spaces linked to study, school or class context.',
      bullets: ['Study and doubt discussions', 'Competition preparation', 'Peer learning with moderation'],
    },
    {
      icon: '👩‍🏫',
      title: 'Teacher Communities',
      description: 'Teachers can collaborate around academic practice, class context, resources and school-linked discussion.',
      bullets: ['Teaching-resource exchange', 'Class or subject collaboration', 'School-linked professional discussion'],
    },
    {
      icon: '👨‍👩‍👧',
      title: 'Parent Communities',
      description: 'Parents can discuss school life, learning support, common concerns and family participation without exposing private child records.',
      bullets: ['Parent peer support', 'School information and awareness', 'Learning support at home'],
    },
    {
      icon: '🏫',
      title: 'School Communities',
      description: 'Schools can operate moderated institution or class communities for communication and collaboration.',
      bullets: ['School-wide spaces', 'Class-specific spaces', 'Announcements and discussion'],
    },
    {
      icon: '🤝',
      title: 'Teacher–Student collaboration',
      description: 'Approved mixed communities can support academic discussion while preserving stronger moderation around adult/minor participation.',
      bullets: ['Academic Q&A', 'Subject support', 'Controlled membership and moderation'],
    },
    {
      icon: '💬',
      title: 'Parent–Teacher collaboration',
      description: 'Parents and teachers can discuss general academic or school topics in moderated community spaces while private child-specific records stay protected.',
      bullets: ['General school discussion', 'Learning-support conversations', 'No exposure of private child records'],
    },
    {
      icon: '🏫',
      title: 'Parent–School collaboration',
      description: 'Schools and families can use Communities for awareness, general concerns, events and constructive discussion.',
      bullets: ['School-family participation', 'General issue discussion', 'Events and community updates'],
    },
    {
      icon: '🧑‍🤝‍🧑',
      title: 'Parent–Student and mixed spaces',
      description: 'Where appropriate, communities can bring families and learners together around shared academic or school activities.',
      bullets: ['Learning projects', 'Competition or event support', 'Role-aware participation rules'],
    },
    {
      icon: '🛡️',
      title: 'Moderation, consent and reporting',
      description: 'Communities are not an open public social network. Creation, membership, invitations and reporting are governed inside VidyaSetu.',
      bullets: ['Platform-approved creation', 'Join requests and invitation consent', 'Owner/moderator controls and reporting'],
    },
    {
      icon: '⚖️',
      title: 'Community discussion vs formal grievance',
      description: 'A Community can help users discuss or understand a concern. Formal complaints use the Grievance Centre so evidence, SLA, replies, escalation and resolution remain auditable.',
      bullets: ['Informal discussion in Communities', 'Formal ticket for accountable action', 'Private evidence and escalation kept in Grievances'],
    },
  ],
  steps: [
    { title: 'Choose the right Community', description: 'Use a Student, Parent, Teacher, School or approved mixed Community appropriate to the discussion.' },
    { title: 'Join with consent', description: 'Membership is controlled through owner/moderator decisions or recipient-approved invitations.' },
    { title: 'Collaborate constructively', description: 'Share learning resources, discuss school topics, ask questions and support one another inside the moderated space.' },
    { title: 'Escalate formally when needed', description: 'If an issue needs official school action, evidence or escalation, use the Grievance Centre instead of relying only on a Community discussion.' },
  ],
  proofTitle: 'Education-first social collaboration with governance',
  proofIntro: 'The underlying VidyaSetu Group model already persists lifecycle, ownership, membership, invitations, posts, comments and reports. Communities is the clearer product name presented to users.',
  proofs: [
    { icon: '🧭', title: 'Lifecycle control', description: 'Pending, active, rejected, suspended and archived Community states are governed by Platform Admin.' },
    { icon: '🔑', title: 'Role-aware membership', description: 'Owner, moderator and member relationships control who can participate and what they can manage.' },
    { icon: '🤝', title: 'Consent', description: 'Join requests and invitation acceptance are separate tracked workflows rather than forced membership.' },
    { icon: '🚩', title: 'Reporting & safety', description: 'Communities, posts, comments or members can be reported for review and moderation.' },
  ],
  loginTitle: 'Login to Communities',
  loginText: 'Community membership, posts and discussions are private. Open the login page and select your real Student, Parent, Teacher, School or Platform Admin role.',
};

export default function CommunitiesPublicPage() {
  return <PublicModulePage config={CONFIG} />;
}
