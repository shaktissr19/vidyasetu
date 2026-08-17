// services/competition.service.js
const { query, transaction } = require('../config/db');
const studentService = require('./student.service');
const logger = require('../utils/logger');

async function getStudentContextById(studentId) {
  const { rows: [student] } = await query(
    `SELECT s.id, s.school_id, s.class_id, sc.class_name, sc.section
     FROM students s
     JOIN school_classes sc ON sc.id = s.class_id
     WHERE s.id = $1 AND s.status = 'ACTIVE'`,
    [studentId]
  );
  if (!student) throw Object.assign(new Error('Student profile not found'), { statusCode: 404 });
  return student;
}

async function listForStudent(studentId, className, schoolId) {
  const { rows } = await query(
    `SELECT e.id, e.title, e.title_hi, e.description, e.type, e.status,
            e.class_names, e.subject_codes, e.total_questions, e.duration_mins,
            e.marks_per_question, e.negative_marks,
            (e.total_questions * e.marks_per_question) AS max_marks,
            e.registration_start, e.registration_end,
            e.start_time, e.end_time, e.results_at, e.prize_pool,
            e.instructions, e.instructions_hi, e.banner_url,
            er.id AS registration_id, er.registered_at,
            ea.id AS attempt_id, ea.status AS attempt_status,
            ea.started_at, ea.submitted_at, ea.total_marks,
            ea.correct_count, ea.wrong_count, ea.skipped_count,
            ea.percentile, ea.rank_school, ea.rank_overall
     FROM exams e
     LEFT JOIN exam_registrations er
       ON er.exam_id = e.id AND er.student_id = $1
     LEFT JOIN exam_attempts ea
       ON ea.exam_id = e.id AND ea.student_id = $1
     WHERE e.status IN ('REGISTRATION_OPEN','REGISTRATION_CLOSED','LIVE','SCORING','COMPLETED')
       AND (cardinality(e.class_names) = 0 OR $2 = ANY(e.class_names))
       AND (e.school_id IS NULL OR e.school_id = $3)
     ORDER BY
       CASE e.status
         WHEN 'LIVE' THEN 1
         WHEN 'REGISTRATION_OPEN' THEN 2
         WHEN 'REGISTRATION_CLOSED' THEN 3
         WHEN 'SCORING' THEN 4
         ELSE 5
       END,
       e.start_time ASC`,
    [studentId, className, schoolId]
  );
  return rows;
}

async function listForUser(userId) {
  const { rows: [student] } = await query(
    `SELECT s.id, s.school_id, sc.class_name
     FROM students s
     JOIN school_classes sc ON sc.id = s.class_id
     WHERE s.user_id = $1 AND s.status = 'ACTIVE'`,
    [userId]
  );
  if (!student) throw Object.assign(new Error('Student profile not found'), { statusCode: 404 });
  return listForStudent(student.id, student.class_name, student.school_id);
}

async function register(examId, studentId) {
  const student = await getStudentContextById(studentId);
  const { rows: [exam] } = await query(`SELECT * FROM exams WHERE id = $1`, [examId]);
  if (!exam) throw Object.assign(new Error('Exam not found'), { statusCode: 404 });

  if (!['REGISTRATION_OPEN', 'LIVE'].includes(exam.status)) {
    throw Object.assign(new Error('Registration is not open for this exam'), { statusCode: 400 });
  }
  if (exam.school_id && exam.school_id !== student.school_id) {
    throw Object.assign(new Error('This exam is not available for your school'), { statusCode: 403 });
  }
  if (exam.class_names?.length && !exam.class_names.includes(student.class_name)) {
    throw Object.assign(new Error('This exam is not available for your class'), { statusCode: 403 });
  }
  if (exam.registration_start && new Date() < new Date(exam.registration_start)) {
    throw Object.assign(new Error('Registration has not opened yet'), { statusCode: 400 });
  }
  if (exam.registration_end && new Date() > new Date(exam.registration_end)) {
    throw Object.assign(new Error('Registration deadline has passed'), { statusCode: 400 });
  }

  if (exam.max_registrations) {
    const { rows: [countRow] } = await query(
      `SELECT COUNT(*)::INT AS count FROM exam_registrations WHERE exam_id = $1`,
      [examId]
    );
    if (countRow.count >= exam.max_registrations) {
      throw Object.assign(new Error('Registration capacity has been reached'), { statusCode: 400 });
    }
  }

  const { rows: [reg] } = await query(
    `INSERT INTO exam_registrations (exam_id, student_id, school_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (exam_id, student_id) DO UPDATE
     SET school_id = EXCLUDED.school_id
     RETURNING id, registered_at`,
    [examId, studentId, student.school_id]
  );

  return { registered: true, registrationId: reg.id, registeredAt: reg.registered_at, examTitle: exam.title };
}

