import { randomUUID } from 'node:crypto';
import type { QueryResultRow } from 'pg';
import type { UUID } from '@vidyasetu/contracts';
import { query, transaction } from '../config/db';
import type { CreateExamInput } from './competition.service';
import * as academicCompetitionService from './academicCompetition.service';
import * as studentService from './student.service';

interface ExamAdminRow extends QueryResultRow {
  id: UUID;
  title: string;
  title_hi: string | null;
  public_slug: string | null;
  school_id: UUID | null;
  type: string;
  status: string;
  start_time: string | Date;
  end_time: string | Date;
  registration_start: string | Date | null;
  registration_end: string | Date | null;
  results_at: string | Date | null;
  certificate_enabled: boolean;
  learning_feedback_enabled: boolean;
  leaderboard_public: boolean;
}
interface ReadinessRow extends QueryResultRow {
  total_questions: number;
  bilingual_questions: number;
  mapped_questions: number;
  governed_questions: number;
}
interface IdRow extends QueryResultRow { id: UUID; }
interface LearningQuestionRow extends QueryResultRow {
  id: UUID;
  public_code: string;
  prompt: string;
  prompt_hi: string;
  explanation: string | null;
  explanation_hi: string | null;
  correct_option: string;
  difficulty: string;
  subject_code: string | null;
  learning_outcome_code: string | null;
  misconception_code: string | null;
  concept_id: UUID;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  option_a_hi: string;
  option_b_hi: string;
  option_c_hi: string;
  option_d_hi: string;
}
interface RewardRow extends QueryResultRow {
  student_id: UUID;
  rank_overall: number | string;
  percentile: number | string;
}
interface CountRow extends QueryResultRow { count: number | string; }

function appError(message: string, statusCode: number): Error & { statusCode: number } {
  return Object.assign(new Error(message), { statusCode });
}

function slugify(value: string): string {
  const base = value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 130);
  return `${base || 'competition'}-${randomUUID().slice(0, 8)}`;
}

function validDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function difficultyForExam(value: string): 'EASY' | 'MEDIUM' | 'HARD' {
  if (['FOUNDATION', 'EASY'].includes(value)) return 'EASY';
  if (['HARD', 'CHALLENGE'].includes(value)) return 'HARD';
  return 'MEDIUM';
}

export async function competitionV2Available(): Promise<boolean> {
  const { rows: [row] } = await query<{ available: boolean } & QueryResultRow>(
    `SELECT EXISTS(
       SELECT 1 FROM information_schema.columns
       WHERE table_schema='public' AND table_name='exams' AND column_name='competition_format'
     ) AS available`,
  );
  return Boolean(row?.available);
}

export async function createPlatformCompetition(data: CreateExamInput, createdBy: UUID) {
  const start = validDate(data.startTime);
  const end = validDate(data.endTime);
  if (!start || !end || end <= start) throw appError('Competition end time must be after its start time', 400);
  const registrationStart = validDate(data.registrationStart || null);
  const registrationEnd = validDate(data.registrationEnd || null);
  if (registrationStart && registrationEnd && registrationEnd <= registrationStart) {
    throw appError('Registration end must be after registration start', 400);
  }
  if (registrationEnd && registrationEnd > start) {
    throw appError('Registration must close no later than competition start', 400);
  }
  const publicSlug = slugify(data.title);
  const { rows: [exam] } = await query(
    `INSERT INTO exams
       (title,title_hi,description,type,school_id,class_names,subject_codes,status,
        total_questions,duration_mins,marks_per_question,negative_marks,
        registration_start,registration_end,start_time,end_time,results_at,prize_pool,
        instructions,instructions_hi,banner_url,max_registrations,created_by,
        public_slug,competition_format,featured_public,require_registration,
        shuffle_questions,leaderboard_public,certificate_enabled,learning_feedback_enabled)
     VALUES($1,$2,$3,'OLYMPIAD',NULL,$4,$5,'DRAFT',$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,
            $16,$17,$18,$19,$20,$21,'OLYMPIAD',FALSE,TRUE,TRUE,TRUE,TRUE,TRUE)
     RETURNING *`,
    [
      data.title, data.titleHi || null, data.description || null, data.classNames || [], data.subjectCodes || [],
      data.totalQuestions || 30, data.durationMins || 60, data.marksPerQuestion ?? 2, data.negativeMarks ?? 0,
      data.registrationStart || null, data.registrationEnd || null, data.startTime, data.endTime,
      data.resultsAt || null, data.prizePool || 0, data.instructions || null, data.instructionsHi || null,
      data.bannerUrl || null, data.maxRegistrations || null, createdBy, publicSlug,
    ],
  );
  return exam;
}

