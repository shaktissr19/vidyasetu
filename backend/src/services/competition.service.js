// services/competition.service.js
const { query, transaction } = require('../config/db');
const studentService = require('./student.service');
const notificationService = require('./notification.service');
const logger = require('../utils/logger');

/**
 * List all active competitions visible to a student.
 */
async function listForStudent(studentId, className) {
  const { rows } = await query(
    `SELECT e.*, sub.name AS subject_name,
            er.id AS registration_id,
            ea.status AS attempt_status, ea.score
     FROM exams e
     LEFT JOIN subjects sub ON sub.id = e.subject_id
     LEFT JOIN exam_registrations er ON er.exam_id = e.id AND er.student_id = $1
     LEFT JOIN exam_attempts ea ON ea.exam_id = e.id AND ea.student_id = $1
     WHERE e.status IN ('REGISTRATION_OPEN','LIVE','COMPLETED')
       AND ($2 = ANY(e.class_names) OR e.school_id IS NULL)
     ORDER BY e.start_time ASC`,
    [studentId, className]
  );
  return rows;
}

/**
 * Register a student for a competition.
 */
async function register(examId, studentId) {
  const { rows: [exam] } = await query(
    `SELECT * FROM exams WHERE id = $1`, [examId]
  );
  if (!exam) throw Object.assign(new Error('Exam not found'), { statusCode: 404 });
  if (!['REGISTRATION_OPEN', 'LIVE'].includes(exam.status)) {
    throw Object.assign(new Error('Registration is not open for this exam'), { statusCode: 400 });
  }
  if (exam.registration_deadline && new Date() > new Date(exam.registration_deadline)) {
    throw Object.assign(new Error('Registration deadline has passed'), { statusCode: 400 });
  }

  const { rows: [reg] } = await query(
    `INSERT INTO exam_registrations (exam_id, student_id)
     VALUES ($1, $2) ON CONFLICT (exam_id, student_id) DO NOTHING RETURNING id`,
    [examId, studentId]
  );

  return { registered: !!reg, examTitle: exam.title };
}

/**
 * Start an exam attempt — returns questions (shuffled, without correct answers).
 */
async function startAttempt(examId, studentId) {
  const { rows: [exam] } = await query(
    `SELECT * FROM exams WHERE id = $1`, [examId]
  );
  if (!exam) throw Object.assign(new Error('Exam not found'), { statusCode: 404 });
  if (exam.status !== 'LIVE') {
    throw Object.assign(new Error('Exam is not live yet'), { statusCode: 400 });
  }

  // Check existing attempt
  const { rows: [existing] } = await query(
    `SELECT * FROM exam_attempts WHERE exam_id = $1 AND student_id = $2`,
    [examId, studentId]
  );
  if (existing && existing.status !== 'IN_PROGRESS') {
    throw Object.assign(new Error('You have already submitted this exam'), { statusCode: 409 });
  }

  // Create attempt if not exists
  let attempt = existing;
  if (!attempt) {
    const { rows: [a] } = await query(
      `INSERT INTO exam_attempts (exam_id, student_id, status)
       VALUES ($1, $2, 'IN_PROGRESS') RETURNING *`,
      [examId, studentId]
    );
    attempt = a;
  }

  // Fetch questions — omit correct_option for security
  const { rows: questions } = await query(
    `SELECT id, question_text, question_hi, option_a, option_b, option_c, option_d,
            marks, negative_marks, sort_order
     FROM exam_questions WHERE exam_id = $1 ORDER BY sort_order`,
    [examId]
  );

  return {
    attemptId: attempt.id,
    examId,
    startedAt: attempt.started_at,
    durationMins: exam.duration_mins,
    endsAt: new Date(new Date(attempt.started_at).getTime() + exam.duration_mins * 60000),
    questions,
  };
}

/**
 * Submit exam — evaluate and compute score.
 */