async function startAttempt(examId, studentId) {
  const student = await getStudentContextById(studentId);
  const { rows: [exam] } = await query(`SELECT * FROM exams WHERE id = $1`, [examId]);
  if (!exam) throw Object.assign(new Error('Exam not found'), { statusCode: 404 });
  if (exam.status !== 'LIVE') {
    throw Object.assign(new Error('Exam is not live right now'), { statusCode: 400 });
  }
  if (exam.school_id && exam.school_id !== student.school_id) {
    throw Object.assign(new Error('This exam is not available for your school'), { statusCode: 403 });
  }
  if (exam.class_names?.length && !exam.class_names.includes(student.class_name)) {
    throw Object.assign(new Error('This exam is not available for your class'), { statusCode: 403 });
  }

  const { rows: [registration] } = await query(
    `SELECT id FROM exam_registrations WHERE exam_id = $1 AND student_id = $2`,
    [examId, studentId]
  );
  if (!registration) {
    await register(examId, studentId);
  }

  const { rows: [existing] } = await query(
    `SELECT * FROM exam_attempts WHERE exam_id = $1 AND student_id = $2`,
    [examId, studentId]
  );
  if (existing && existing.status !== 'IN_PROGRESS') {
    throw Object.assign(new Error('You have already submitted this exam'), { statusCode: 409 });
  }

  let attempt = existing;
  if (!attempt) {
    const { rows: [created] } = await query(
      `INSERT INTO exam_attempts (exam_id, student_id, school_id, status)
       VALUES ($1, $2, $3, 'IN_PROGRESS')
       RETURNING *`,
      [examId, studentId, student.school_id]
    );
    attempt = created;
  }

  const { rows: questions } = await query(
    `SELECT id, question_text, question_hi,
            option_a, option_b, option_c, option_d,
            option_a_hi, option_b_hi, option_c_hi, option_d_hi,
            subject_code, difficulty, sort_order
     FROM exam_questions
     WHERE exam_id = $1
     ORDER BY sort_order, created_at`,
    [examId]
  );

  const durationEnd = new Date(new Date(attempt.started_at).getTime() + exam.duration_mins * 60000);
  const hardEnd = new Date(exam.end_time);

  return {
    attemptId: attempt.id,
    exam: {
      id: exam.id,
      title: exam.title,
      titleHi: exam.title_hi,
      durationMins: exam.duration_mins,
      totalQuestions: exam.total_questions,
      marksPerQuestion: Number(exam.marks_per_question),
      negativeMarks: Number(exam.negative_marks),
      instructions: exam.instructions,
      subjectCodes: exam.subject_codes,
    },
    startedAt: attempt.started_at,
    endsAt: (durationEnd < hardEnd ? durationEnd : hardEnd).toISOString(),
    questions,
  };
}

async function hasXPEvent(studentId, examId, eventType) {
  const { rows: [row] } = await query(
    `SELECT id FROM xp_events
     WHERE student_id = $1 AND reference_id = $2 AND event_type = $3
     LIMIT 1`,
    [studentId, examId, eventType]
  );
  return !!row;
}