export async function getCompetitionReadiness(examId: UUID) {
  const { rows: [exam] } = await query<ExamAdminRow>('SELECT * FROM exams WHERE id=$1', [examId]);
  if (!exam) throw appError('Competition not found', 404);
  const { rows: [stats] } = await query<ReadinessRow>(
    `SELECT COUNT(*)::int AS total_questions,
            COUNT(*) FILTER (
              WHERE question_hi IS NOT NULL AND BTRIM(question_hi)<>''
                AND option_a_hi IS NOT NULL AND BTRIM(option_a_hi)<>''
                AND option_b_hi IS NOT NULL AND BTRIM(option_b_hi)<>''
                AND option_c_hi IS NOT NULL AND BTRIM(option_c_hi)<>''
                AND option_d_hi IS NOT NULL AND BTRIM(option_d_hi)<>''
            )::int AS bilingual_questions,
            COUNT(*) FILTER (WHERE learning_concept_id IS NOT NULL)::int AS mapped_questions,
            COUNT(*) FILTER (WHERE learning_question_id IS NOT NULL)::int AS governed_questions
     FROM exam_questions WHERE exam_id=$1`,
    [examId],
  );
  const total = Number(stats?.total_questions || 0);
  const blockers: string[] = [];
  if (!exam.title_hi?.trim()) blockers.push('Hindi title is required for a platform competition.');
  if (!exam.public_slug) blockers.push('Stable public competition slug is missing.');
  if (total < 5) blockers.push('At least 5 governed questions are required before registration can open.');
  if (Number(stats?.bilingual_questions || 0) !== total) blockers.push('Every competition question and option must be available in English and Hindi.');
  if (Number(stats?.mapped_questions || 0) !== total) blockers.push('Every competition question must map to a canonical learning concept.');
  if (Number(stats?.governed_questions || 0) !== total) blockers.push('Platform competition questions must come from the governed Learning Question Bank.');
  const start = validDate(exam.start_time);
  const end = validDate(exam.end_time);
  if (!start || !end || end <= start) blockers.push('Competition start/end timing is invalid.');
  const regStart = validDate(exam.registration_start);
  const regEnd = validDate(exam.registration_end);
  if (regStart && regEnd && regEnd <= regStart) blockers.push('Registration timing is invalid.');
  if (regEnd && start && regEnd > start) blockers.push('Registration must close no later than competition start.');
  return {
    ready: blockers.length === 0,
    blockers,
    totalQuestions: total,
    bilingualQuestions: Number(stats?.bilingual_questions || 0),
    conceptMappedQuestions: Number(stats?.mapped_questions || 0),
    governedQuestions: Number(stats?.governed_questions || 0),
  };
}

