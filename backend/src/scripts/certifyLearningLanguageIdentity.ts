import 'dotenv/config';
import { query } from '../config/db';
import { getLearningHome, updateResourceProgress } from '../services/studentLearningHub.service';
import { enrichHomeResourcesBilingual } from '../services/studentLearningPresentationV3.service';
import { getAssessment, listAssessments } from '../services/studentAssessmentCatalogueV3.service';

type CertifiedResource = {
  id: string;
  title: string;
  title_hi?: string | null;
  summary?: string | null;
  summary_hi?: string | null;
  progress_pct?: number;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV !== 'test') throw new Error('Learning language identity certification is test-only');

  const learner = await query<{ id: string }>(
    `SELECT id
     FROM users
     WHERE role='STUDENT' AND username LIKE 'content.v3.nursery.%'
     ORDER BY created_at DESC
     LIMIT 1`,
  );
  const userId = learner.rows[0]?.id;
  assert(userId, 'Content 3.0 Nursery learner fixture is missing');

  const resource = await query<{ id: string }>(
    `SELECT id
     FROM learning_resources
     WHERE title='Find the circle' AND review_status='PUBLISHED'
     ORDER BY created_at DESC
     LIMIT 1`,
  );
  const resourceId = resource.rows[0]?.id;
  assert(resourceId, 'Published bilingual Nursery resource fixture is missing');

  const englishHome = await enrichHomeResourcesBilingual(await getLearningHome(userId));
  const englishResource = englishHome.recommendedResources.find((item) => item.id === resourceId) as CertifiedResource | undefined;
  assert(englishResource, 'Nursery learner cannot discover the bilingual resource');
  assert(englishResource.id === resourceId, 'English presentation changed canonical Resource identity');
  assert(englishResource.title === 'Find the circle', 'English presentation title is incorrect');
  assert(englishResource.title_hi === 'वृत्त खोजो', 'Hindi presentation is not attached to the same Resource identity');

  await updateResourceProgress(userId, resourceId, 47);

  // A language change is intentionally presentation-only: re-read the same
  // canonical object and select its Hindi fields without changing the id used
  // by progress or mastery evidence.
  const hindiHome = await enrichHomeResourcesBilingual(await getLearningHome(userId));
  const hindiResource = hindiHome.recommendedResources.find((item) => item.id === resourceId) as CertifiedResource | undefined;
  assert(hindiResource, 'Hindi presentation lost the canonical Nursery resource');
  assert(hindiResource.id === englishResource.id, 'EN→HI presentation created a second Resource identity');
  assert(hindiResource.title_hi === 'वृत्त खोजो', 'Hindi presentation title is unavailable after progress write');
  assert(Number(hindiResource.progress_pct || 0) >= 47, 'EN→HI presentation reset Resource progress');

  const progressIdentity = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM student_learning_resource_progress slrp
     JOIN students s ON s.id=slrp.student_id
     WHERE s.user_id=$1::uuid AND slrp.resource_id=$2::uuid`,
    [userId, resourceId],
  );
  assert(Number(progressIdentity.rows[0]?.count || 0) === 1, 'Language presentation duplicated the learner Resource progress row');

  const languageColumns = await query<{ table_name: string; column_name: string }>(
    `SELECT table_name,column_name
     FROM information_schema.columns
     WHERE table_schema='public'
       AND table_name IN ('student_learning_resource_progress','student_concept_progress')
       AND column_name ILIKE '%lang%'`,
  );
  assert(languageColumns.rowCount === 0, 'Academic progress/mastery schema must not be keyed by presentation language');

  const assessmentFixture = await query<{ id: string }>(
    `SELECT id
     FROM learning_assessments
     WHERE title='Nursery shape practice' AND review_status='PUBLISHED'
     ORDER BY created_at DESC
     LIMIT 1`,
  );
  const assessmentId = assessmentFixture.rows[0]?.id;
  assert(assessmentId, 'Published bilingual Nursery assessment fixture is missing');

  const assessments = await listAssessments(userId);
  const bilingualAssessment = assessments.find((item) => item.id === assessmentId) as
    | { id: string; title: string; title_hi?: string | null; summary_hi?: string | null }
    | undefined;
  assert(bilingualAssessment, 'Nursery learner cannot discover the canonical bilingual Assessment');
  assert(bilingualAssessment.id === assessmentId, 'Assessment identity changed across language presentation');
  assert(bilingualAssessment.title === 'Nursery shape practice', 'Assessment English title is incorrect');
  assert(bilingualAssessment.title_hi === 'नर्सरी आकार अभ्यास', 'Assessment Hindi title is not attached to the same identity');

  const detail = await getAssessment(userId, assessmentId) as {
    id: string;
    title: string;
    title_hi?: string | null;
    questions: Array<{ id: string; prompt: string; prompt_hi?: string | null; options: Array<{ key: string; text: string; textHi?: string | null }> }>;
  };
  assert(detail.id === assessmentId, 'Assessment detail changed canonical identity');
  assert(detail.title_hi === 'नर्सरी आकार अभ्यास', 'Assessment detail is missing Hindi presentation');
  assert(detail.questions.length > 0, 'Bilingual Nursery assessment has no questions');
  assert(detail.questions.every((question) => Boolean(question.prompt_hi?.trim())), 'Published learner questions must expose Hindi prompts');
  assert(detail.questions.every((question) => question.options.every((option) => Boolean(option.textHi?.trim()))), 'Published learner options must expose Hindi text');

  console.log('LEARNING LANGUAGE IDENTITY CERTIFIED — EN/HI PRESENTATION PRESERVES RESOURCE, ASSESSMENT, PROGRESS AND MASTERY IDENTITY');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    const { pool } = await import('../config/db');
    await pool.end();
  });
