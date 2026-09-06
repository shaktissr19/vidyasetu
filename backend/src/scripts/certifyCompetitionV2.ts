import 'dotenv/config';
import type { QueryResultRow } from 'pg';
import type { UUID } from '@vidyasetu/contracts';
import { query } from '../config/db';
import {
  createPlatformCompetition,
  getCompetitionReadiness,
  getPublicLeaderboard,
  getStudentCompetitionResult,
  importLearningQuestions,
  updatePlatformCompetitionStatus,
} from '../services/competitionPlatform.service';
import { register, startAttempt, submitAttempt } from '../services/studentExam.service';

interface AdminRow extends QueryResultRow { id: UUID; }
interface ConceptRow extends QueryResultRow { id: UUID; subject_id: UUID | null; subject_code: string; }
interface SourceRow extends QueryResultRow { id: UUID; }
interface QuestionRow extends QueryResultRow { id: UUID; correct_option: string; }
interface AttemptRow extends QueryResultRow {
  id: UUID;
  school_id: UUID | null;
  deadline_at: string | Date | null;
  question_order: UUID[];
  integrity_status: string;
  rank_overall: number | null;
}
interface CountRow extends QueryResultRow { count: number | string; }
interface UserStudentRow extends QueryResultRow { user_id: UUID; student_id: UUID; }

const STUDENT_ONE_USER = '8f000000-0000-0000-0000-000000000001';
const STUDENT_ONE = '8f100000-0000-0000-0000-000000000001';
const STUDENT_TWO_USER = '8f000000-0000-0000-0000-000000000002';
const STUDENT_TWO = '8f100000-0000-0000-0000-000000000002';
const FORCE_CODE = 'C8-SCI-05-C01';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function expectStatus(work: () => Promise<unknown>, statusCode: number, label: string): Promise<void> {
  try {
    await work();
  } catch (error: unknown) {
    if ((error as { statusCode?: number })?.statusCode === statusCode) return;
    throw error;
  }
  throw new Error(`${label}: expected status ${statusCode}`);
}

async function createIndependentLearner(userId: UUID, studentId: UUID, mobile: string, username: string, name: string): Promise<UserStudentRow> {
  await query(
    `INSERT INTO users(id,mobile,name,role,status,language,username)
     VALUES($1,$2,$3,'STUDENT','ACTIVE','en',$4)
     ON CONFLICT(id) DO UPDATE SET mobile=EXCLUDED.mobile,name=EXCLUDED.name,role='STUDENT',status='ACTIVE',username=EXCLUDED.username`,
    [userId,mobile,name,username],
  );
  await query(
    `INSERT INTO students(id,user_id,school_id,class_id,academic_year,status,grade_level,school_link_status,student_code)
     VALUES($1,$2,NULL,NULL,'2026-27','ACTIVE','8','NOT_REQUESTED',$3)
     ON CONFLICT(id) DO UPDATE SET school_id=NULL,class_id=NULL,status='ACTIVE',grade_level='8',school_link_status='NOT_REQUESTED'`,
    [studentId,userId,`VS26-COMP-${studentId.slice(-4)}`],
  );
  return { user_id: userId, student_id: studentId };
}