export async function importLearningQuestions(examId: UUID, questionIds: UUID[]) {
  const uniqueIds = [...new Set(questionIds)];
  if (!uniqueIds.length) throw appError('Choose at least one Learning Question Bank item', 400);
  if (uniqueIds.length > 100) throw appError('A competition can import at most 100 questions at once', 400);

  return transaction(async (client) => {
    const { rows: [exam] } = await client.query<ExamAdminRow>('SELECT * FROM exams WHERE id=$1 FOR UPDATE', [examId]);
    if (!exam) throw appError('Competition not found', 404);
    if (exam.school_id || exam.type !== 'OLYMPIAD') throw appError('Learning Question Bank import is for platform competitions', 400);
    if (exam.status !== 'DRAFT') throw appError('Questions can only be changed while the competition is DRAFT', 409);

    const { rows } = await client.query<LearningQuestionRow>(
      `SELECT lq.id,lq.public_code,lq.prompt,lq.prompt_hi,lq.explanation,lq.explanation_hi,
              lq.correct_answer->>'option' AS correct_option,lq.difficulty::text,
              COALESCE(sub.code,lc.subject_code) AS subject_code,
              lq.learning_outcome_code,lq.misconception_code,lc.id AS concept_id,
              MAX(CASE WHEN lqo.option_key='A' THEN lqo.option_text END) AS option_a,
              MAX(CASE WHEN lqo.option_key='B' THEN lqo.option_text END) AS option_b,
              MAX(CASE WHEN lqo.option_key='C' THEN lqo.option_text END) AS option_c,
              MAX(CASE WHEN lqo.option_key='D' THEN lqo.option_text END) AS option_d,
              MAX(CASE WHEN lqo.option_key='A' THEN lqo.option_text_hi END) AS option_a_hi,
              MAX(CASE WHEN lqo.option_key='B' THEN lqo.option_text_hi END) AS option_b_hi,
              MAX(CASE WHEN lqo.option_key='C' THEN lqo.option_text_hi END) AS option_c_hi,
              MAX(CASE WHEN lqo.option_key='D' THEN lqo.option_text_hi END) AS option_d_hi
       FROM learning_questions lq
       LEFT JOIN subjects sub ON sub.id=lq.subject_id
       JOIN LATERAL (
         SELECT lqc.concept_id FROM learning_question_concepts lqc
         WHERE lqc.question_id=lq.id
         ORDER BY lqc.is_primary DESC,lqc.sort_order,lqc.concept_id LIMIT 1
       ) primary_concept ON TRUE
       JOIN learning_concepts lc ON lc.id=primary_concept.concept_id AND lc.is_active=TRUE
       LEFT JOIN learning_question_options lqo ON lqo.question_id=lq.id
       WHERE lq.id=ANY($1::uuid[]) AND lq.review_status='PUBLISHED' AND lq.question_type='MCQ_SINGLE'
       GROUP BY lq.id,sub.code,lc.id
       ORDER BY lq.public_code`,
      [uniqueIds],
    );
    if (rows.length !== uniqueIds.length) {
      throw appError('Every selected item must be a PUBLISHED, concept-mapped MCQ_SINGLE question', 400);
    }
    for (const row of rows) {
      if (!row.prompt_hi?.trim() || !row.option_a_hi?.trim() || !row.option_b_hi?.trim() || !row.option_c_hi?.trim() || !row.option_d_hi?.trim()) {
        throw appError(`Question ${row.public_code} is not fully bilingual and cannot enter a platform competition`, 400);
      }
      if (!['A', 'B', 'C', 'D'].includes(row.correct_option)) {
        throw appError(`Question ${row.public_code} has an unsupported correct-answer format`, 400);
      }
    }

    const { rows: [existingCount] } = await client.query<CountRow>('SELECT COUNT(*)::int AS count FROM exam_questions WHERE exam_id=$1', [examId]);
    let sortOrder = Number(existingCount?.count || 0);
    for (const row of rows) {
      sortOrder += 1;
      await client.query(
        `INSERT INTO exam_questions
           (exam_id,question_text,question_hi,option_a,option_b,option_c,option_d,
            option_a_hi,option_b_hi,option_c_hi,option_d_hi,correct_option,explanation,explanation_hi,
            subject_code,difficulty,sort_order,learning_question_id,learning_concept_id,
            learning_outcome_code,misconception_code)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
         ON CONFLICT (exam_id,learning_question_id) WHERE learning_question_id IS NOT NULL DO NOTHING`,
        [
          examId,row.prompt,row.prompt_hi,row.option_a,row.option_b,row.option_c,row.option_d,
          row.option_a_hi,row.option_b_hi,row.option_c_hi,row.option_d_hi,row.correct_option,
          row.explanation,row.explanation_hi,row.subject_code,difficultyForExam(row.difficulty),sortOrder,
          row.id,row.concept_id,row.learning_outcome_code,row.misconception_code,
        ],
      );
    }
    const { rows: [count] } = await client.query<CountRow>('SELECT COUNT(*)::int AS count FROM exam_questions WHERE exam_id=$1', [examId]);
    await client.query('UPDATE exams SET total_questions=$1 WHERE id=$2', [Number(count?.count || 0), examId]);
    return { imported: rows.length, totalQuestions: Number(count?.count || 0) };
  });
}

