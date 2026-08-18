const { query, transaction } = require('../config/db');

async function recomputeLeaderboard(examId) {
  const { rows: ranked } = await query(
    `SELECT ea.id AS attempt_id, ea.student_id, ea.school_id, ea.total_marks,
            RANK() OVER (ORDER BY ea.total_marks DESC, ea.time_taken_secs ASC, ea.submitted_at ASC) AS rank_overall,
            CASE WHEN ea.school_id IS NULL THEN NULL ELSE
              RANK() OVER (PARTITION BY ea.school_id ORDER BY ea.total_marks DESC, ea.time_taken_secs ASC, ea.submitted_at ASC)
            END AS rank_school,
            ROUND((PERCENT_RANK() OVER (ORDER BY ea.total_marks) * 100)::numeric, 2) AS percentile
     FROM exam_attempts ea
     WHERE ea.exam_id = $1 AND ea.status = 'SCORED'`,
    [examId]
  );

  for (const row of ranked) {
    await query(
      `UPDATE exam_attempts
       SET rank_school = $1, rank_overall = $2, percentile = $3
       WHERE id = $4`,
      [row.rank_school == null ? null : Number(row.rank_school), Number(row.rank_overall), Number(row.percentile), row.attempt_id]
    );
    await query(
      `INSERT INTO exam_leaderboard
         (exam_id, attempt_id, student_id, school_id, total_marks,
          rank_school, rank_overall, percentile, xp_awarded)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,0)
       ON CONFLICT (exam_id, student_id) DO UPDATE
       SET attempt_id = EXCLUDED.attempt_id,
           school_id = EXCLUDED.school_id,
           total_marks = EXCLUDED.total_marks,
           rank_school = EXCLUDED.rank_school,
           rank_overall = EXCLUDED.rank_overall,
           percentile = EXCLUDED.percentile,
           xp_awarded = 0`,
      [examId, row.attempt_id, row.student_id, row.school_id, row.total_marks,
       row.rank_school == null ? null : Number(row.rank_school), Number(row.rank_overall), Number(row.percentile)]
    );
  }
}

async function submitAttempt(attemptId, studentId, responses = []) {
  const result = await transaction(async client => {
    const { rows: [attempt] } = await client.query(
      `SELECT ea.*, e.duration_mins, e.end_time, e.marks_per_question, e.negative_marks,
              e.total_questions, e.type
       FROM exam_attempts ea
       JOIN exams e ON e.id = ea.exam_id
       WHERE ea.id = $1 AND ea.student_id = $2
       FOR UPDATE`,
      [attemptId, studentId]
    );
    if (!attempt) throw Object.assign(new Error('Attempt not found'), { statusCode: 404 });
    if (attempt.status !== 'IN_PROGRESS') throw Object.assign(new Error('Attempt already submitted'), { statusCode: 409 });

    const { rows: questions } = await client.query(
      `SELECT id, correct_option FROM exam_questions WHERE exam_id = $1 ORDER BY sort_order`,
      [attempt.exam_id]
    );
    if (!questions.length) throw Object.assign(new Error('This exam does not have questions yet'), { statusCode: 400 });

    const responseMap = Object.fromEntries(
      (responses || []).map(response => [response.questionId, String(response.selectedOption || '').toUpperCase() || null])
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
      else if (isCorrect) {
        correctCount += 1;
        marksAwarded = Number(attempt.marks_per_question);
      } else {
        wrongCount += 1;
        marksAwarded = -Number(attempt.negative_marks);
      }
      totalMarks += marksAwarded;

      await client.query(
        `INSERT INTO exam_responses
           (attempt_id, question_id, selected_option, is_correct, marks_awarded)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (attempt_id, question_id) DO UPDATE
         SET selected_option = EXCLUDED.selected_option,
             is_correct = EXCLUDED.is_correct,
             marks_awarded = EXCLUDED.marks_awarded`,
        [attemptId, question.id, selected, isCorrect, marksAwarded]
      );
    }

    totalMarks = Math.max(0, Number(totalMarks.toFixed(2)));
    const submittedAt = new Date();
    const timeTakenSecs = Math.max(0, Math.floor((submittedAt - new Date(attempt.started_at)) / 1000));

    await client.query(
      `UPDATE exam_attempts
       SET status = 'SCORED', submitted_at = NOW(), time_taken_secs = $1,
           total_marks = $2, correct_count = $3, wrong_count = $4, skipped_count = $5
       WHERE id = $6`,
      [timeTakenSecs, totalMarks, correctCount, wrongCount, skippedCount, attemptId]
    );

    return {
      examId: attempt.exam_id,
      examType: attempt.type,
      score: totalMarks,
      maxMarks: Number(attempt.total_questions) * Number(attempt.marks_per_question),
      correctCount,
      wrongCount,
      skippedCount,
      timeTakenSecs,
    };
  });

  await recomputeLeaderboard(result.examId);
  const { rows: [ranked] } = await query(
    `SELECT total_marks, rank_school, rank_overall, percentile
     FROM exam_attempts WHERE id = $1`,
    [attemptId]
  );
  return { ...result, ...ranked };
}

module.exports = { submitAttempt, recomputeLeaderboard };