async function submitAttempt(attemptId, studentId, responses = []) {
  const result = await transaction(async (client) => {
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
    if (attempt.status !== 'IN_PROGRESS') {
      throw Object.assign(new Error('Attempt already submitted'), { statusCode: 409 });
    }

    const { rows: questions } = await client.query(
      `SELECT id, correct_option FROM exam_questions WHERE exam_id = $1 ORDER BY sort_order`,
      [attempt.exam_id]
    );
    if (!questions.length) {
      throw Object.assign(new Error('This exam does not have questions yet'), { statusCode: 400 });
    }

    const responseMap = Object.fromEntries(
      (responses || []).map(r => [r.questionId, String(r.selectedOption || '').toUpperCase() || null])
    );

    let correctCount = 0;
    let wrongCount = 0;
    let skippedCount = 0;
    let totalMarks = 0;

    for (const q of questions) {
      const selected = responseMap[q.id] || null;
      const isCorrect = selected ? selected === q.correct_option : null;
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
        [attemptId, q.id, selected, isCorrect, marksAwarded]
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

  if (!(await hasXPEvent(studentId, result.examId, 'EXAM_COMPLETE'))) {
    await studentService.awardXP(
      studentId,
      'EXAM_COMPLETE',
      result.examType === 'OLYMPIAD' ? 60 : 40,
      result.examId,
      'EXAM',
      'Completed exam'
    );
  }

  await recomputeLeaderboard(result.examId);

  const { rows: [ranked] } = await query(
    `SELECT total_marks, rank_school, rank_overall, percentile
     FROM exam_attempts WHERE id = $1`,
    [attemptId]
  );

  return { ...result, ...ranked };
}

async function recomputeLeaderboard(examId) {
  const { rows: ranked } = await query(
    `SELECT ea.id AS attempt_id, ea.student_id, ea.school_id, ea.total_marks,
            RANK() OVER (ORDER BY ea.total_marks DESC, ea.time_taken_secs ASC, ea.submitted_at ASC) AS rank_overall,
            RANK() OVER (PARTITION BY ea.school_id ORDER BY ea.total_marks DESC, ea.time_taken_secs ASC, ea.submitted_at ASC) AS rank_school,
            ROUND(PERCENT_RANK() OVER (ORDER BY ea.total_marks) * 100, 2) AS percentile
     FROM exam_attempts ea
     WHERE ea.exam_id = $1 AND ea.status = 'SCORED'`,
    [examId]
  );

  for (const row of ranked) {
    await query(
      `UPDATE exam_attempts
       SET rank_school = $1, rank_overall = $2, percentile = $3
       WHERE id = $4`,
      [Number(row.rank_school), Number(row.rank_overall), Number(row.percentile), row.attempt_id]
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
           percentile = EXCLUDED.percentile`,
      [examId, row.attempt_id, row.student_id, row.school_id, row.total_marks,
       Number(row.rank_school), Number(row.rank_overall), Number(row.percentile)]
    );

    const overallRank = Number(row.rank_overall);
    if (overallRank <= 10 && !(await hasXPEvent(row.student_id, examId, 'EXAM_TOP_10'))) {
      await studentService.awardXP(row.student_id, 'EXAM_TOP_10', 100, examId, 'EXAM', `Top ${overallRank} overall`);
    }
    if (overallRank <= 3 && !(await hasXPEvent(row.student_id, examId, 'EXAM_TOP_3'))) {
      await studentService.awardXP(row.student_id, 'EXAM_TOP_3', 200, examId, 'EXAM', `Top ${overallRank} overall`);
      await studentService.awardBadgeIfNotEarned(row.student_id, 'EXAM_TOPPER');
    }
  }
}

async function getLeaderboard(examId, page = 1, limit = 50) {
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);
  const safePage = Math.max(Number(page) || 1, 1);
  const offset = (safePage - 1) * safeLimit;
  const { rows } = await query(
    `SELECT el.rank_overall, el.rank_school, el.total_marks, el.percentile,
            u.name, u.profile_photo, sc.class_name, sc.section,
            sch.name AS school_name, sch.state
     FROM exam_leaderboard el
     JOIN students s ON s.id = el.student_id
     JOIN users u ON u.id = s.user_id
     JOIN school_classes sc ON sc.id = s.class_id
     JOIN schools sch ON sch.id = s.school_id
     WHERE el.exam_id = $1
     ORDER BY el.rank_overall, el.total_marks DESC
     LIMIT $2 OFFSET $3`,
    [examId, safeLimit, offset]
  );
  return rows;
}

async function createExam(data, createdBy) {
  const { rows: [exam] } = await query(
    `INSERT INTO exams
       (title, title_hi, description, type, school_id, class_names, subject_codes,
        status, total_questions, duration_mins, marks_per_question, negative_marks,
        registration_start, registration_end, start_time, end_time, results_at,
        prize_pool, instructions, instructions_hi, banner_url, max_registrations, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
     RETURNING *`,
    [
      data.title,
      data.titleHi || null,
      data.description || null,
      data.type || 'OLYMPIAD',
      data.schoolId || null,
      data.classNames || [],
      data.subjectCodes || [],
      data.status || 'DRAFT',
      data.totalQuestions || 30,
      data.durationMins || 60,
      data.marksPerQuestion ?? 4,
      data.negativeMarks ?? 1,
      data.registrationStart || null,
      data.registrationEnd || null,
      data.startTime,
      data.endTime,
      data.resultsAt || null,
      data.prizePool || 0,
      data.instructions || null,
      data.instructionsHi || null,
      data.bannerUrl || null,
      data.maxRegistrations || null,
      createdBy,
    ]
  );
  return exam;
}

async function addQuestions(examId, questions = []) {
  return transaction(async (client) => {
    const { rows: [exam] } = await client.query(`SELECT id FROM exams WHERE id = $1`, [examId]);
    if (!exam) throw Object.assign(new Error('Exam not found'), { statusCode: 404 });

    for (let i = 0; i < questions.length; i += 1) {
      const q = questions[i];
      await client.query(
        `INSERT INTO exam_questions
           (exam_id, question_text, question_hi,
            option_a, option_b, option_c, option_d,
            option_a_hi, option_b_hi, option_c_hi, option_d_hi,
            correct_option, explanation, subject_code, difficulty, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
        [examId, q.questionText, q.questionHi || null,
         q.optionA, q.optionB, q.optionC, q.optionD,
         q.optionAHi || null, q.optionBHi || null, q.optionCHi || null, q.optionDHi || null,
         q.correctOption, q.explanation || null, q.subjectCode || null, q.difficulty || 'MEDIUM', i + 1]
      );
    }

    await client.query(`UPDATE exams SET total_questions = $1 WHERE id = $2`, [questions.length, examId]);
    return { added: questions.length };
  });
}

module.exports = {
  listForStudent,
  listForUser,
  register,
  startAttempt,
  submitAttempt,
  recomputeLeaderboard,
  getLeaderboard,
  createExam,
  addQuestions,
};
