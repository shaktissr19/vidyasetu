import PublicModulePage, { type PublicModuleConfig } from '@/components/public/PublicModulePage';

const CONFIG: PublicModuleConfig = {
  eyebrow: 'For Students',
  title: 'A learning workspace that stays with',
  accentTitle: 'the student journey',
  summary: 'VidyaSetu brings learning content, school-linked records, attendance, report cards, competitions, doubts, offline study and progress signals into one student experience.',
  audience: 'students',
  loginRole: 'student',
  metrics: [
    { key: 'students', label: 'Active students' },
    { key: 'competitions', label: 'Published competitions' },
    { key: 'schools', label: 'Active schools' },
    { key: 'groups', label: 'Active Groups' },
  ],
  capabilities: [
    {
      icon: '📚',
      title: 'Learning by subject',
      description: 'Students can move through subjects, chapters and learning items from the same account used for school records.',
      bullets: ['Subject and chapter navigation', 'Learning-item progress', 'Completion tracking'],
    },
    {
      icon: '🧠',
      title: 'Doubts and AI support',
      description: 'The student workspace includes doubt flows and an AI tutor entry point for guided learning support.',
      bullets: ['Ask academic doubts', 'Review answers', 'Use AI-assisted study support'],
    },
    {
      icon: '🏫',
      title: 'School-linked identity',
      description: 'A permanent VidyaSetu Student ID can be linked to a school and class through an approval workflow.',
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
      description: 'Academic results are surfaced inside the same account instead of being scattered across separate systems.',
      bullets: ['Report-card access', 'Subject-level marks', 'Performance visibility'],
    },
    {
      icon: '🏆',
      title: 'Competitions and exams',
      description: 'Students can discover published academic challenges, register, attempt eligible exams and view leaderboards/results.',
      bullets: ['Competition discovery', 'Registration and attempts', 'Leaderboards and results'],
    },
    {
      icon: '⭐',
      title: 'Progress and gamification',
      description: 'XP, streaks, badges and leaderboard experiences reward consistent participation without replacing academic records.',
      bullets: ['XP and levels', 'Learning streaks', 'Badges and leaderboard'],
    },
    {
      icon: '📥',
      title: 'Offline study support',
      description: 'The student module contains offline-download management so saved content can be organised for lower-connectivity use.',
      bullets: ['Downloaded-item list', 'Remove offline copies', 'Resume from the same account'],
    },
    {
      icon: '👥',
      title: 'Private Groups',
      description: 'Students can participate in moderated Groups where membership and invitations are controlled instead of using an open public social feed.',
      bullets: ['Private or school/class scope', 'Approval-based membership', 'Posts, comments and moderation'],
    },
  ],
  steps: [
    { title: 'Create or sign in', description: 'Use username, email, permanent Student ID or supported OTP flow to access the student account.' },
    { title: 'Complete profile', description: 'Set grade, language and identity details, and request a school/class link when applicable.' },
    { title: 'Learn and participate', description: 'Open subjects, content, doubts, competitions, Groups and offline resources from the student workspace.' },
    { title: 'Track school records', description: 'Review attendance, report cards, notifications and school-linked information after authentication.' },
  ],
  proofTitle: 'What students can actually access today',
  proofIntro: 'These capabilities correspond to current student, content, competition, doubt and Group application routes.',
  proofs: [
    { icon: '🪪', title: 'Student identity', description: 'Profile status, profile completion, permanent Student ID and school-link state.' },
    { icon: '📈', title: 'Academic progress', description: 'Attendance, report-card records, subject progress and learning completion.' },
    { icon: '🧩', title: 'Learning tools', description: 'Subjects, content items, doubts, AI tutor entry points and offline downloads.' },
    { icon: '🎯', title: 'Participation', description: 'Competitions, exam attempts, leaderboards, XP, badges and moderated Groups.' },
  ],
  loginTitle: 'Login to Student Dashboard',
  loginText: 'Your attendance, marks, school link, learning progress and personal records are protected. Sign in to view them.',
};

export default function StudentsPublicPage() {
  return <PublicModulePage config={CONFIG} />;
}
