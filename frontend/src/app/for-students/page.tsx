import PublicModulePage, { type PublicModuleConfig } from '@/components/public/PublicModulePage';

const CONFIG: PublicModuleConfig = {
  eyebrow: 'For Students across Bharat',
  title: 'One student identity for learning, school records and',
  accentTitle: 'everyday academic progress',
  summary: 'VidyaSetu brings learning content, school-linked identity, attendance, report cards, competitions, doubts, offline study and Education Community into one student experience that can continue across class and school workflows.',
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
      icon: '🪪',
      title: 'Permanent VidyaSetu Student ID',
      description: 'A student keeps one VidyaSetu identity while school and class links move through a controlled approval workflow.',
      bullets: ['Permanent Student ID', 'School and class link status', 'Roll number and academic-year context'],
    },
    {
      icon: '📚',
      title: 'Learning by subject and chapter',
      description: 'Study content and learning progress sit inside the same account used for school records and participation.',
      bullets: ['Subject and chapter navigation', 'Learning-item progress', 'Completion tracking'],
    },
    {
      icon: '🧠',
      title: 'Doubts and AI study support',
      description: 'Students can raise academic doubts and use the AI Tutor entry point for guided study support when available.',
      bullets: ['Ask academic doubts', 'Review answers', 'AI-assisted study workflow'],
    },
    {
      icon: '📅',
      title: 'Attendance that students can see',
      description: 'School-entered attendance becomes visible to the student instead of remaining only in an office register.',
      bullets: ['Attendance percentage', 'Present / absent / late status', 'Month-level detail'],
    },
    {
      icon: '📄',
      title: 'Results and report cards',
      description: 'School results are available from the student account with subject-level context when published by the school.',
      bullets: ['Report-card access', 'Subject marks', 'Performance visibility'],
    },
    {
      icon: '🏆',
      title: 'Competitions and academic challenges',
      description: 'Discover published Competitions, register when eligible, attempt assessments and view completed results or leaderboards.',
      bullets: ['Competition discovery', 'Registration and attempts', 'Results and leaderboard'],
    },
    {
      icon: '⭐',
      title: 'Motivation through progress signals',
      description: 'XP, streaks and badges recognise consistent participation while formal school records remain separate and authoritative.',
      bullets: ['XP and levels', 'Learning streaks', 'Badges and leaderboard'],
    },
    {
      icon: '📥',
      title: 'Lower-connectivity study support',
      description: 'Offline-download management helps students organise saved learning items for times when internet access is unreliable.',
      bullets: ['Downloaded-item list', 'Manage offline copies', 'Continue from the same account'],
    },
    {
      icon: '🌐',
      title: 'Education Community',
      description: 'Join moderated study circles and school/class communities rather than an anonymous public social feed.',
      bullets: ['Student and mixed learning communities', 'Approval-based membership', 'Posts, replies, resources and moderation'],
    },
    {
      icon: '🗣️',
      title: 'Language preference for Indian learners',
      description: 'The account model supports Hindi and multiple Indian language preferences so the platform can adapt the experience as localised content grows.',
      bullets: ['Hindi preference', 'Regional-language account options', 'English option'],
    },
  ],
  steps: [
    { title: 'Create or sign in', description: 'Use username, email, permanent Student ID, mobile/password or the supported OTP flow to access the student account.' },
    { title: 'Build your student profile', description: 'Set grade and language preferences, then request a school/class link where applicable.' },
    { title: 'Learn and participate', description: 'Open subjects, doubts, AI support, Competitions, Education Community and offline resources from one workspace.' },
    { title: 'Follow your school journey', description: 'Review attendance, report cards, notifications and school-linked information after authentication.' },
  ],
  proofTitle: 'A student workspace connected to real school workflows',
  proofIntro: 'The Student module combines learning activity with authenticated school-linked records without exposing those records on the public website.',
  proofs: [
    { icon: '🪪', title: 'Identity & school link', description: 'Profile status, permanent Student ID, grade/class context and school-link state.' },
    { icon: '📈', title: 'Academic visibility', description: 'Attendance, report cards, subject progress and learning completion.' },
    { icon: '🧩', title: 'Learning tools', description: 'Subjects, content items, doubts, AI Tutor entry point and offline downloads.' },
    { icon: '🌐', title: 'Participation', description: 'Competitions, attempts, leaderboards, XP, badges and moderated Education Community.' },
  ],
  loginTitle: 'Login to Student Dashboard',
  loginText: 'Your attendance, marks, school link and learning progress are private. Sign in to see records belonging to your Student account.',
};

export default function StudentsPublicPage() {
  return <PublicModulePage config={CONFIG} />;
}
