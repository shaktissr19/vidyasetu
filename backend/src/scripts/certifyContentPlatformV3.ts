import 'dotenv/config';
import { query } from '../config/db';
import * as authoring from '../services/contentAuthoringV3.service';
import * as importer from '../services/contentImportV3.service';
import { getContentFactorySummary } from '../services/contentFactory.service';
import { updateGovernedContentTarget } from '../services/contentTargetGovernance.service';
import { getPublicLearningFilterOptions } from '../services/publicLearningFilterOptions.service';
import { listPublicLearningResources } from '../services/publicLearning.service';
import { listPublicAssessments } from '../services/publicLearningPractice.service';
import { getLearningHome } from '../services/studentLearningHub.service';
import { listAssessments as listStudentAssessments } from '../services/studentAssessmentCatalogueV3.service';

const ADMIN_ID = '00000000-0000-0000-0000-000000000001';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function expectReject(fn: () => Promise<unknown>, contains: string): Promise<void> {
  try {
    await fn();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.toLowerCase().includes(contains.toLowerCase())) {
      throw new Error(`Expected rejection containing "${contains}", got: ${message}`);
    }
    return;
  }
  throw new Error(`Expected rejection containing "${contains}"`);
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV !== 'test') throw new Error('Content Platform 3.0 certification is test-only');

  const admin = await query(`SELECT id FROM users WHERE id=$1::uuid AND role='SUPER_ADMIN'`, [ADMIN_ID]);
  assert(admin.rowCount === 1, 'SUPER_ADMIN certification fixture is missing');

  const grades = await query<{ code: string; name_hi: string | null }>(
    `SELECT code,name_hi FROM education_grade_levels WHERE is_active=TRUE ORDER BY sort_order`,
  );
  assert(grades.rowCount === 16, `Expected 16 active canonical grades, found ${grades.rowCount}`);
  assert(grades.rows.every((grade) => Boolean(grade.name_hi?.trim())), 'Every canonical grade requires a Hindi display name');
  for (const required of ['PRE_NURSERY','NURSERY','LKG','UKG','CLASS_12']) {
    assert(grades.rows.some((grade) => grade.code === required), `Missing canonical grade ${required}`);
  }

  const targetGrades = await query<{ count: string }>(
    `SELECT COUNT(DISTINCT grade_id)::text AS count FROM learning_content_targets`,
  );
  assert(Number(targetGrades.rows[0]?.count || 0) === 16, 'Content production targets must cover all 16 canonical grades');

  const factory = await getContentFactorySummary();
  assert(factory.gradeCount === 16, `Content Factory expected 16 grades, found ${factory.gradeCount}`);
  assert(factory.policy.bilingualPublicationRequired === true, 'Content Factory bilingual publication policy must be enabled');
  assert(factory.policy.canonicalGradeMappingRequired === true, 'Content Factory canonical grade policy must be enabled');

  await expectReject(
    () => authoring.createResource({
      title: 'Incomplete bilingual lesson', titleHi: '', summary: 'English summary', summaryHi: 'हिंदी सारांश',
      bodyMarkdown: 'English body', bodyMarkdownHi: 'हिंदी पाठ', resourceType: 'ARTICLE', category: 'ACADEMIC',
      visibility: 'REGISTERED', gradeCodes: ['CLASS_8'], sourceCode: 'VIDYASETU_ORIGINAL', licence: 'VIDYASETU_ORIGINAL', boardCodes: ['COMMON'],
    }, ADMIN_ID),
    'English and Hindi resource titles',
  );

  const class8Resource = await authoring.createResource({
    title: 'Content 3.0 bilingual lesson', titleHi: 'कंटेंट 3.0 द्विभाषी पाठ',
    summary: 'Certification lesson for canonical grade mapping.', summaryHi: 'कैनोनिकल कक्षा मैपिंग के लिए प्रमाणन पाठ।',
    bodyMarkdown: 'A force can change motion.', bodyMarkdownHi: 'बल गति में परिवर्तन कर सकता है।',
    resourceType: 'ARTICLE', category: 'ACADEMIC', visibility: 'REGISTERED', gradeCodes: ['CLASS_8'],
    sourceCode: 'VIDYASETU_ORIGINAL', licence: 'VIDYASETU_ORIGINAL', boardCodes: ['COMMON'],
  }, ADMIN_ID);
  const class8GradeMap = await query(
    `SELECT 1 FROM learning_resource_grades lrg JOIN education_grade_levels egl ON egl.id=lrg.grade_id WHERE lrg.resource_id=$1::uuid AND egl.code='CLASS_8'`,
    [class8Resource.id],
  );
  assert(class8GradeMap.rowCount === 1, 'Class 8 resource canonical grade mapping was not created');
  const resourceStatus = await query<{ review_status: string }>(`SELECT review_status::text FROM learning_resources WHERE id=$1::uuid`, [class8Resource.id]);
  assert(resourceStatus.rows[0]?.review_status === 'DRAFT', 'Content Factory resources must start in DRAFT');

  const nursery = await authoring.createResource({
    title: 'Find the circle', titleHi: 'वृत्त खोजो', summary: 'A playful shape activity.', summaryHi: 'आकार पहचानने की खेल गतिविधि।',
    resourceType: 'ACTIVITY', category: 'ACADEMIC', visibility: 'REGISTERED', gradeCodes: ['NURSERY'],
    sourceCode: 'VIDYASETU_ORIGINAL', licence: 'VIDYASETU_ORIGINAL', boardCodes: ['COMMON'],
  }, ADMIN_ID);
  const nurseryMap = await query(
    `SELECT lr.class_min,lr.class_max FROM learning_resources lr JOIN learning_resource_grades lrg ON lrg.resource_id=lr.id JOIN education_grade_levels egl ON egl.id=lrg.grade_id WHERE lr.id=$1::uuid AND egl.code='NURSERY'`,
    [nursery.id],
  );
  assert(nurseryMap.rowCount === 1, 'Nursery resource canonical grade mapping was not created');
  assert(nurseryMap.rows[0].class_min == null && nurseryMap.rows[0].class_max == null, 'Early-years resources must not require fake numeric classes');

  await expectReject(
    () => authoring.createQuestion({
      prompt: 'Which is correct?', promptHi: 'कौन सही है?', questionType: 'MCQ_SINGLE', difficulty: 'EASY',
      explanation: 'A is correct.', explanationHi: 'A सही है।', correctAnswer: { option: 'A' }, gradeCodes: ['CLASS_8'],
      sourceCode: 'VIDYASETU_ORIGINAL', licence: 'VIDYASETU_ORIGINAL', visibility: 'REGISTERED', boardCodes: ['COMMON'],
      options: [{ key: 'A', text: 'Push', textHi: '' }, { key: 'B', text: 'Pull', textHi: 'खींचना' }], skillCode: 'BASIC_REASONING',
    }, ADMIN_ID),
    'bilingual English and Hindi options',
  );

  const question = await authoring.createQuestion({
    publicCode: `VSC3-CERT-${Date.now()}`, prompt: 'Which action can be a force?', promptHi: 'कौन-सी क्रिया बल हो सकती है?',
    questionType: 'MCQ_SINGLE', difficulty: 'EASY', explanation: 'A push is a force.', explanationHi: 'धक्का एक बल है।',
    correctAnswer: { option: 'A' }, gradeCodes: ['CLASS_8'], sourceCode: 'VIDYASETU_ORIGINAL', licence: 'VIDYASETU_ORIGINAL',
    visibility: 'REGISTERED', boardCodes: ['COMMON'], skillCode: 'BASIC_REASONING',
    options: [{ key: 'A', text: 'Push', textHi: 'धक्का' }, { key: 'B', text: 'Colour', textHi: 'रंग' }],
  }, ADMIN_ID);
  const questionMap = await query(`SELECT 1 FROM learning_question_grades lqg JOIN education_grade_levels egl ON egl.id=lqg.grade_id WHERE lqg.question_id=$1::uuid AND egl.code='CLASS_8'`, [question.id]);
  assert(questionMap.rowCount === 1, 'Question canonical grade mapping was not created');

  const assessment = await authoring.createAssessment({
    title: 'Content 3.0 practice', titleHi: 'कंटेंट 3.0 अभ्यास', summary: 'Certification assessment.', summaryHi: 'प्रमाणन अभ्यास।',
    assessmentType: 'PRACTICE', visibility: 'REGISTERED', gradeCodes: ['CLASS_8'], boardCodes: ['COMMON'], questionIds: [question.id], conceptIds: [],
  }, ADMIN_ID);
  const assessmentMap = await query(`SELECT 1 FROM learning_assessment_grades lag JOIN education_grade_levels egl ON egl.id=lag.grade_id WHERE lag.assessment_id=$1::uuid AND egl.code='CLASS_8'`, [assessment.id]);
  assert(assessmentMap.rowCount === 1, 'Assessment canonical grade mapping was not created');
  const assessmentStatus = await query<{ review_status: string }>(`SELECT review_status::text FROM learning_assessments WHERE id=$1::uuid`, [assessment.id]);
  assert(assessmentStatus.rows[0]?.review_status === 'DRAFT', 'Content Factory assessments must start in DRAFT');

  const nurseryQuestion = await authoring.createQuestion({
    publicCode: `VSC3-NURSERY-${Date.now()}`, prompt: 'Which one is a circle?', promptHi: 'इनमें से वृत्त कौन-सा है?',
    questionType: 'MCQ_SINGLE', difficulty: 'EASY', explanation: 'The round shape is a circle.', explanationHi: 'गोल आकार वृत्त है।',
    correctAnswer: { option: 'A' }, gradeCodes: ['NURSERY'], sourceCode: 'VIDYASETU_ORIGINAL', licence: 'VIDYASETU_ORIGINAL',
    visibility: 'PUBLIC', boardCodes: ['COMMON'], skillCode: 'BASIC_REASONING',
    options: [{ key: 'A', text: 'Round shape', textHi: 'गोल आकार' }, { key: 'B', text: 'Square shape', textHi: 'चौकोर आकार' }],
  }, ADMIN_ID);
  const nurseryAssessment = await authoring.createAssessment({
    title: 'Nursery shape practice', titleHi: 'नर्सरी आकार अभ्यास', summary: 'A short bilingual shape check.', summaryHi: 'आकारों की छोटी द्विभाषी जाँच।',
    assessmentType: 'PRACTICE', visibility: 'PUBLIC', gradeCodes: ['NURSERY'], boardCodes: ['COMMON'], questionIds: [nurseryQuestion.id], conceptIds: [],
  }, ADMIN_ID);
  await query(`UPDATE learning_questions SET review_status='PUBLISHED',published_at=NOW() WHERE id=$1::uuid`, [nurseryQuestion.id]);
  await query(`UPDATE learning_resources SET visibility='PUBLIC',review_status='PUBLISHED',published_at=NOW() WHERE id=$1::uuid`, [nursery.id]);
  await query(`UPDATE learning_assessments SET review_status='PUBLISHED',published_at=NOW() WHERE id=$1::uuid`, [nurseryAssessment.id]);

  const publicNurseryResources = await listPublicLearningResources({ gradeCode: 'NURSERY', board: 'COMMON', limit: 100 });
  assert(publicNurseryResources.some((item) => item.id === nursery.id), 'Public Learn did not discover the canonical Nursery resource');
  const publicNurseryAssessments = await listPublicAssessments({ gradeCode: 'NURSERY', board: 'COMMON', limit: 100 });
  assert(publicNurseryAssessments.some((item) => item.id === nurseryAssessment.id), 'Public Learn did not discover the canonical Nursery assessment');

  const learnerKey = String(Date.now()).slice(-8);
  const nurseryUser = await query<{ id: string }>(
    `INSERT INTO users(mobile,name,role,status,language,username)
     VALUES($1,'Content V3 Nursery Learner','STUDENT','ACTIVE','en',$2)
     RETURNING id`,
    [`98${learnerKey}`, `content.v3.nursery.${learnerKey}`],
  );
  const nurseryUserId = nurseryUser.rows[0]?.id;
  assert(Boolean(nurseryUserId), 'Nursery learner certification fixture was not created');
  await query(
    `INSERT INTO students(user_id,school_id,class_id,grade_level,grade_code,status)
     VALUES($1::uuid,NULL,NULL,'Nursery','NURSERY','ACTIVE')`,
    [nurseryUserId],
  );
  const nurseryHome = await getLearningHome(nurseryUserId);
  assert(nurseryHome.learner.gradeCode === 'NURSERY', 'Student Learn did not preserve the learner canonical Nursery grade');
  assert(nurseryHome.recommendedResources.some((item) => item.id === nursery.id), 'Student Learn did not discover the learner Nursery resource');
  const nurseryStudentAssessments = await listStudentAssessments(nurseryUserId);
  assert(nurseryStudentAssessments.some((item) => item.id === nurseryAssessment.id), 'Student Learn did not discover the learner Nursery assessment');

  const importKey = `VS-C3-CERT-${Date.now()}`;
  const batch = await importer.stageImport({
    fileName: 'content-v3-cert.json', format: 'JSON', content: JSON.stringify({ rows: [{
      record_type: 'RESOURCE', import_key: importKey, grade_codes: 'NURSERY', board_codes: 'COMMON', journey_stage: 'SEE',
      source_code: 'VIDYASETU_ORIGINAL', licence: 'VIDYASETU_ORIGINAL', visibility: 'REGISTERED', title: 'Imported story', title_hi: 'आयातित कहानी',
      summary: 'A bilingual imported story.', summary_hi: 'एक द्विभाषी आयातित कहानी।', resource_type: 'STORY', category: 'ACADEMIC',
    }] }),
  }, ADMIN_ID);
  assert(batch.status === 'VALIDATED', `Expected importer batch VALIDATED, found ${batch.status}`);
  const committed = await importer.commitImportBatch(batch.id, ADMIN_ID);
  assert(committed.status === 'COMPLETED' && committed.imported_rows === 1, 'Bilingual importer did not complete exactly one row');
  const imported = await query<{ review_status: string }>(`SELECT review_status::text FROM learning_resources WHERE import_key=$1`, [importKey]);
  assert(imported.rows[0]?.review_status === 'DRAFT', 'Bulk importer must never bypass DRAFT governance');

  const target = await query<{ id: string }>(`SELECT id FROM learning_content_targets WHERE expected_concepts IS NOT NULL AND expected_concepts > 0 AND target_status <> 'LEARNER_READY' ORDER BY created_at LIMIT 1`);
  if (target.rowCount) {
    await expectReject(() => updateGovernedContentTarget(target.rows[0].id, { targetStatus: 'LEARNER_READY' }), 'Target cannot become LEARNER_READY');
  }

  const filters = await getPublicLearningFilterOptions();
  assert(Array.isArray(filters.grades) && filters.grades.length === 16, 'Public Learn must expose all 16 canonical grades');
  assert(filters.languages.length === 2, 'Public Learn must expose exactly two content languages');
  assert(filters.languages.some((language: { code: string }) => language.code === 'en') && filters.languages.some((language: { code: string }) => language.code === 'hi'), 'Public Learn content languages must be English and Hindi only');

  console.log('CONTENT PLATFORM 3.0 CERTIFIED');
  console.log('Canonical grades: 16; English + Hindi only; Nursery-Class 12 production denominator active.');
  console.log('DRAFT-first Resource, Question, Assessment and bilingual bulk importer certified.');
  console.log('Canonical Resource/Question/Assessment grade mappings certified.');
  console.log('Canonical Nursery discovery certified across Public Learn and Student Learn.');
}

main().then(() => process.exit(0)).catch((error) => {
  console.error('CONTENT PLATFORM 3.0 CERTIFICATION FAILED:', error instanceof Error ? error.message : error);
  process.exit(1);
});
