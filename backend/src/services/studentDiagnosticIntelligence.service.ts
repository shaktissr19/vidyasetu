import type { PoolClient, QueryResultRow } from 'pg';
import type { UUID } from '@vidyasetu/contracts';
import { query } from '../config/db';

export type DiagnosticConfidence = 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH';
export type RetentionStatus = 'NOT_ASSESSED' | 'ACTIVE_LEARNING' | 'STABLE' | 'REVIEW_SOON' | 'REVIEW_DUE';
export type MisconceptionState = 'SUSPECTED' | 'ACTIVE' | 'RESOLVED';

interface EvidenceRow extends QueryResultRow {
  evidence_role: 'DIAGNOSTIC' | 'PRACTICE' | 'MASTERY';
  is_correct: boolean | null;
  answer_was_skipped: boolean;
  difficulty: string;
  cognitive_skill: string;
  misconception_code: string | null;
  evidence_weight: number | string;
  occurred_at: Date | string;
}

interface MasteryRow extends QueryResultRow {
  mastered_at: Date | string | null;
}

interface ConceptProfileRow extends QueryResultRow {
  concept_id: UUID;
  code: string;
  name: string;
  name_hi: string | null;
  subject_code: string;
  subject_name: string | null;
  chapter_title: string | null;
  proficiency_score: number | string;
  confidence_score: number | string;
  confidence_level: DiagnosticConfidence;
  evidence_count: number;
  correct_evidence_count: number;
  diagnostic_count: number;
  practice_count: number;
  mastery_count: number;
  retention_status: RetentionStatus;
  next_review_at: Date | string | null;
  dominant_misconception_code: string | null;
  last_evidence_at: Date | string | null;
  last_mastery_at: Date | string | null;
}

interface MisconceptionProfileRow extends QueryResultRow {
  concept_id: UUID;
  misconception_code: string;
  state: MisconceptionState;
  wrong_count: number;
  correct_count: number;
  first_seen_at: Date | string | null;
  last_seen_at: Date | string | null;
  resolved_at: Date | string | null;
}

