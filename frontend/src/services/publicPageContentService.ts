import api from './api';
import type { ApiEnvelope } from '@/types/api';
import type { LearningCategory } from './publicService';

export interface LearnPageContent {
  hero: { eyebrow: string; title: string; description: string; imageUrl: string; primaryActionLabel: string; secondaryActionLabel: string };
  browse: { eyebrow: string; title: string; description: string };
  learningTypes: { eyebrow: string; title: string; description: string; allLabel: string; allDescription: string; categories: Array<{ id: LearningCategory; label: string; shortLabel: string; description: string }> };
  results: { eyebrow: string; title: string; description: string };
  practice: { eyebrow: string; title: string; description: string; emptyMessage: string; chooseMessage: string };
  development: { eyebrow: string; title: string; description: string; pillars: Array<{ category: LearningCategory; eyebrow: string; title: string; copy: string }> };
  finalCta: { eyebrow: string; title: string; description: string; loginLabel: string; createAccountLabel: string };
}
export interface AdminLearnPageContent { published: LearnPageContent; draft: LearnPageContent | null; updatedAt: string | null; publishedAt: string | null; version: number; }

export const getPublicLearnPage = () => api.get<ApiEnvelope<LearnPageContent>>('/public/pages/learn');
export const getAdminLearnPage = () => api.get<ApiEnvelope<AdminLearnPageContent>>('/admin/public-pages/learn');
export const saveLearnPageDraft = (content: LearnPageContent) => api.put<ApiEnvelope<{ saved: boolean; version: number }>>('/admin/public-pages/learn/draft', content);
export const publishLearnPageDraft = () => api.post<ApiEnvelope<{ published: boolean; publishedAt: string; version: number }>>('/admin/public-pages/learn/publish');

export const DEFAULT_LEARN_PAGE_CONTENT: LearnPageContent = {
  hero: { eyebrow: 'Learning · Pre-Nursery to Class 12 · Cross-board', title: 'Learning that fits into real life.', description: 'Explore lessons, practice, reading and skills that help learners keep moving forward.', imageUrl: '/images/heroes/learn-hero.png', primaryActionLabel: 'Explore learning', secondaryActionLabel: 'Practice by class' },
  browse: { eyebrow: 'FIND THE RIGHT LEARNING PATH', title: 'Browse by learning level', description: 'Choose a stage or grade first. Narrow by board only when the curriculum needs to be more specific.' },
  learningTypes: { eyebrow: 'LEARNING TYPE', title: 'Explore more than the syllabus', description: 'Academic learning stays central, with visible pathways for study habits, confidence, responsibility and life skills.', allLabel: 'All learning', allDescription: 'Explore everything', categories: [
    { id: 'ACADEMIC', label: 'Academic Learning', shortLabel: 'Academic', description: 'Explore this path' }, { id: 'MOTIVATION', label: 'Motivation', shortLabel: 'Motivation', description: 'Explore this path' }, { id: 'STUDY_SKILLS', label: 'Study Skills', shortLabel: 'Study Skills', description: 'Explore this path' }, { id: 'WORK_ETHIC', label: 'Work Ethic', shortLabel: 'Work Ethic', description: 'Explore this path' }, { id: 'SOCIAL_RESPONSIBILITY', label: 'Social Responsibility', shortLabel: 'Social Responsibility', description: 'Explore this path' }, { id: 'LIFE_SKILLS', label: 'Life Skills', shortLabel: 'Life Skills', description: 'Explore this path' }, { id: 'WELLBEING', label: 'Well-being', shortLabel: 'Well-being', description: 'Explore this path' }, { id: 'CAREER_AWARENESS', label: 'Career Awareness', shortLabel: 'Career', description: 'Explore this path' }, { id: 'DIGITAL_CITIZENSHIP', label: 'Digital Citizenship', shortLabel: 'Digital Citizenship', description: 'Explore this path' },
  ] },
  results: { eyebrow: 'LEARNING RESOURCES', title: 'Explore learning', description: 'A focused preview of academic learning and personal growth resources.' },
  practice: { eyebrow: 'PRACTISE AND CHECK UNDERSTANDING', title: 'Practice when the learner is ready', description: 'Short practice sets and question papers help students check what they understand before moving ahead.', emptyMessage: 'More practice for this class can be added through the Learning Studio as the catalogue grows.', chooseMessage: 'Choose a school class above to see practice sets for that level.' },
  development: { eyebrow: 'BEYOND MARKS', title: 'Learning for school. Skills for life.', description: 'Academic progress matters, and so do curiosity, habits, values, resilience and confidence at every stage of development.', pillars: [
    { category: 'ACADEMIC', eyebrow: 'ACADEMIC MASTERY', title: 'Build strong concepts, not just answers', copy: 'Board-aware lessons, reading, video, practice and question papers organised around the learner’s stage.' }, { category: 'STUDY_SKILLS', eyebrow: 'LEARNING HOW TO LEARN', title: 'Turn effort into a repeatable study habit', copy: 'Focus, revision, planning, exam preparation and practical routines that make everyday learning easier.' }, { category: 'WORK_ETHIC', eyebrow: 'WORK ETHIC', title: 'Show up prepared and finish what matters', copy: 'Reliability, preparation, integrity and productive habits for school today and responsibilities later in life.' }, { category: 'SOCIAL_RESPONSIBILITY', eyebrow: 'SOCIAL RESPONSIBILITY', title: 'Grow into a thoughtful member of the community', copy: 'Respect, contribution, digital citizenship and everyday choices that make classrooms and communities better.' }, { category: 'MOTIVATION', eyebrow: 'MOTIVATION & RESILIENCE', title: 'Keep moving when progress feels slow', copy: 'Confidence, consistency, learning from mistakes and realistic goal-setting without empty motivational slogans.' }, { category: 'WELLBEING', eyebrow: 'WELL-BEING', title: 'Make room for balance as well as achievement', copy: 'Age-appropriate guidance around routines, emotional balance and sustainable learning habits.' },
  ] },
  finalCta: { eyebrow: 'LEARNING CONTINUES AFTER SIGN-IN', title: 'Save progress. Keep practising. Return where you left off.', description: 'Student accounts add class-aware recommendations, bookmarks, progress, assessment history and school-connected learning.', loginLabel: 'Student login', createAccountLabel: 'Create account' },
};