async function submitAttempt(attemptId, studentId, responses) {
  // responses = [{ questionId, selectedOption }]
  return transaction(async (client) => {
    const { rows: [attempt] } = await client.query(
      `SELECT * FROM exam_attempts WHERE id = $1 AND student_id = $2`, [attemptId, studentId]
    );
    if (!attempt) throw Object.assign(new Error('Attempt not found'), { statusCode: 404 });
    if (attempt.status !== 'IN_PROGRESS') {
      throw Object.assign(new Error('Attempt already submitted'), { statusCode: 409 });
    }

    // Fetch correct answers
    const { rows: questions } = await client.query(
      `SELECT id, correct_option, marks, negative_marks FROM exam_questions WHERE exam_id = $1`,
      [attempt.exam_id]
    );
    const answerMap = Object.fromEntries(questions.map(q => [q.id, q]));

    let totalScore = 0;

    for (const r of responses) {
      const q = answerMap[r.questionId];
      if (!q) continue;

      const isCorrect = r.selectedOption && r.selectedOption === q.correct_option;
      const marksAwarded = isCorrect
        ? q.marks
        : r.selectedOption
          ? -q.negative_marks
          : 0;

      totalScore += marksAwarded;

      await client.query(
        `INSERT INTO exam_responses (attempt_id, question_id, selected_option, is_correct, marks_awarded)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (attempt_id, question_id) DO UPDATE
           SET selected_option = EXCLUDED.selected_option,
               is_correct = EXCLUDED.is_correct,
               marks_awarded = EXCLUDED.marks_awarded`,
        [attemptId, r.questionId, r.selectedOption || null, isCorrect, marksAwarded]
      );
    }

    totalScore = Math.max(0, totalScore); // no negative total

    // Update attempt
    await client.query(
      `UPDATE exam_attempts SET status = 'EVALUATED', submitted_at = NOW(), score = $1 WHERE id = $2`,
      [totalScore, attemptId]
    );

    // Award XP
    const { rows: [exam] } = await client.query(
      `SELECT total_marks, type FROM exams WHERE id = $1`, [attempt.exam_id]
    );
    const xp = exam.type === 'COMPETITION' ? 60 : 40;
    await studentService.awardXP(studentId, 'EXAM_SUBMIT', xp, attempt.exam_id, 'EXAM');

    // Recompute leaderboard asynchronously
    recomputeLeaderboard(attempt.exam_id).catch(e => logger.error('Leaderboard error:', e));

    return { score: totalScore, totalMarks: exam.total_marks, xpAwarded: xp };
  });
}

/**
 * Recompute and store leaderboard after submissions.
 */
async function recomputeLeaderboard(examId) {
  const { rows: attempts } = await query(
    `SELECT ea.student_id, ea.score,
            RANK() OVER (ORDER BY ea.score DESC) AS rank
     FROM exam_attempts ea
     WHERE ea.exam_id = $1 AND ea.status = 'EVALUATED'`,
    [examId]
  );

  for (const a of attempts) {
    await query(
      `INSERT INTO exam_leaderboard (exam_id, student_id, rank, score)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (exam_id, student_id) DO UPDATE SET rank = EXCLUDED.rank, score = EXCLUDED.score`,
      [examId, a.student_id, a.rank, a.score]
    );

    // Award bonus XP for top 10
    if (a.rank <= 10) {
      await studentService.awardXP(a.student_id, 'EXAM_TOP10', 100, examId, 'EXAM', `Top ${a.rank} in competition`);
      await studentService.awardBadgeIfNotEarned(a.student_id, 'OLYMPIAD_TOP10');
    }
    if (a.rank === 1) {
      await studentService.awardBadgeIfNotEarned(a.student_id, 'OLYMPIAD_WIN');
    }
  }
}

/**
 * Get leaderboard for an exam.
 */
async function getLeaderboard(examId, page = 1, limit = 50) {
  const offset = (page - 1) * limit;
  const { rows } = await query(
    `SELECT el.rank, el.score, u.name,
            sc.class_name, sc.section, sch.name AS school_name, sch.state
     FROM exam_leaderboard el
     JOIN students s ON s.id = el.student_id
     JOIN users u ON u.id = s.user_id
     JOIN school_classes sc ON sc.id = s.class_id
     JOIN schools sch ON sch.id = s.school_id
     WHERE el.exam_id = $1
     ORDER BY el.rank
     LIMIT $2 OFFSET $3`,
    [examId, limit, offset]
  );
  return rows;
}

/**
 * Admin: create a new competition exam.
 */
async function createExam(data, createdBy) {
  const { rows: [exam] } = await query(
    `INSERT INTO exams (title, title_hi, type, subject_id, school_id, class_names, status,
                        start_time, end_time, duration_mins, total_questions, total_marks,
                        prize_pool, registration_deadline, instructions, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
    [data.title, data.titleHi || null, data.type || 'COMPETITION',
     data.subjectId || null, data.schoolId || null,
     data.classNames, data.status || 'DRAFT',
     data.startTime, data.endTime, data.durationMins || 60,
     data.totalQuestions || 50, data.totalMarks || 100,
     data.prizePool || null, data.registrationDeadline || null,
     data.instructions || null, createdBy]
  );
  return exam;
}

/**
 * Bulk insert exam questions.
 */
async function addQuestions(examId, questions) {
  return transaction(async (client) => {
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      await client.query(
        `INSERT INTO exam_questions (exam_id, question_text, question_hi, option_a, option_b,
                                     option_c, option_d, correct_option, marks, negative_marks, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [examId, q.questionText, q.questionHi || null, q.optionA, q.optionB,
         q.optionC, q.optionD, q.correctOption, q.marks || 2, q.negativeMarks || 0, i + 1]
      );
    }
    // Update total_questions count
    await client.query(
      `UPDATE exams SET total_questions = $1 WHERE id = $2`, [questions.length, examId]
    );
    return { added: questions.length };
  });
}

module.exports = {
  listForStudent, register, startAttempt, submitAttempt,
  recomputeLeaderboard, getLeaderboard,
  createExam, addQuestions,
};
