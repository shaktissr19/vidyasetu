import PublicModulePage, { type PublicModuleConfig } from '@/components/public/PublicModulePage';

const CONFIG: PublicModuleConfig = {
  eyebrow: 'For Students · Classes 1–12',
  title: 'Learn, participate and stay connected to',
  accentTitle: 'your school journey',
  summary: 'VidyaSetu gives Indian students one identity for subject learning, school-linked records, attendance, report cards, academic competitions, doubts, offline study support and moderated Education Communities.',
  audience: 'students',
  loginRole: 'student',
  metrics: [
    { key: 'students', label: 'Active students' },
    { key: 'competitions', label: 'Published competitions' },
    { key: 'schools', label: 'Active schools' },
    { key: 'groups', label: 'Active Communities' },
  ],
  capabilities: [
    {
      icon: '📚',
      title: 'Subject and chapter learning',
      description: 'Students can move through subjects, chapters and learning items from the same account used for school records.',
      bullets: ['Class/grade-aligned subject navigation', 'Learning-item progress', 'Completion tracking'],
    },
    {
      icon: '🧠',
      title: 'Doubts and guided support',
      description: 'The student workspace includes doubt flows and an AI tutor entry point for guided academic support.',
      bullets: ['Ask academic doubts', 'Review answers', 'Use AI-assisted study support'],
    },
    {
      icon: '🪪',
      title: 'Permanent student identity',
      description: 'A permanent VidyaSetu Student ID can stay with the learner and connect to a school/class through an approval workflow.',
      bullets: ['Permanent Student ID', 'School-link approval status', 'Class and roll-number context'],
    },
    {
      icon: '📅',
      title: 'Attendance visibility',
      description: 'Students can view attendance summaries and month-level records entered by their school.',
      bullets: ['Attendance percentage', 'Present / absent / late status', 'Monthly attendance detail'],
    },
    {
      icon: '📄',
      title: 'Results and report cards',
      description: 'Academic results are available inside the same account instead of being scattered across paper notices and separate systems.',
      bullets: ['Report-card access', 'Subject-level marks', 'Performance visibility'],
    },
    {
      icon: '🏆',
      title: 'Academic competitions',
      description: 'Students can discover published challenges, register, attempt eligible exams and view results or leaderboards.',
      bullets: ['Competition discovery', 'Registration and attempts', 'Leaderboards and results'],
    },
    {
      icon: '⭐',
      title: 'Participation and progress',
      description: 'XP, streaks, badges and leaderboard experiences reward consistent participation without replacing school academic records.',
      bullets: ['XP and levels', 'Learning streaks', 'Badges and leaderboard'],
    },
    {
      icon: '📥',
      title: 'Lower-connectivity study support',
      description: 'Offline-download management helps students organise saved learning items when internet access is inconsistent.',
      bullets: ['Downloaded-item list', 'Remove offline copies', 'Resume from the same account'],
    },
    {
      icon: '🤝',
      title: 'Education Communities',
      description: 'Students can learn and discuss in moderated Communities with controlled membership rather than an unrestricted public social feed.',
      bullets: ['Student, class or school context', 'Teacher–Student collaboration where approved', 'Posts, comments, consent and moderation'],
    },
  ],
  steps: [
    { title: 'Create or sign in', description: 'Use username, email, permanent Student ID, password or the supported mobile OTP flow.' },
    { title: 'Complete your profile', description: 'Set class/grade, language and identity details, and request a school/class link when applicable.' },
    { title: 'Learn and participate', description: 'Open subjects, learning resources, doubts, competitions, Communities and offline content from the student workspace.' },
    { title: 'Track school records', description: 'Review attendance, report cards, notifications and school-linked information after authentication.' },
  ],
  proofTitle: 'What students can access in VidyaSetu today',
  proofIntro: 'These capabilities correspond to current Student, content, competition, doubt and Community application routes.',
  proofs: [
    { icon: '🪪', title: 'Student identity', description: 'Profile completion, permanent Student ID and school-link state.' },
    { icon: '📈', title: 'Academic progress', description: 'Attendance, report-card records, subject progress and learning completion.' },
    { icon: '📚', title: 'Learning tools', description: 'Subjects, content items, doubts, AI tutor entry points and offline downloads.' },
    { icon: '🤝', title: 'Participation', description: 'Competitions, exam attempts, leaderboards, XP, badges and moderated Education Communities.' },
  ],
  loginTitle: 'Login to Student Dashboard',
  loginText: 'Attendance, marks, school links, learning progress and personal records are private. Sign in to view your own Student workspace.',
};

export default function StudentsPublicPage() {
  return <PublicModulePage config={CONFIG} />;
}