const TRANSITIONS: Record<string, string[]> = {
  DRAFT: ['REGISTRATION_OPEN', 'CANCELLED'],
  REGISTRATION_OPEN: ['REGISTRATION_CLOSED', 'LIVE', 'CANCELLED'],
  REGISTRATION_CLOSED: ['LIVE', 'CANCELLED'],
  LIVE: ['SCORING', 'CANCELLED'],
  SCORING: ['COMPLETED'],
};

async function hasXPEvent(studentId: UUID, examId: UUID, eventType: string): Promise<boolean> {
  const { rows: [row] } = await query<IdRow>(
    'SELECT id FROM xp_events WHERE student_id=$1 AND reference_id=$2 AND event_type=$3 LIMIT 1',
    [studentId, examId, eventType],
  );
  return Boolean(row);
}

async function awardCompetitionRewards(examId: UUID, certificateEnabled: boolean): Promise<void> {
  const { rows } = await query<RewardRow>(
    `SELECT student_id,rank_overall,percentile FROM exam_attempts
     WHERE exam_id=$1 AND status='SCORED' AND integrity_status='CLEAN'
     ORDER BY rank_overall`,
    [examId],
  );
  for (const row of rows) {
    const rank = Number(row.rank_overall);
    const percentile = Number(row.percentile || 0);
    const tiers: Array<'PARTICIPANT' | 'TOP_25' | 'TOP_10' | 'TOP_3' | 'WINNER'> = ['PARTICIPANT'];
    if (rank <= 25) tiers.push('TOP_25');
    if (rank <= 10) tiers.push('TOP_10');
    if (rank <= 3) tiers.push('TOP_3');
    if (rank === 1) tiers.push('WINNER');
    const certificateCode = certificateEnabled ? `VS-COMP-${String(examId).slice(0, 8).toUpperCase()}-${String(row.student_id).slice(0, 8).toUpperCase()}` : null;
    for (const tier of tiers) {
      await query(
        `INSERT INTO competition_achievements(exam_id,student_id,reward_tier,rank_overall,percentile,certificate_code)
         VALUES($1,$2,$3,$4,$5,$6)
         ON CONFLICT(exam_id,student_id,reward_tier) DO NOTHING`,
        [examId,row.student_id,tier,rank,percentile,tier === 'PARTICIPANT' ? certificateCode : null],
      );
    }
    if (!(await hasXPEvent(row.student_id, examId, 'EXAM_COMPLETE'))) {
      await studentService.awardXP(row.student_id, 'EXAM_COMPLETE', 60, examId, 'EXAM', 'Completed platform competition');
    }
    if (rank <= 10 && !(await hasXPEvent(row.student_id, examId, 'EXAM_TOP_10'))) {
      await studentService.awardXP(row.student_id, 'EXAM_TOP_10', 100, examId, 'EXAM', `Top ${rank} platform competition finish`);
    }
    if (rank <= 3 && !(await hasXPEvent(row.student_id, examId, 'EXAM_TOP_3'))) {
      await studentService.awardXP(row.student_id, 'EXAM_TOP_3', 200, examId, 'EXAM', `Top ${rank} platform competition finish`);
      await studentService.awardBadgeIfNotEarned(row.student_id, 'EXAM_TOPPER');
    }
  }
}

