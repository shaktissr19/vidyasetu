import type { QueryResultRow } from 'pg';
import type { UUID } from '@vidyasetu/contracts';
import { query, transaction } from '../config/db';

interface LeaderboardRankRow extends QueryResultRow {
  attempt_id: UUID;
  student_id: UUID;
  school_id: UUID | null;
  total_marks: number | string;
  rank_overall: number | string;
  rank_school: number | string | null;
  percentile: number | string;
}

interface AttemptRow extends QueryResultRow {
  id: UUID;
  exam_id: UUID;
  student_id: UUID;
  school_id: UUID | null;
  status: string;
  started_at: string | Date;
  deadline_at?: string | Date | null;
  duration_mins: number;
  end_time: string | Date;
  marks_per_question: number | string;
  negative_marks: number | string;
  total_questions: number | string;
  type: string;
  exam_status: string;
}

interface QuestionAnswerRow extends QueryResultRow {
  id: UUID;
  correct_option: string;
}

interface RankedAttemptRow extends QueryResultRow {
  total_marks: number | string;
  rank_school: number | string | null;
  rank_overall: number | string | null;
  percentile: number | string | null;
}

export interface ExamResponseInput {
  questionId: UUID;
  selectedOption?: string | null;
}

export interface SubmittedAttemptResult {
  examId: UUID;
  examType: string;
  released: boolean;
  score?: number;
  maxMarks?: number;
  correctCount?: number;
  wrongCount?: number;
  skippedCount?: number;
  timeTakenSecs: number;
  total_marks?: number | string;
  rank_school?: number | string | null;
  rank_overall?: number | string | null;
  percentile?: number | string | null;
  integrityStatus?: 'CLEAN' | 'FLAGGED';
  message?: string;
}

async function supportsCompetitionV2(): Promise<boolean> {
  const { rows: [row] } = await query<{ available: boolean } & QueryResultRow>(
    `SELECT EXISTS(
       SELECT 1 FROM information_schema.columns
       WHERE table_schema='public' AND table_name='exam_attempts' AND column_name='integrity_status'
     ) AS available`,
  );
  return Boolean(row?.available);
}