function recencyFactor(value: Date | string): number {
  const ageMs = Date.now() - new Date(value).getTime();
  const ageDays = Math.max(0, ageMs / 86_400_000);
  if (ageDays <= 14) return 1;
  if (ageDays <= 30) return 0.92;
  if (ageDays <= 90) return 0.82;
  return 0.72;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function confidenceLevel(score: number, evidenceCount: number): DiagnosticConfidence {
  if (evidenceCount === 0) return 'NONE';
  if (score < 45) return 'LOW';
  if (score < 75) return 'MEDIUM';
  return 'HIGH';
}

function retention(
  evidenceCount: number,
  proficiency: number,
  confidence: number,
  masteredAt: Date | string | null,
): { status: RetentionStatus; nextReviewAt: Date | null } {
  if (evidenceCount === 0) return { status: 'NOT_ASSESSED', nextReviewAt: null };
  if (!masteredAt) return { status: 'ACTIVE_LEARNING', nextReviewAt: null };

  const mastered = new Date(masteredAt);
  const intervalDays = confidence >= 75 && proficiency >= 85 ? 30 : confidence >= 50 && proficiency >= 70 ? 14 : 7;
  const nextReviewAt = new Date(mastered.getTime() + intervalDays * 86_400_000);
  const remainingDays = (nextReviewAt.getTime() - Date.now()) / 86_400_000;
  if (remainingDays < 0) return { status: 'REVIEW_DUE', nextReviewAt };
  if (remainingDays <= 3) return { status: 'REVIEW_SOON', nextReviewAt };
  return { status: 'STABLE', nextReviewAt };
}

/**
 * Persist reviewed question metadata as learner evidence inside the same
 * transaction that grades the attempt, then rebuild the affected concept
 * intelligence deterministically. Safe to call repeatedly for one attempt.
 */
export async function captureAttemptEvidenceAndRefresh(
  client: PoolClient,
  studentId: UUID,
  attemptId: UUID,
  assessmentId: UUID,
): Promise<void> {
  await client.query(
    `INSERT INTO student_learning_evidence
       (student_id,attempt_id,assessment_id,question_id,concept_id,evidence_role,
        is_correct,answer_was_skipped,difficulty,cognitive_skill,skill_code,
        learning_outcome_code,misconception_code,evidence_weight,score_signal,occurred_at)
     SELECT $1,sla.id,sla.assessment_id,slaa.question_id,lqc.concept_id,
            COALESCE(lac.evidence_role,
              CASE WHEN la.assessment_type::text='DIAGNOSTIC' THEN 'DIAGNOSTIC' ELSE 'PRACTICE' END),
            slaa.is_correct,(slaa.is_correct IS NULL),lq.difficulty,lq.cognitive_skill,
            lq.skill_code,lq.learning_outcome_code,lq.misconception_code,
            (
              CASE COALESCE(lac.evidence_role,
                CASE WHEN la.assessment_type::text='DIAGNOSTIC' THEN 'DIAGNOSTIC' ELSE 'PRACTICE' END)
                WHEN 'MASTERY' THEN 1.25 WHEN 'DIAGNOSTIC' THEN 0.95 ELSE 1.0 END
              * CASE lq.difficulty::text
                  WHEN 'FOUNDATION' THEN 0.80 WHEN 'EASY' THEN 0.90 WHEN 'MEDIUM' THEN 1.00
                  WHEN 'HARD' THEN 1.10 WHEN 'CHALLENGE' THEN 1.20 ELSE 1.00 END
              * CASE lq.cognitive_skill::text
                  WHEN 'REMEMBER' THEN 0.85 WHEN 'UNDERSTAND' THEN 0.90 WHEN 'APPLY' THEN 1.00
                  WHEN 'ANALYSE' THEN 1.10 WHEN 'EVALUATE' THEN 1.15 WHEN 'CREATE' THEN 1.20 ELSE 1.00 END
            )::numeric(6,3),
            CASE WHEN slaa.is_correct IS NULL THEN NULL WHEN slaa.is_correct THEN 100 ELSE 0 END,
            COALESCE(sla.submitted_at,NOW())
     FROM student_learning_attempts sla
     JOIN learning_assessments la ON la.id=sla.assessment_id
     JOIN student_learning_answers slaa ON slaa.attempt_id=sla.id
     JOIN learning_questions lq ON lq.id=slaa.question_id
     JOIN learning_question_concepts lqc ON lqc.question_id=lq.id
     LEFT JOIN learning_assessment_concepts lac
       ON lac.assessment_id=sla.assessment_id AND lac.concept_id=lqc.concept_id
     WHERE sla.id=$2 AND sla.assessment_id=$3 AND sla.student_id=$1 AND sla.status='GRADED'
     ON CONFLICT (student_id,attempt_id,question_id,concept_id) DO NOTHING`,
    [studentId, attemptId, assessmentId],
  );

  const { rows: concepts } = await client.query<{ concept_id: UUID }>(
    `SELECT DISTINCT concept_id FROM student_learning_evidence
     WHERE student_id=$1 AND attempt_id=$2`,
    [studentId, attemptId],
  );
  for (const concept of concepts) {
    await rebuildConceptIntelligence(client, studentId, concept.concept_id);
  }
}

async function rebuildConceptIntelligence(client: PoolClient, studentId: UUID, conceptId: UUID): Promise<void> {
  const { rows } = await client.query<EvidenceRow>(
    `SELECT evidence_role,is_correct,answer_was_skipped,difficulty::text,cognitive_skill::text,
            misconception_code,evidence_weight::float,occurred_at
     FROM student_learning_evidence
     WHERE student_id=$1 AND concept_id=$2
     ORDER BY occurred_at`,
    [studentId, conceptId],
  );

  const answered = rows.filter((row) => !row.answer_was_skipped && row.is_correct !== null);
  let weightedCorrect = 0;
  let weightedTotal = 0;
  for (const row of answered) {
    const weight = Number(row.evidence_weight || 1) * recencyFactor(row.occurred_at);
    weightedTotal += weight;
    if (row.is_correct) weightedCorrect += weight;
  }
  const proficiency = weightedTotal > 0 ? round2((weightedCorrect / weightedTotal) * 100) : 0;

  const difficulties = new Set(answered.map((row) => row.difficulty));
  const skills = new Set(answered.map((row) => row.cognitive_skill));
  const roles = new Set(answered.map((row) => row.evidence_role));
  const volumeComponent = Math.min(1, answered.length / 8) * 40;
  const difficultyComponent = Math.min(1, difficulties.size / 3) * 20;
  const skillComponent = Math.min(1, skills.size / 3) * 20;
  const roleComponent = Math.min(1, roles.size / 2) * 10;

  let consistencyComponent = 0;
  if (answered.length >= 2) {
    const mean = answered.filter((row) => row.is_correct).length / answered.length;
    const variance = answered.reduce((sum, row) => {
      const signal = row.is_correct ? 1 : 0;
      return sum + ((signal - mean) ** 2);
    }, 0) / answered.length;
    const standardDeviation = Math.sqrt(variance);
    consistencyComponent = Math.max(0, 1 - (standardDeviation / 0.5)) * 10;
  }
  const confidence = round2(Math.min(100,
    volumeComponent + difficultyComponent + skillComponent + roleComponent + consistencyComponent));
  const level = confidenceLevel(confidence, answered.length);

  const { rows: [progress] } = await client.query<MasteryRow>(
    `SELECT mastered_at FROM student_concept_progress WHERE student_id=$1 AND concept_id=$2`,
    [studentId, conceptId],
  );
  const masteredAt = progress?.mastered_at || null;
  const retentionState = retention(answered.length, proficiency, confidence, masteredAt);

  const misconceptionCodes = [...new Set(answered.map((row) => row.misconception_code).filter(Boolean))] as string[];
  let dominantMisconceptionCode: string | null = null;
  let dominantWrongCount = -1;

  for (const code of misconceptionCodes) {
    const tagged = answered.filter((row) => row.misconception_code === code);
    const wrongRows = tagged.filter((row) => row.is_correct === false);
    const correctRows = tagged.filter((row) => row.is_correct === true);
    if (wrongRows.length === 0) continue;

    const latestWrong = new Date(wrongRows[wrongRows.length - 1].occurred_at);
    const latestCorrect = correctRows.length
      ? new Date(correctRows[correctRows.length - 1].occurred_at)
      : null;
    let state: MisconceptionState = wrongRows.length >= 2 ? 'ACTIVE' : 'SUSPECTED';
    if (correctRows.length >= 2 && latestCorrect && latestCorrect > latestWrong) state = 'RESOLVED';

    await client.query(
      `INSERT INTO student_concept_misconceptions
         (student_id,concept_id,misconception_code,state,wrong_count,correct_count,
          first_seen_at,last_seen_at,resolved_at,updated_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())
       ON CONFLICT (student_id,concept_id,misconception_code) DO UPDATE SET
         state=EXCLUDED.state,wrong_count=EXCLUDED.wrong_count,correct_count=EXCLUDED.correct_count,
         first_seen_at=EXCLUDED.first_seen_at,last_seen_at=EXCLUDED.last_seen_at,
         resolved_at=EXCLUDED.resolved_at,updated_at=NOW()`,
      [studentId, conceptId, code, state, wrongRows.length, correctRows.length,
        wrongRows[0].occurred_at, latestWrong, state === 'RESOLVED' ? latestCorrect : null],
    );

    if (state !== 'RESOLVED' && wrongRows.length > dominantWrongCount) {
      dominantMisconceptionCode = code;
      dominantWrongCount = wrongRows.length;
    }
  }

  const lastEvidenceAt = answered.length ? answered[answered.length - 1].occurred_at : null;
  const correctCount = answered.filter((row) => row.is_correct).length;
  const diagnosticCount = answered.filter((row) => row.evidence_role === 'DIAGNOSTIC').length;
  const practiceCount = answered.filter((row) => row.evidence_role === 'PRACTICE').length;
  const masteryCount = answered.filter((row) => row.evidence_role === 'MASTERY').length;

  await client.query(
    `INSERT INTO student_concept_intelligence
       (student_id,concept_id,proficiency_score,confidence_score,confidence_level,
        evidence_count,correct_evidence_count,diagnostic_count,practice_count,mastery_count,
        difficulty_diversity,skill_diversity,role_diversity,retention_status,next_review_at,
        dominant_misconception_code,last_evidence_at,last_mastery_at)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
     ON CONFLICT (student_id,concept_id) DO UPDATE SET
       proficiency_score=EXCLUDED.proficiency_score,confidence_score=EXCLUDED.confidence_score,
       confidence_level=EXCLUDED.confidence_level,evidence_count=EXCLUDED.evidence_count,
       correct_evidence_count=EXCLUDED.correct_evidence_count,diagnostic_count=EXCLUDED.diagnostic_count,
       practice_count=EXCLUDED.practice_count,mastery_count=EXCLUDED.mastery_count,
       difficulty_diversity=EXCLUDED.difficulty_diversity,skill_diversity=EXCLUDED.skill_diversity,
       role_diversity=EXCLUDED.role_diversity,retention_status=EXCLUDED.retention_status,
       next_review_at=EXCLUDED.next_review_at,dominant_misconception_code=EXCLUDED.dominant_misconception_code,
       last_evidence_at=EXCLUDED.last_evidence_at,last_mastery_at=EXCLUDED.last_mastery_at,
       updated_at=NOW()`,
    [studentId, conceptId, proficiency, confidence, level, answered.length, correctCount,
      diagnosticCount, practiceCount, masteryCount, difficulties.size, skills.size, roles.size,
      retentionState.status, retentionState.nextReviewAt, dominantMisconceptionCode,
      lastEvidenceAt, masteredAt],
  );
}

async function studentIdForUser(userId: UUID): Promise<UUID> {
  const { rows: [student] } = await query<{ id: UUID } & QueryResultRow>(
    `SELECT id FROM students WHERE user_id=$1 AND status='ACTIVE'`,
    [userId],
  );
  if (!student) throw Object.assign(new Error('Student profile not found'), { statusCode: 404 });
  return student.id;
}

export async function getStudentDiagnosticProfile(userId: UUID) {
  const studentId = await studentIdForUser(userId);
  const [concepts, misconceptions] = await Promise.all([
    query<ConceptProfileRow>(
      `SELECT sci.concept_id,lc.code,lc.name,lc.name_hi,lc.subject_code,sub.name AS subject_name,
              lc.chapter_title,sci.proficiency_score::float,sci.confidence_score::float,
              sci.confidence_level,sci.evidence_count,sci.correct_evidence_count,
              sci.diagnostic_count,sci.practice_count,sci.mastery_count,sci.retention_status,
              sci.next_review_at,sci.dominant_misconception_code,sci.last_evidence_at,sci.last_mastery_at
       FROM student_concept_intelligence sci
       JOIN learning_concepts lc ON lc.id=sci.concept_id AND lc.is_active=TRUE
       LEFT JOIN subjects sub ON sub.id=lc.subject_id
       WHERE sci.student_id=$1
       ORDER BY
         CASE sci.retention_status WHEN 'REVIEW_DUE' THEN 0 WHEN 'REVIEW_SOON' THEN 1 ELSE 2 END,
         sci.proficiency_score ASC,sci.confidence_score ASC,lc.sequence,lc.code`,
      [studentId],
    ),
    query<MisconceptionProfileRow>(
      `SELECT concept_id,misconception_code,state,wrong_count,correct_count,
              first_seen_at,last_seen_at,resolved_at
       FROM student_concept_misconceptions
       WHERE student_id=$1
       ORDER BY CASE state WHEN 'ACTIVE' THEN 0 WHEN 'SUSPECTED' THEN 1 ELSE 2 END,last_seen_at DESC`,
      [studentId],
    ),
  ]);

  const misconceptionByConcept = new Map<string, MisconceptionProfileRow[]>();
  for (const row of misconceptions.rows) {
    const list = misconceptionByConcept.get(row.concept_id) || [];
    list.push(row);
    misconceptionByConcept.set(row.concept_id, list);
  }

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      conceptsAssessed: concepts.rows.length,
      reviewDue: concepts.rows.filter((row) => row.retention_status === 'REVIEW_DUE').length,
      activeMisconceptions: misconceptions.rows.filter((row) => row.state === 'ACTIVE').length,
      lowConfidence: concepts.rows.filter((row) => row.confidence_level === 'LOW').length,
    },
    concepts: concepts.rows.map((row) => ({
      conceptId: row.concept_id,
      code: row.code,
      name: row.name,
      nameHi: row.name_hi,
      subjectCode: row.subject_code,
      subjectName: row.subject_name,
      chapterTitle: row.chapter_title,
      proficiencyScore: Number(row.proficiency_score || 0),
      confidenceScore: Number(row.confidence_score || 0),
      confidenceLevel: row.confidence_level,
      evidenceCount: Number(row.evidence_count || 0),
      correctEvidenceCount: Number(row.correct_evidence_count || 0),
      diagnosticCount: Number(row.diagnostic_count || 0),
      practiceCount: Number(row.practice_count || 0),
      masteryCount: Number(row.mastery_count || 0),
      retentionStatus: row.retention_status,
      nextReviewAt: row.next_review_at,
      dominantMisconceptionCode: row.dominant_misconception_code,
      lastEvidenceAt: row.last_evidence_at,
      lastMasteryAt: row.last_mastery_at,
      misconceptions: misconceptionByConcept.get(row.concept_id) || [],
    })),
  };
}