export async function updatePlatformCompetitionStatus(examId: UUID, nextStatus: string) {
  const { rows: [exam] } = await query<ExamAdminRow>('SELECT * FROM exams WHERE id=$1', [examId]);
  if (!exam) throw appError('Competition not found', 404);
  if (exam.school_id || exam.type !== 'OLYMPIAD') throw appError('Platform competition status cannot manage a School test', 400);
  if (!(TRANSITIONS[exam.status] || []).includes(nextStatus)) {
    throw appError(`Competition cannot move from ${exam.status} to ${nextStatus}`, 409);
  }
  if (exam.status === 'DRAFT' && nextStatus === 'REGISTRATION_OPEN') {
    const readiness = await getCompetitionReadiness(examId);
    if (!readiness.ready) throw appError(`Competition is not publication-ready: ${readiness.blockers.join(' ')}`, 400);
  }
  const now = new Date();
  if (nextStatus === 'LIVE') {
    if (now < new Date(exam.start_time) || now >= new Date(exam.end_time)) {
      throw appError('Competition can go LIVE only inside its scheduled competition window', 409);
    }
  }
  if (nextStatus === 'SCORING' && now < new Date(exam.end_time)) {
    throw appError('Competition cannot enter SCORING before the scheduled end time', 409);
  }
  if (nextStatus === 'COMPLETED') {
    if (exam.status !== 'SCORING') throw appError('Competition must pass through SCORING before results are released', 409);
    if (exam.results_at && now < new Date(exam.results_at)) throw appError('Configured result-release time has not arrived yet', 409);
    await academicCompetitionService.recomputeLeaderboard(examId);
    await awardCompetitionRewards(examId, exam.certificate_enabled);
    await query("UPDATE exam_attempts SET score_released_at=NOW() WHERE exam_id=$1 AND status='SCORED' AND integrity_status='CLEAN'", [examId]);
  }
  const { rows: [updated] } = await query(
    `UPDATE exams
     SET status=$1::exam_status,
         published_at=CASE
           WHEN $1::exam_status='REGISTRATION_OPEN'::exam_status THEN COALESCE(published_at,NOW())
           ELSE published_at
         END
     WHERE id=$2
     RETURNING *`,
    [nextStatus, examId],
  );
  return updated;
}

export async function listPublicCompetitions() {
  const { rows } = await query(
    `SELECT e.id,e.public_slug,e.title,e.title_hi,e.subtitle,e.subtitle_hi,e.description,e.competition_format,
            e.status,e.class_names,e.subject_codes,e.total_questions,e.duration_mins,e.marks_per_question,e.negative_marks,
            e.registration_start,e.registration_end,e.start_time,e.end_time,e.results_at,e.prize_pool,e.banner_url,
            e.featured_public,e.max_registrations,e.certificate_enabled,e.learning_feedback_enabled,
            COUNT(DISTINCT er.id)::int AS registration_count,COUNT(DISTINCT ea.id) FILTER(WHERE ea.status='SCORED')::int AS participant_count
     FROM exams e
     LEFT JOIN exam_registrations er ON er.exam_id=e.id
     LEFT JOIN exam_attempts ea ON ea.exam_id=e.id
     WHERE e.school_id IS NULL AND e.type='OLYMPIAD'
       AND e.status IN ('REGISTRATION_OPEN','REGISTRATION_CLOSED','LIVE','SCORING','COMPLETED')
     GROUP BY e.id
     ORDER BY e.featured_public DESC,
       CASE e.status WHEN 'LIVE' THEN 0 WHEN 'REGISTRATION_OPEN' THEN 1 WHEN 'REGISTRATION_CLOSED' THEN 2 WHEN 'SCORING' THEN 3 ELSE 4 END,
       e.start_time ASC
     LIMIT 50`,
  );
  return rows;
}

export async function listStudentCompetitions(studentId: UUID, className: string) {
  const { rows } = await query(
    `SELECT e.id,e.public_slug,e.title,e.title_hi,e.subtitle,e.subtitle_hi,e.description,e.competition_format,e.status,
            e.class_names,e.subject_codes,e.total_questions,e.duration_mins,e.marks_per_question,e.negative_marks,
            (e.total_questions*e.marks_per_question) AS max_marks,e.registration_start,e.registration_end,
            e.start_time,e.end_time,e.results_at,e.prize_pool,e.instructions,e.instructions_hi,e.banner_url,
            e.certificate_enabled,e.learning_feedback_enabled,er.id AS registration_id,er.registered_at,
            (er.id IS NOT NULL) AS registered,ea.id AS attempt_id,ea.status AS attempt_status,ea.started_at,ea.submitted_at,
            CASE WHEN e.status='COMPLETED' THEN ea.total_marks ELSE NULL END AS total_marks,
            CASE WHEN e.status='COMPLETED' THEN ea.percentile ELSE NULL END AS percentile,
            CASE WHEN e.status='COMPLETED' THEN ea.rank_school ELSE NULL END AS rank_school,
            CASE WHEN e.status='COMPLETED' THEN ea.rank_overall ELSE NULL END AS rank_overall,
            ca.certificate_code
     FROM exams e
     LEFT JOIN exam_registrations er ON er.exam_id=e.id AND er.student_id=$1
     LEFT JOIN exam_attempts ea ON ea.exam_id=e.id AND ea.student_id=$1
     LEFT JOIN competition_achievements ca ON ca.exam_id=e.id AND ca.student_id=$1 AND ca.reward_tier='PARTICIPANT'
     WHERE e.school_id IS NULL AND e.type='OLYMPIAD'
       AND e.status IN ('REGISTRATION_OPEN','REGISTRATION_CLOSED','LIVE','SCORING','COMPLETED')
       AND (cardinality(e.class_names)=0 OR $2=ANY(e.class_names))
     ORDER BY CASE e.status WHEN 'LIVE' THEN 0 WHEN 'REGISTRATION_OPEN' THEN 1 WHEN 'REGISTRATION_CLOSED' THEN 2 WHEN 'SCORING' THEN 3 ELSE 4 END,e.start_time ASC`,
    [studentId,className],
  );
  return rows;
}

