const { query } = require('../config/db');
const academicCompetitionService = require('./academicCompetition.service');

async function getContext(studentId) {
  const { rows: [student] } = await query(
    `SELECT s.id, s.school_id, s.school_link_status,
            COALESCE(sc.class_name, s.grade_level) AS class_name
     FROM students s
     LEFT JOIN school_classes sc ON sc.id = s.class_id
     WHERE s.id = $1 AND s.status = 'ACTIVE'`,
    [studentId]
  );
  if (!student) throw Object.assign(new Error('Student profile not found'), { statusCode: 404 });
  return student;
}

function effectiveSchoolId(student) {
  return student.school_link_status === 'APPROVED' ? student.school_id : null;
}

async function register(examId, studentId) {
  const student = await getContext(studentId);
  const schoolId = effectiveSchoolId(student);
  const { rows: [exam] } = await query('SELECT * FROM exams WHERE id = $1', [examId]);
  if (!exam) throw Object.assign(new Error('Exam not found'), { statusCode: 404 });
  if (!['REGISTRATION_OPEN', 'LIVE'].includes(exam.status)) throw Object.assign(new Error('Registration is not open for this exam'), { statusCode: 400 });
  if (exam.school_id && exam.school_id !== schoolId) throw Object.assign(new Error('This school exam is available only after approved school enrollment'), { statusCode: 403 });
  if (exam.class_names?.length && !exam.class_names.includes(student.class_name)) throw Object.assign(new Error('This exam is not available for your class'), { statusCode: 403 });
  if (exam.registration_start && new Date() < new Date(exam.registration_start)) throw Object.assign(new Error('Registration has not opened yet'), { statusCode: 400 });
  if (exam.registration_end && new Date() > new Date(exam.registration_end)) throw Object.assign(new Error('Registration deadline has passed'), { statusCode: 400 });

  if (exam.max_registrations) {
    const { rows: [countRow] } = await query('SELECT COUNT(*)::INT AS count FROM exam_registrations WHERE exam_id = $1', [examId]);
    if (countRow.count >= exam.max_registrations) throw Object.assign(new Error('Registration capacity has been reached'), { statusCode: 400 });
  }

  const { rows: [registration] } = await query(
    `INSERT INTO exam_registrations (exam_id, student_id, school_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (exam_id, student_id) DO UPDATE SET school_id = EXCLUDED.school_id
     RETURNING id, registered_at`,
    [examId, studentId, schoolId]
  );
  return { registered: true, registrationId: registration.id, registeredAt: registration.registered_at, examTitle: exam.title };
}

async function startAttempt(examId, studentId) {
  const student = await getContext(studentId);
  const schoolId = effectiveSchoolId(student);
  const { rows: [exam] } = await query('SELECT * FROM exams WHERE id = $1', [examId]);
  if (!exam) throw Object.assign(new Error('Exam not found'), { statusCode: 404 });
  if (exam.status !== 'LIVE') throw Object.assign(new Error('Exam is not live right now'), { statusCode: 400 });
  if (exam.school_id && exam.school_id !== schoolId) throw Object.assign(new Error('This school exam is available only after approved school enrollment'), { statusCode: 403 });
  if (exam.class_names?.length && !exam.class_names.includes(student.class_name)) throw Object.assign(new Error('This exam is not available for your class'), { statusCode: 403 });

  const { rows: [registration] } = await query('SELECT id FROM exam_registrations WHERE exam_id = $1 AND student_id = $2', [examId, studentId]);
  if (!registration) await register(examId, studentId);

  const { rows: [existing] } = await query('SELECT * FROM exam_attempts WHERE exam_id = $1 AND student_id = $2', [examId, studentId]);
  if (existing && existing.status !== 'IN_PROGRESS') throw Object.assign(new Error('You have already submitted this exam'), { statusCode: 409 });

  let attempt = existing;
  if (!attempt) {
    const { rows: [created] } = await query(
      `INSERT INTO exam_attempts (exam_id, student_id, school_id, status)
       VALUES ($1, $2, $3, 'IN_PROGRESS') RETURNING *`,
      [examId, studentId, schoolId]
    );
    attempt = created;
  }

  const { rows: questions } = await query(
    `SELECT id, question_text, question_hi,
            option_a, option_b, option_c, option_d,
            option_a_hi, option_b_hi, option_c_hi, option_d_hi,
            subject_code, difficulty, sort_order
     FROM exam_questions WHERE exam_id = $1 ORDER BY sort_order, created_at`,
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

async function submitAttempt(attemptId, studentId, responses) {
  return academicCompetitionService.submitAttempt(attemptId, studentId, responses);
}

module.exports = { getContext, register, startAttempt, submitAttempt };
