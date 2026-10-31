import { z } from 'zod';
import type { UUID } from '@vidyasetu/contracts';
import { query, transaction } from '../config/db';

const text = (max: number) => z.string().trim().min(1).max(max);
const category = z.enum(['ACADEMIC', 'MOTIVATION', 'STUDY_SKILLS', 'WORK_ETHIC', 'SOCIAL_RESPONSIBILITY', 'LIFE_SKILLS', 'WELLBEING', 'CAREER_AWARENESS', 'DIGITAL_CITIZENSHIP']);
const imageUrl = z.string().trim().max(1200).refine((value) => {
  if (!value) return true;
  if (value.startsWith('/') && !value.startsWith('//')) return true;
  try { return new URL(value).protocol === 'https:'; } catch { return false; }
}, 'Use a site path or secure HTTPS URL');

export const learnPageContentSchema = z.object({
  hero: z.object({ eyebrow: text(140), title: text(180), description: text(600), imageUrl, primaryActionLabel: text(80), secondaryActionLabel: text(80) }),
  browse: z.object({ eyebrow: text(120), title: text(180), description: text(500) }),
  learningTypes: z.object({ eyebrow: text(80), title: text(180), description: text(500), allLabel: text(80), allDescription: text(140), categories: z.array(z.object({ id: category, label: text(80), shortLabel: text(60), description: text(140) })).length(9) }),
  results: z.object({ eyebrow: text(80), title: text(180), description: text(500) }),
  practice: z.object({ eyebrow: text(100), title: text(180), description: text(500), emptyMessage: text(300), chooseMessage: text(240) }),
  development: z.object({ eyebrow: text(80), title: text(180), description: text(500), pillars: z.array(z.object({ category, eyebrow: text(100), title: text(180), copy: text(500) })).min(1).max(9) }),
  finalCta: z.object({ eyebrow: text(100), title: text(220), description: text(500), loginLabel: text(80), createAccountLabel: text(80) }),
});
export type LearnPageContent = z.infer<typeof learnPageContentSchema>;

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

interface PageRow { published_content: unknown; draft_content: unknown; updated_at: string; published_at: string; version: number; }
const PAGE_SLUG = 'learn';

export async function getPublishedLearnPage(): Promise<LearnPageContent> {
  const { rows: [row] } = await query<{ published_content: unknown }>('SELECT published_content FROM public_page_content WHERE page_slug=$1', [PAGE_SLUG]);
  return row?.published_content ? learnPageContentSchema.parse(row.published_content) : DEFAULT_LEARN_PAGE_CONTENT;
}

export async function getLearnPageForOwner() {
  const { rows: [row] } = await query<PageRow>('SELECT published_content,draft_content,updated_at,published_at,version FROM public_page_content WHERE page_slug=$1', [PAGE_SLUG]);
  return { published: learnPageContentSchema.parse(row?.published_content || DEFAULT_LEARN_PAGE_CONTENT), draft: row?.draft_content ? learnPageContentSchema.parse(row.draft_content) : null, updatedAt: row?.updated_at || null, publishedAt: row?.published_at || null, version: row?.version || 1 };
}

export async function saveLearnPageDraft(input: unknown, actorId: UUID) {
  const draft = learnPageContentSchema.parse(input);
  const { rows: [row] } = await query<{ version: number }>(
    `INSERT INTO public_page_content(page_slug,published_content,draft_content,updated_by,updated_at)
     VALUES($1,$2::jsonb,$2::jsonb,$3,NOW()) ON CONFLICT(page_slug) DO UPDATE
     SET draft_content=EXCLUDED.draft_content,updated_by=EXCLUDED.updated_by,updated_at=NOW() RETURNING version`,
    [PAGE_SLUG, JSON.stringify(draft), actorId],
  );
  return { saved: true, version: row?.version || 1 };
}

export async function publishLearnPageDraft(actorId: UUID) {
  return transaction(async (client) => {
    const { rows: [current] } = await client.query<{ draft_content: unknown; version: number }>('SELECT draft_content,version FROM public_page_content WHERE page_slug=$1 FOR UPDATE', [PAGE_SLUG]);
    if (!current?.draft_content) throw Object.assign(new Error('Save a Learn page draft before publishing it'), { statusCode: 409 });
    const content = learnPageContentSchema.parse(current.draft_content);
    const { rows: [published] } = await client.query(
      `UPDATE public_page_content SET published_content=$1::jsonb,draft_content=NULL,published_by=$2,published_at=NOW(),updated_by=$2,updated_at=NOW(),version=version+1
       WHERE page_slug=$3 RETURNING published_at,version`, [JSON.stringify(content), actorId, PAGE_SLUG],
    );
    await client.query(`INSERT INTO audit_log(actor_id,actor_role,action,entity_type,new_value) VALUES($1,'SUPER_ADMIN','PUBLIC_PAGE_PUBLISHED',$2,$3::jsonb)`, [actorId, PAGE_SLUG, JSON.stringify({ page: PAGE_SLUG, version: published.version })]);
    return { published: true, publishedAt: published.published_at, version: published.version };
  });
}