export async function getPublicLeaderboard(examId: UUID, page = 1, limit = 50) {
  const safeLimit = Math.min(Math.max(limit || 50, 1), 100);
  const safePage = Math.max(page || 1, 1);
  const { rows: [exam] } = await query<ExamAdminRow>('SELECT * FROM exams WHERE id=$1', [examId]);
  if (!exam) throw appError('Competition not found', 404);
  if (exam.status !== 'COMPLETED' || !exam.leaderboard_public) throw appError('Leaderboard is available only after official results are released', 409);
  const { rows } = await query(
    `SELECT el.rank_overall AS rank,el.rank_school,el.total_marks AS score,el.percentile,
            split_part(u.name,' ',1) || CASE WHEN position(' ' in u.name)>0 THEN ' ' || left(split_part(u.name,' ',2),1) || '.' ELSE '' END AS name,
            COALESCE(sc.class_name,s.grade_level) AS class_name,sch.name AS school_name,sch.state
     FROM exam_leaderboard el
     JOIN students s ON s.id=el.student_id
     JOIN users u ON u.id=s.user_id
     LEFT JOIN school_classes sc ON sc.id=s.class_id
     LEFT JOIN schools sch ON sch.id=s.school_id
     JOIN exam_attempts ea ON ea.id=el.attempt_id AND ea.integrity_status='CLEAN'
     WHERE el.exam_id=$1
     ORDER BY el.rank_overall,el.total_marks DESC
     LIMIT $2 OFFSET $3`,
    [examId,safeLimit,(safePage-1)*safeLimit],
  );
  return rows;
}