async function seedGovernedQuestions(concept: ConceptRow, source: SourceRow): Promise<QuestionRow[]> {
  await query(`DELETE FROM learning_questions WHERE public_code LIKE 'VS-COMP-V2-CERT-%'`);
  const rows: QuestionRow[] = [];
  for (let index = 1; index <= 5; index += 1) {
    const code = `VS-COMP-V2-CERT-${String(index).padStart(2, '0')}`;
    const { rows: [question] } = await query<QuestionRow>(
      `INSERT INTO learning_questions
         (public_code,prompt,prompt_hi,question_type,difficulty,explanation,explanation_hi,correct_answer,
          marks,negative_marks,class_min,class_max,subject_id,source_id,licence,visibility,review_status,
          cognitive_skill,learning_outcome_code,misconception_code,published_at)
       VALUES($1,$2,$3,'MCQ_SINGLE',$4,$5,$6,'{"option":"A"}'::jsonb,1,0,8,8,$7,$8,
              'VIDYASETU_ORIGINAL','REGISTERED','PUBLISHED','APPLY',$9,$10,NOW())
       RETURNING id,correct_answer->>'option' AS correct_option`,
      [
        code,
        `Competition certification question ${index}: Which option demonstrates the mapped Force concept?`,
        `प्रतियोगिता प्रमाणन प्रश्न ${index}: कौन सा विकल्प मैप किए गए बल कॉन्सेप्ट को दर्शाता है?`,
        index <= 2 ? 'EASY' : index <= 4 ? 'MEDIUM' : 'HARD',
        'Option A is the governed certification answer. The explanation is released only after official results.',
        'विकल्प A प्रमाणन का सही उत्तर है। व्याख्या केवल आधिकारिक परिणाम के बाद दिखाई जाती है।',
        concept.subject_id,
        source.id,
        `COMP-FORCE-${index}`,
        index === 5 ? 'COMP-MISCONCEPTION-FORCE' : null,
      ],
    );
    assert(question, `Could not create governed question ${index}`);
    const options = [
      ['A', `Correct force example ${index}`, `सही बल उदाहरण ${index}`],
      ['B', `Distractor B ${index}`, `विकल्प B ${index}`],
      ['C', `Distractor C ${index}`, `विकल्प C ${index}`],
      ['D', `Distractor D ${index}`, `विकल्प D ${index}`],
    ];
    for (let optionIndex = 0; optionIndex < options.length; optionIndex += 1) {
      const [key,text,textHi] = options[optionIndex]!;
      await query(
        `INSERT INTO learning_question_options(question_id,option_key,option_text,option_text_hi,sort_order)
         VALUES($1,$2,$3,$4,$5)`,
        [question.id,key,text,textHi,optionIndex + 1],
      );
    }
    await query(
      `INSERT INTO learning_question_concepts(question_id,concept_id,is_primary,sort_order)
       VALUES($1,$2,TRUE,1)`,
      [question.id,concept.id],
    );
    rows.push(question);
  }
  return rows;
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('Competition 2.0 certification is test-only and requires NODE_ENV=test');
  }

  const { rows: [admin] } = await query<AdminRow>("SELECT id FROM users WHERE role='SUPER_ADMIN' AND status='ACTIVE' ORDER BY id LIMIT 1");
  assert(admin, 'No active SUPER_ADMIN fixture available');
  const { rows: [concept] } = await query<ConceptRow>(
    `SELECT id,subject_id,subject_code FROM learning_concepts WHERE code=$1 AND is_active=TRUE`,
    [FORCE_CODE],
  );
  assert(concept, 'Canonical Force concept is missing; synchronize the concept registry first');
  const { rows: [source] } = await query<SourceRow>("SELECT id FROM learning_content_sources WHERE code='VIDYASETU_ORIGINAL'");
  assert(source, 'VIDYASETU_ORIGINAL learning source is missing');

  const learnerOne = await createIndependentLearner(STUDENT_ONE_USER, STUDENT_ONE, '919900001001', 'competition.cert.one', 'Competition Learner One');
  const learnerTwo = await createIndependentLearner(STUDENT_TWO_USER, STUDENT_TWO, '919900001002', 'competition.cert.two', 'Competition Learner Two');
  const governedQuestions = await seedGovernedQuestions(concept, source);

  const now = Date.now();
  const competition = await createPlatformCompetition({
    title: 'VidyaSetu Competition 2.0 Certification',
    titleHi: 'विद्यासेतु प्रतियोगिता 2.0 प्रमाणन',
    classNames: ['8'],
    subjectCodes: [concept.subject_code],
    totalQuestions: 5,
    durationMins: 20,
    marksPerQuestion: 2,
    negativeMarks: 0,
    registrationStart: new Date(now - 10 * 60_000).toISOString(),
    registrationEnd: new Date(now + 20 * 60_000).toISOString(),
    startTime: new Date(now + 30 * 60_000).toISOString(),
    endTime: new Date(now + 90 * 60_000).toISOString(),
    resultsAt: new Date(now + 100 * 60_000).toISOString(),
    instructions: 'Answer independently. Official score and explanations are released only after the competition closes.',
    instructionsHi: 'स्वतंत्र रूप से उत्तर दें। आधिकारिक स्कोर और व्याख्या प्रतियोगिता बंद होने के बाद ही जारी होगी।',
  }, admin.id);
  assert(competition?.id, 'Platform competition was not created');
  assert(competition.school_id == null, 'Platform competition unexpectedly belongs to a School');
  assert(competition.status === 'DRAFT', 'Platform competition did not start as DRAFT');

  const emptyReadiness = await getCompetitionReadiness(competition.id);
  assert(!emptyReadiness.ready, 'Empty competition incorrectly passed publication readiness');
  await expectStatus(
    () => updatePlatformCompetitionStatus(competition.id, 'REGISTRATION_OPEN'),
    400,
    'Open registration without governed questions',
  );

  const imported = await importLearningQuestions(competition.id, governedQuestions.map((item) => item.id));
  assert(imported.imported === 5, 'Governed Question Bank import did not import five questions');
  const ready = await getCompetitionReadiness(competition.id);
  assert(ready.ready, `Competition readiness should pass after governed import: ${ready.blockers.join(' ')}`);
  assert(ready.bilingualQuestions === 5 && ready.conceptMappedQuestions === 5 && ready.governedQuestions === 5,
    'Competition readiness counts are not fully bilingual/concept-mapped/governed');

  await updatePlatformCompetitionStatus(competition.id, 'REGISTRATION_OPEN');
  const registrationOne = await register(competition.id, learnerOne.student_id);
  const registrationTwo = await register(competition.id, learnerTwo.student_id);
  assert(registrationOne.registered && registrationTwo.registered, 'Independent learners could not register');
  const { rows: registrations } = await query<QueryResultRow>(
    'SELECT school_id FROM exam_registrations WHERE exam_id=$1 ORDER BY student_id',
    [competition.id],
  );
  assert(registrations.length === 2 && registrations.every((row) => row.school_id == null),
    'Independent learner registration incorrectly requires a School');

  await updatePlatformCompetitionStatus(competition.id, 'REGISTRATION_CLOSED');
  await expectStatus(
    () => updatePlatformCompetitionStatus(competition.id, 'LIVE'),
    409,
    'Go LIVE before scheduled window',
  );
  await query(
    `UPDATE exams SET start_time=NOW()-INTERVAL '1 minute',end_time=NOW()+INTERVAL '30 minutes',results_at=NOW()+INTERVAL '40 minutes'
     WHERE id=$1`,
    [competition.id],
  );
  await updatePlatformCompetitionStatus(competition.id, 'LIVE');

  const attemptOne = await startAttempt(competition.id, learnerOne.student_id);
  const attemptTwo = await startAttempt(competition.id, learnerTwo.student_id);
  assert(attemptOne.questions.length === 5 && attemptTwo.questions.length === 5, 'Competition attempt did not deliver five questions');
  assert(!('correct_option' in attemptOne.questions[0]!), 'Correct answer leaked in active competition payload');
  const { rows: [storedAttemptOne] } = await query<AttemptRow>('SELECT * FROM exam_attempts WHERE id=$1', [attemptOne.attemptId]);
  assert(storedAttemptOne?.deadline_at, 'Server deadline was not persisted');
  assert(Array.isArray(storedAttemptOne?.question_order) && storedAttemptOne.question_order.length === 5,
    'Per-attempt question order snapshot was not persisted');

  await expectStatus(
    () => submitAttempt(attemptOne.attemptId, learnerOne.student_id, [{ questionId: '00000000-0000-0000-0000-000000000099', selectedOption: 'A' }]),
    400,
    'Question outside competition submission',
  );
  const cleanSubmission = await submitAttempt(
    attemptOne.attemptId,
    learnerOne.student_id,
    attemptOne.questions.map((item) => ({ questionId: item.id, selectedOption: 'A' })),
  );
  assert(cleanSubmission.released === false, 'Platform score leaked before official result release');
  assert(cleanSubmission.score == null && cleanSubmission.rank_overall == null, 'Score or rank leaked before official result release');
  assert(cleanSubmission.integrityStatus === 'CLEAN', 'On-time attempt was not CLEAN');

  await query(`UPDATE exam_attempts SET deadline_at=NOW()-INTERVAL '90 seconds' WHERE id=$1`, [attemptTwo.attemptId]);
  const flaggedSubmission = await submitAttempt(
    attemptTwo.attemptId,
    learnerTwo.student_id,
    attemptTwo.questions.map((item, index) => ({ questionId: item.id, selectedOption: index === 0 ? 'A' : 'B' })),
  );
  assert(flaggedSubmission.released === false, 'Flagged attempt score leaked before results');
  assert(flaggedSubmission.integrityStatus === 'FLAGGED', 'Late attempt did not create an integrity flag');

  await expectStatus(
    () => getPublicLeaderboard(competition.id),
    409,
    'Leaderboard before official release',
  );

  const { rows: [masteryBefore] } = await query<CountRow>(
    `SELECT COUNT(*)::int AS count FROM student_concept_progress WHERE student_id=$1 AND concept_id=$2`,
    [learnerOne.student_id,concept.id],
  );
  const { rows: [diagnosticBefore] } = await query<CountRow>(
    `SELECT COUNT(*)::int AS count FROM student_concept_intelligence WHERE student_id=$1 AND concept_id=$2`,
    [learnerOne.student_id,concept.id],
  );

  await expectStatus(
    () => updatePlatformCompetitionStatus(competition.id, 'SCORING'),
    409,
    'Enter SCORING before end time',
  );
  await query(`UPDATE exams SET end_time=NOW()-INTERVAL '1 minute',results_at=NOW()-INTERVAL '1 second' WHERE id=$1`, [competition.id]);
  await updatePlatformCompetitionStatus(competition.id, 'SCORING');
  await updatePlatformCompetitionStatus(competition.id, 'COMPLETED');

  const leaderboard = await getPublicLeaderboard(competition.id);
  assert(leaderboard.length === 1, 'Flagged attempt was not excluded from official leaderboard');
  assert(Number(leaderboard[0]?.rank) === 1, 'Clean learner did not receive official rank 1');
  assert(leaderboard[0]?.name !== 'Competition Learner One', 'Public leaderboard exposed the learner full name');

  const cleanResult = await getStudentCompetitionResult(attemptOne.attemptId, learnerOne.student_id);
  assert(cleanResult.released === true, 'Clean official result was not released after COMPLETED');
  assert(Number(cleanResult.score) === 10, 'Clean official score is incorrect');
  assert(Number(cleanResult.rankOverall) === 1, 'Clean official rank is incorrect');
  assert(Array.isArray(cleanResult.conceptFeedback) && cleanResult.conceptFeedback.length === 1,
    'Competition did not generate concept-level learning feedback');
  assert(Array.isArray(cleanResult.questionReview) && cleanResult.questionReview.length === 5,
    'Correct answers/explanations were not released after official completion');
  assert(Boolean(cleanResult.certificateCode), 'Participant achievement certificate code was not created');

  await expectStatus(
    () => getStudentCompetitionResult(attemptOne.attemptId, learnerTwo.student_id),
    404,
    'Cross-Student result isolation',
  );
  const flaggedResult = await getStudentCompetitionResult(attemptTwo.attemptId, learnerTwo.student_id);
  assert(flaggedResult.released === true, 'Flagged learner cannot view own released score');
  assert(flaggedResult.integrityStatus === 'FLAGGED', 'Flagged result lost its integrity status');
  assert(flaggedResult.rankOverall == null, 'Flagged attempt received an official public rank');

  const { rows: [flaggedAchievements] } = await query<CountRow>(
    'SELECT COUNT(*)::int AS count FROM competition_achievements WHERE exam_id=$1 AND student_id=$2',
    [competition.id,learnerTwo.student_id],
  );
  assert(Number(flaggedAchievements?.count || 0) === 0, 'Flagged learner received automatic Competition rewards');
  const { rows: [cleanAchievements] } = await query<CountRow>(
    'SELECT COUNT(*)::int AS count FROM competition_achievements WHERE exam_id=$1 AND student_id=$2',
    [competition.id,learnerOne.student_id],
  );
  assert(Number(cleanAchievements?.count || 0) >= 2, 'Clean winner did not receive competition achievements');

  const { rows: [xpBeforeRepeat] } = await query<CountRow>(
    'SELECT COUNT(*)::int AS count FROM xp_events WHERE student_id=$1 AND reference_id=$2',
    [learnerOne.student_id,competition.id],
  );
  await query(`UPDATE exams SET status='SCORING' WHERE id=$1`, [competition.id]);
  await updatePlatformCompetitionStatus(competition.id, 'COMPLETED');
  const { rows: [xpAfterRepeat] } = await query<CountRow>(
    'SELECT COUNT(*)::int AS count FROM xp_events WHERE student_id=$1 AND reference_id=$2',
    [learnerOne.student_id,competition.id],
  );
  assert(Number(xpBeforeRepeat?.count || 0) === Number(xpAfterRepeat?.count || 0), 'Competition reward finalization duplicated XP');

  const { rows: [masteryAfter] } = await query<CountRow>(
    `SELECT COUNT(*)::int AS count FROM student_concept_progress WHERE student_id=$1 AND concept_id=$2`,
    [learnerOne.student_id,concept.id],
  );
  const { rows: [diagnosticAfter] } = await query<CountRow>(
    `SELECT COUNT(*)::int AS count FROM student_concept_intelligence WHERE student_id=$1 AND concept_id=$2`,
    [learnerOne.student_id,concept.id],
  );
  assert(Number(masteryBefore?.count || 0) === Number(masteryAfter?.count || 0), 'Competition score directly changed canonical mastery state');
  assert(Number(diagnosticBefore?.count || 0) === Number(diagnosticAfter?.count || 0), 'Competition score directly changed Diagnostic Intelligence state');

  const { rows: [cleanAttempt] } = await query<AttemptRow>('SELECT * FROM exam_attempts WHERE id=$1', [attemptOne.attemptId]);
  const { rows: [flaggedAttempt] } = await query<AttemptRow>('SELECT * FROM exam_attempts WHERE id=$1', [attemptTwo.attemptId]);
  assert(cleanAttempt?.integrity_status === 'CLEAN', 'Clean attempt integrity state changed unexpectedly');
  assert(flaggedAttempt?.integrity_status === 'FLAGGED', 'Flagged attempt integrity state changed unexpectedly');

  console.log('COMPETITION 2.0 CERTIFIED');
  console.log(`Competition: ${competition.id}`);
  console.log(`Clean learner: ${learnerOne.student_id}; official rank #${cleanResult.rankOverall}`);
  console.log(`Flagged learner: ${learnerTwo.student_id}; excluded from official leaderboard/rewards`);
  console.log('Competition → concept feedback → Learning loop certified without rewriting mastery/diagnostic truth.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exit(1);
});
