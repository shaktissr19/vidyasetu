import PublicModulePage, { type PublicModuleConfig } from '@/components/public/PublicModulePage';

const CONFIG: PublicModuleConfig = {
  eyebrow: 'Private Collaboration',
  title: 'Groups built for education, with',
  accentTitle: 'approval, consent and moderation',
  summary: 'VidyaSetu Groups are intentionally different from an open social feed. Group creation is platform-approved, membership is controlled, invitations require recipient consent, and content can be moderated and reported.',
  audience: 'Group participants',
  loginRole: 'student',
  metrics: [
    { key: 'groups', label: 'Active Groups' },
    { key: 'students', label: 'Active students' },
    { key: 'parents', label: 'Parent accounts' },
    { key: 'teachers', label: 'Teachers' },
  ],
  capabilities: [
    {
      icon: '🛡️',
      title: 'Platform-approved creation',
      description: 'New Groups are not instantly public. They move through a pending decision before becoming active.',
      bullets: ['Pending / active / rejected lifecycle', 'Admin decision and notes', 'Suspend or archive controls'],
    },
    {
      icon: '👥',
      title: 'Purpose-specific Group types',
      description: 'Groups can be created for Students, Parents, Teachers or mixed participation depending on the collaboration need.',
      bullets: ['Student Groups', 'Parent and Teacher Groups', 'Mixed Groups'],
    },
    {
      icon: '🏫',
      title: 'Private, school or class scope',
      description: 'A Group can remain private or be explicitly associated with a school or class context.',
      bullets: ['Private scope', 'School scope', 'Class scope'],
    },
    {
      icon: '✅',
      title: 'Controlled membership',
      description: 'Joining is not automatic. Owners and moderators can review requests, and member state is tracked.',
      bullets: ['Join requests', 'Approve or reject decisions', 'Member removal and leave state'],
    },
    {
      icon: '✉️',
      title: 'Invitation consent',
      description: 'Invitations require recipient action rather than silently adding a person to a Group.',
      bullets: ['Owner-approved invitations', 'Recipient accept / decline', 'No forced membership'],
    },
    {
      icon: '📌',
      title: 'Posts and announcements',
      description: 'Active members can use private Group feeds with posts, announcements, pinned content and comments.',
      bullets: ['Group posts', 'Pinned announcements', 'Comments'],
    },
    {
      icon: '👮',
      title: 'Owner and moderator roles',
      description: 'Governance is explicit, including ownership, moderator permissions and owner recovery or transfer.',
      bullets: ['Owner role', 'Moderator role', 'Admin ownership transfer'],
    },
    {
      icon: '🚩',
      title: 'Reporting and review',
      description: 'Members can report Groups, posts, comments or members, and Platform Admin can review the report lifecycle.',
      bullets: ['Open / reviewing / resolved states', 'Target-specific reports', 'Admin resolution notes'],
    },
    {
      icon: '🔒',
      title: 'Education-first privacy',
      description: 'The collaboration model is private by design and tied to authenticated platform identities.',
      bullets: ['Authenticated membership', 'No public open feed', 'Role-aware participation'],
    },
  ],
  steps: [
    { title: 'Create or discover', description: 'An authenticated user starts a Group request or works with Groups visible to their role/context.' },
    { title: 'Platform approval', description: 'The Group remains pending until a Platform Admin approves or rejects it.' },
    { title: 'Controlled membership', description: 'Owners/moderators review join requests or invitations proceed with recipient consent.' },
    { title: 'Collaborate safely', description: 'Members post and comment inside the private Group, with reporting and governance available when needed.' },
  ],
  proofTitle: 'Governance built into the data model',
  proofIntro: 'The current Groups schema and APIs explicitly model approval, ownership, membership, invitations, posts, comments and reports.',
  proofs: [
    { icon: '🧭', title: 'Lifecycle', description: 'Pending, active, rejected, suspended and archived Group states.' },
    { icon: '🔑', title: 'Roles', description: 'Owner, moderator and member relationships are persisted for each Group.' },
    { icon: '🤝', title: 'Consent', description: 'Join requests and invitation acceptance are separate tracked workflows.' },
    { icon: '⚖️', title: 'Moderation', description: 'Content removal, reporting, review and admin governance are supported.' },
  ],
  loginTitle: 'Login to use Groups',
  loginText: 'Group names, membership, posts and discussions are private. Sign in with your actual role to view Groups available to you.',
};

export default function GroupsInfoPage() {
  return <PublicModulePage config={CONFIG} />;
}