export async function getStudentCompetitionResult(attemptId: UUID, studentId: UUID) {
  const { rows: [attempt] } = await query<QueryResultRow>(
    `SELECT ea.id,ea.exam_id,ea.status,ea.total_marks,ea.correct_count,ea.wrong_count,ea.skipped_count,
            ea.time_taken_secs,ea.percentile,ea.rank_school,ea.rank_overall,ea.integrity_status,
            e.title,e.title_hi,e.status AS exam_status,e.total_questions,e.marks_per_question,e.learning_feedback_enabled,
            ca.certificate_code
     FROM exam_attempts ea JOIN exams e ON e.id=ea.exam_id
     LEFT JOIN competition_achievements ca ON ca.exam_id=e.id AND ca.student_id=ea.student_id AND ca.reward_tier='PARTICIPANT'
     WHERE ea.id=$1 AND ea.student_id=$2`,
    [attemptId,studentId],
  );
  if (!attempt) throw appError('Competition attempt not found', 404);
  if (attempt.exam_status !== 'COMPLETED') {
    return { released: false, attemptId, examId: attempt.exam_id, status: attempt.status, message: 'Your attempt is safely submitted. Score, rank and learning feedback will appear after official results are released.' };
  }
  const { rows: concepts } = await query<QueryResultRow>(
    `SELECT cacr.concept_id,lc.code,lc.name,lc.name_hi,cacr.question_count,cacr.correct_count,cacr.wrong_count,
            cacr.skipped_count,cacr.accuracy_pct::float,cacr.needs_review,
            rec.public_slug AS recommended_resource_slug,rec.title AS recommended_resource_title
     FROM competition_attempt_concept_results cacr
     JOIN learning_concepts lc ON lc.id=cacr.concept_id
     LEFT JOIN LATERAL (
       SELECT lr.public_slug,lr.title FROM learning_resource_concepts lrc
       JOIN learning_resources lr ON lr.id=lrc.resource_id
       WHERE lrc.concept_id=cacr.concept_id AND lr.review_status='PUBLISHED' AND lr.public_slug IS NOT NULL
       ORDER BY CASE lrc.journey_stage WHEN 'REVISE' THEN 0 WHEN 'UNDERSTAND' THEN 1 WHEN 'DO' THEN 2 ELSE 3 END,
                lr.published_at DESC NULLS LAST LIMIT 1
     ) rec ON TRUE
     WHERE cacr.attempt_id=$1 ORDER BY cacr.needs_review DESC,cacr.accuracy_pct,lc.code`,
    [attemptId],
  );
  const { rows: review } = attempt.learning_feedback_enabled ? await query<QueryResultRow>(
    `SELECT eq.id,eq.question_text,eq.question_hi,er.selected_option,eq.correct_option,er.is_correct,
            eq.explanation,eq.explanation_hi,eq.learning_concept_id,lc.code AS concept_code,lc.name AS concept_name
     FROM exam_responses er JOIN exam_questions eq ON eq.id=er.question_id
     LEFT JOIN learning_concepts lc ON lc.id=eq.learning_concept_id
     WHERE er.attempt_id=$1 ORDER BY eq.sort_order,eq.created_at`,
    [attemptId],
  ) : { rows: [] as QueryResultRow[] };
  return {
    released: true,
    attemptId,
    examId: attempt.exam_id,
    title: attempt.title,
    titleHi: attempt.title_hi,
    score: Number(attempt.total_marks || 0),
    maxMarks: Number(attempt.total_questions || 0) * Number(attempt.marks_per_question || 0),
    correctCount: Number(attempt.correct_count || 0),
    wrongCount: Number(attempt.wrong_count || 0),
    skippedCount: Number(attempt.skipped_count || 0),
    timeTakenSecs: Number(attempt.time_taken_secs || 0),
    percentile: attempt.percentile == null ? null : Number(attempt.percentile),
    rankSchool: attempt.rank_school == null ? null : Number(attempt.rank_school),
    rankOverall: attempt.rank_overall == null ? null : Number(attempt.rank_overall),
    integrityStatus: attempt.integrity_status,
    certificateCode: attempt.certificate_code || null,
    conceptFeedback: concepts,
    questionReview: review,
  };
}

export async function summarizeAttemptConcepts(attemptId: UUID): Promise<void> {
  await query(
    `INSERT INTO competition_attempt_concept_results
       (attempt_id,concept_id,question_count,correct_count,wrong_count,skipped_count,accuracy_pct,needs_review)
     SELECT er.attempt_id,eq.learning_concept_id,COUNT(*)::int,
            COUNT(*) FILTER(WHERE er.is_correct=TRUE)::int,
            COUNT(*) FILTER(WHERE er.is_correct=FALSE)::int,
            COUNT(*) FILTER(WHERE er.is_correct IS NULL)::int,
            ROUND((100.0*COUNT(*) FILTER(WHERE er.is_correct=TRUE)/NULLIF(COUNT(*),0))::numeric,2),
            (100.0*COUNT(*) FILTER(WHERE er.is_correct=TRUE)/NULLIF(COUNT(*),0)) < 60
     FROM exam_responses er JOIN exam_questions eq ON eq.id=er.question_id
     WHERE er.attempt_id=$1 AND eq.learning_concept_id IS NOT NULL
     GROUP BY er.attempt_id,eq.learning_concept_id
     ON CONFLICT(attempt_id,concept_id) DO UPDATE SET
       question_count=EXCLUDED.question_count,correct_count=EXCLUDED.correct_count,wrong_count=EXCLUDED.wrong_count,
       skipped_count=EXCLUDED.skipped_count,accuracy_pct=EXCLUDED.accuracy_pct,needs_review=EXCLUDED.needs_review,updated_at=NOW()`,
    [attemptId],
  );
}
