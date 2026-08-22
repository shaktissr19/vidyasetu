import PublicModulePage, { type PublicModuleConfig } from '@/components/public/PublicModulePage';

const CONFIG: PublicModuleConfig = {
  eyebrow: 'VidyaSetu Education Community',
  title: 'A trusted education network for',
  accentTitle: 'students, parents, teachers and schools',
  summary: 'VidyaSetu Education Community brings learning conversations, parent networks, teacher circles and school/class collaboration into one moderated platform. Communities are linked to verified VidyaSetu identities, with approval, consent and reporting built in.',
  audience: 'the Education Community',
  loginRole: 'student',
  metrics: [
    { key: 'groups', label: 'Active Communities' },
    { key: 'students', label: 'Active students' },
    { key: 'parents', label: 'Parent accounts' },
    { key: 'teachers', label: 'Teachers' },
  ],
  capabilities: [
    {
      icon: '🎓',
      title: 'Student learning communities',
      description: 'Students can discuss subjects, exam preparation and learning resources in communities appropriate to their school or learning context.',
      bullets: ['Study circles and subject discussions', 'School/class-linked communities', 'Posts, comments and learning resources'],
    },
    {
      icon: '👨‍👩‍👧',
      title: 'Parent communities',
      description: 'Parents can connect around school information, child-support topics and shared concerns without exposing private child records to other members.',
      bullets: ['Parent-only communities', 'School-linked parent networks', 'Private child records stay outside the community feed'],
    },
    {
      icon: '👩‍🏫',
      title: 'Teacher communities',
      description: 'Teachers can collaborate around classes, subjects, teaching resources and school communication inside role-aware community spaces.',
      bullets: ['Teacher circles', 'Subject and class context', 'Resource and announcement sharing'],
    },
    {
      icon: '🏫',
      title: 'School and class communities',
      description: 'A community can be associated with a school or class so discussions stay relevant to the people who actually belong to that context.',
      bullets: ['Private, school and class scope', 'Verified school context', 'Controlled discovery and membership'],
    },
    {
      icon: '🤝',
      title: 'Mixed learning communities',
      description: 'Selected communities can bring students and educators together with stronger ownership rules so adult/minor participation stays moderated.',
      bullets: ['Student + Teacher participation', 'Teacher/School Admin ownership for mixed spaces', 'Role-aware safeguards'],
    },
    {
      icon: '✅',
      title: 'Approval-based membership',
      description: 'Joining is not automatic. Owners and moderators review requests, while invitations require the recipient to accept.',
      bullets: ['Join requests', 'Invite acceptance', 'No forced membership'],
    },
    {
      icon: '📌',
      title: 'Community feed and announcements',
      description: 'Members can share questions, ideas, school updates and learning resources in a private feed with comments and pinned announcements.',
      bullets: ['Posts and replies', 'Pinned announcements', 'Images, documents and learning links'],
    },
    {
      icon: '🛡️',
      title: 'Moderation and reporting',
      description: 'Community owners, moderators and Platform Admin have clear tools for membership control, content review and abuse reporting.',
      bullets: ['Owner and moderator roles', 'Member/content reporting', 'Suspend, archive and ownership recovery'],
    },
    {
      icon: '🔒',
      title: 'Education-first privacy',
      description: 'This is not an anonymous open social network. Participation is connected to authenticated VidyaSetu accounts and role context.',
      bullets: ['Verified platform identities', 'No public anonymous posting', 'Private operational/student data stays outside the feed'],
    },
  ],
  steps: [
    { title: 'Find the right community', description: 'Sign in and discover communities relevant to your role, school, class or learning interest.' },
    { title: 'Request or create', description: 'Join an existing community or submit a new community request for approval.' },
    { title: 'Get approved safely', description: 'Creation and membership follow explicit approval and invitation-consent rules.' },
    { title: 'Learn, share and collaborate', description: 'Use posts, comments, announcements and resources while moderation and reporting remain available.' },
  ],
  proofTitle: 'A social layer designed specifically for education',
  proofIntro: 'The current collaboration engine already models approval, ownership, membership, invitations, posts, comments, files and reports. The user-facing product is now presented as VidyaSetu Education Community.',
  proofs: [
    { icon: '🧭', title: 'Lifecycle', description: 'Pending, active, rejected, suspended and archived community states.' },
    { icon: '🔑', title: 'Roles', description: 'Owner, moderator and member relationships are persisted for every community.' },
    { icon: '🤝', title: 'Consent', description: 'Join requests and invitation acceptance are separate tracked workflows.' },
    { icon: '⚖️', title: 'Governance', description: 'Content removal, reporting, review and Platform Admin controls are supported.' },
  ],
  loginTitle: 'Login to Education Community',
  loginText: 'Community membership, posts and discussions are private. Sign in with your actual Student, Parent, Teacher, School or Platform Admin identity to see the communities available to you.',
};

export default function GroupsInfoPage() {
  return <PublicModulePage config={CONFIG} />;
}