async function summarizeConcepts(attemptId: UUID): Promise<void> {
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

export async function recomputeLeaderboard(examId: UUID): Promise<void> {
  const v2 = await supportsCompetitionV2();
  const integrityFilter = v2 ? "AND ea.integrity_status='CLEAN'" : '';
  const { rows: ranked } = await query<LeaderboardRankRow>(
    `SELECT ea.id AS attempt_id, ea.student_id, ea.school_id, ea.total_marks,
            RANK() OVER (ORDER BY ea.total_marks DESC, ea.time_taken_secs ASC, ea.submitted_at ASC) AS rank_overall,
            CASE WHEN ea.school_id IS NULL THEN NULL ELSE
              RANK() OVER (PARTITION BY ea.school_id ORDER BY ea.total_marks DESC, ea.time_taken_secs ASC, ea.submitted_at ASC)
            END AS rank_school,
            ROUND((PERCENT_RANK() OVER (ORDER BY ea.total_marks) * 100)::numeric, 2) AS percentile
     FROM exam_attempts ea
     WHERE ea.exam_id = $1 AND ea.status = 'SCORED' ${integrityFilter}`,
    [examId],
  );

  if (v2) {
    await query('DELETE FROM exam_leaderboard WHERE exam_id=$1', [examId]);
    await query(
      `UPDATE exam_attempts SET rank_school=NULL,rank_overall=NULL,percentile=NULL
       WHERE exam_id=$1 AND (status<>'SCORED' OR integrity_status<>'CLEAN')`,
      [examId],
    );
  }

  for (const row of ranked) {
    await query(
      `UPDATE exam_attempts SET rank_school=$1,rank_overall=$2,percentile=$3 WHERE id=$4`,
      [row.rank_school == null ? null : Number(row.rank_school), Number(row.rank_overall), Number(row.percentile), row.attempt_id],
    );
    await query(
      `INSERT INTO exam_leaderboard
         (exam_id,attempt_id,student_id,school_id,total_marks,rank_school,rank_overall,percentile,xp_awarded)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,0)
       ON CONFLICT(exam_id,student_id) DO UPDATE SET
         attempt_id=EXCLUDED.attempt_id,school_id=EXCLUDED.school_id,total_marks=EXCLUDED.total_marks,
         rank_school=EXCLUDED.rank_school,rank_overall=EXCLUDED.rank_overall,percentile=EXCLUDED.percentile,xp_awarded=0`,
      [examId,row.attempt_id,row.student_id,row.school_id,row.total_marks,
       row.rank_school == null ? null : Number(row.rank_school),Number(row.rank_overall),Number(row.percentile)],
    );
  }
}

export async function submitAttempt(
  attemptId: UUID,
  studentId: UUID,
  responses: ExamResponseInput[] = [],
): Promise<SubmittedAttemptResult> {
  const v2 = await supportsCompetitionV2();
  const result = await transaction(async (client) => {
    const { rows: [attempt] } = await client.query<AttemptRow>(
      `SELECT ea.*,e.duration_mins,e.end_time,e.marks_per_question,e.negative_marks,
              e.total_questions,e.type,e.status AS exam_status
       FROM exam_attempts ea JOIN exams e ON e.id=ea.exam_id
       WHERE ea.id=$1 AND ea.student_id=$2 FOR UPDATE`,
      [attemptId,studentId],
    );
    if (!attempt) throw Object.assign(new Error('Attempt not found'), { statusCode: 404 });
    if (attempt.status !== 'IN_PROGRESS') throw Object.assign(new Error('Attempt already submitted'), { statusCode: 409 });

    const { rows: questions } = await client.query<QuestionAnswerRow>(
      'SELECT id,correct_option FROM exam_questions WHERE exam_id=$1 ORDER BY sort_order',
      [attempt.exam_id],
    );
    if (!questions.length) throw Object.assign(new Error('This exam does not have questions yet'), { statusCode: 400 });

    const validQuestionIds = new Set(questions.map((item) => item.id));
    for (const response of responses) {
      if (!validQuestionIds.has(response.questionId)) throw Object.assign(new Error('Response contains a question outside this competition'), { statusCode: 400 });
    }
    const responseMap: Record<string,string | null> = Object.fromEntries(
      responses.map((response) => [response.questionId,String(response.selectedOption || '').toUpperCase() || null]),
    );
    let correctCount = 0;
    let wrongCount = 0;
    let skippedCount = 0;
    let totalMarks = 0;

    for (const question of questions) {
      const selected = responseMap[question.id] || null;
      const isCorrect = selected ? selected === question.correct_option : null;
      let marksAwarded = 0;
      if (!selected) skippedCount += 1;
      else if (isCorrect) { correctCount += 1; marksAwarded = Number(attempt.marks_per_question); }
      else { wrongCount += 1; marksAwarded = -Number(attempt.negative_marks); }
      totalMarks += marksAwarded;
      await client.query(
        `INSERT INTO exam_responses(attempt_id,question_id,selected_option,is_correct,marks_awarded)
         VALUES($1,$2,$3,$4,$5)
         ON CONFLICT(attempt_id,question_id) DO UPDATE SET selected_option=EXCLUDED.selected_option,
           is_correct=EXCLUDED.is_correct,marks_awarded=EXCLUDED.marks_awarded`,
        [attemptId,question.id,selected,isCorrect,marksAwarded],
      );
    }

    totalMarks = Math.max(0,Number(totalMarks.toFixed(2)));
    const submittedAt = new Date();
    const startedAt = new Date(attempt.started_at);
    const hardEnd = new Date(attempt.end_time);
    const durationEnd = new Date(startedAt.getTime() + Number(attempt.duration_mins) * 60_000);
    const storedDeadline = attempt.deadline_at ? new Date(attempt.deadline_at) : null;
    const deadline = storedDeadline || (durationEnd < hardEnd ? durationEnd : hardEnd);
    const lateBySecs = Math.max(0,Math.floor((submittedAt.getTime() - deadline.getTime()) / 1000));
    const flagged = v2 && lateBySecs > 30;
    const timeTakenSecs = Math.max(0,Math.floor((submittedAt.getTime() - startedAt.getTime()) / 1000));

    if (v2) {
      await client.query(
        `UPDATE exam_attempts SET status='SCORED',submitted_at=NOW(),time_taken_secs=$1,total_marks=$2,
             correct_count=$3,wrong_count=$4,skipped_count=$5,
             integrity_status=$6,integrity_flags=CASE WHEN $7::int>30
               THEN jsonb_build_array(jsonb_build_object('code','LATE_SUBMISSION','lateBySecs',$7,'recordedAt',NOW()))
               ELSE integrity_flags END
         WHERE id=$8`,
        [timeTakenSecs,totalMarks,correctCount,wrongCount,skippedCount,flagged ? 'FLAGGED' : 'CLEAN',lateBySecs,attemptId],
      );
    } else {
      await client.query(
        `UPDATE exam_attempts SET status='SCORED',submitted_at=NOW(),time_taken_secs=$1,total_marks=$2,
             correct_count=$3,wrong_count=$4,skipped_count=$5 WHERE id=$6`,
        [timeTakenSecs,totalMarks,correctCount,wrongCount,skippedCount,attemptId],
      );
    }
    return {
      examId: attempt.exam_id,
      examType: attempt.type,
      examStatus: attempt.exam_status,
      score: totalMarks,
      maxMarks: Number(attempt.total_questions) * Number(attempt.marks_per_question),
      correctCount,wrongCount,skippedCount,timeTakenSecs,
      integrityStatus: flagged ? 'FLAGGED' as const : 'CLEAN' as const,
    };
  });

  if (v2) await summarizeConcepts(attemptId);
  await recomputeLeaderboard(result.examId);

  const hideUntilRelease = v2 && result.examType === 'OLYMPIAD' && result.examStatus !== 'COMPLETED';
  if (hideUntilRelease) {
    return {
      examId: result.examId,
      examType: result.examType,
      released: false,
      timeTakenSecs: result.timeTakenSecs,
      integrityStatus: result.integrityStatus,
      message: result.integrityStatus === 'FLAGGED'
        ? 'Attempt submitted. An integrity flag was recorded for review; official results will appear only after release.'
        : 'Attempt submitted successfully. Score, rank and learning feedback will appear after official results are released.',
    };
  }

  const { rows: [ranked] } = await query<RankedAttemptRow>(
    'SELECT total_marks,rank_school,rank_overall,percentile FROM exam_attempts WHERE id=$1',
    [attemptId],
  );
  return {
    examId: result.examId,
    examType: result.examType,
    released: true,
    score: result.score,
    maxMarks: result.maxMarks,
    correctCount: result.correctCount,
    wrongCount: result.wrongCount,
    skippedCount: result.skippedCount,
    timeTakenSecs: result.timeTakenSecs,
    integrityStatus: result.integrityStatus,
    ...(ranked || {}),
  };
}
