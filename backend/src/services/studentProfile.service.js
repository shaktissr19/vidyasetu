const { query, transaction } = require('../config/db');

function badRequest(message) {
  return Object.assign(new Error(message), { statusCode: 400 });
}

function notFound(message) {
  return Object.assign(new Error(message), { statusCode: 404 });
}

async function getSetupOptions() {
  const { rows } = await query(
    `SELECT sch.id AS school_id,
            sch.name AS school_name,
            sch.city,
            sch.district,
            sch.state,
            sch.academic_year AS school_academic_year,
            sc.id AS class_id,
            sc.class_name,
            sc.section,
            sc.academic_year
     FROM schools sch
     JOIN school_classes sc ON sc.school_id = sch.id
     WHERE sch.status = 'ACTIVE'
     ORDER BY sch.name, sc.class_name::int NULLS LAST, sc.class_name, sc.section`
  );

  const bySchool = new Map();
  for (const row of rows) {
    if (!bySchool.has(row.school_id)) {
      bySchool.set(row.school_id, {
        id: row.school_id,
        name: row.school_name,
        city: row.city,
        district: row.district,
        state: row.state,
        academicYear: row.school_academic_year,
        classes: [],
      });
    }
    bySchool.get(row.school_id).classes.push({
      id: row.class_id,
      className: row.class_name,
      section: row.section,
      academicYear: row.academic_year,
      label: `${row.class_name}-${row.section}`,
    });
  }

  return {
    schools: Array.from(bySchool.values()),
    gradeLevels: ['1','2','3','4','5','6','7','8','9','10','11','12'],
  };
}

async function getProfileByUserId(userId) {
  const { rows: [profile] } = await query(
    `SELECT s.id, s.user_id, s.student_code, s.grade_level, s.school_link_status,
            s.school_id, s.class_id, s.roll_number, s.academic_year,
            s.date_of_birth, s.gender, s.status,
            u.name, u.username, u.email, u.mobile, u.language, u.profile_photo,
            sch.name AS school_name, sc.class_name, sc.section
     FROM students s
     JOIN users u ON u.id = s.user_id
     LEFT JOIN schools sch ON sch.id = s.school_id
     LEFT JOIN school_classes sc ON sc.id = s.class_id
     WHERE s.user_id = $1`,
    [userId]
  );

  if (!profile) return null;
  return {
    id: profile.id,
    userId: profile.user_id,
    studentCode: profile.student_code,
    name: profile.name,
    username: profile.username,
    email: profile.email,
    mobile: profile.mobile,
    language: profile.language,
    profilePhoto: profile.profile_photo,
    schoolId: profile.school_id,
    schoolName: profile.school_name,
    schoolLinkStatus: profile.school_link_status,
    classId: profile.class_id,
    gradeLevel: profile.class_name || profile.grade_level,
    className: profile.class_name || profile.grade_level,
    section: profile.section,
    classLabel: profile.class_name ? `${profile.class_name}-${profile.section}` : `Class ${profile.grade_level}`,
    rollNumber: profile.roll_number,
    academicYear: profile.academic_year,
    dateOfBirth: profile.date_of_birth,
    gender: profile.gender,
    status: profile.status,
  };
}

async function getProfileStatus(userId) {
  const profile = await getProfileByUserId(userId);
  return { complete: Boolean(profile), profile };
}

async function completeProfile(userId, payload) {
  const {
    name,
    language,
    gradeLevel,
    schoolId = null,
    classId = null,
    dateOfBirth = null,
    gender = null,
    parentName = null,
    parentMobile = null,
    parentEmail = null,
    parentRelation = 'PARENT',
    schoolNote = null,
  } = payload;

  await transaction(async client => {
    const { rows: [user] } = await client.query(
      `SELECT id, role, status FROM users WHERE id = $1 FOR UPDATE`,
      [userId]
    );
    if (!user) throw notFound('User not found');
    if (user.role !== 'STUDENT') throw badRequest('Only Student users can create a Student profile');
    if (user.status !== 'ACTIVE') throw badRequest('Student user is not active');

    const { rows: [existing] } = await client.query('SELECT id FROM students WHERE user_id = $1', [userId]);
    if (existing) return;

    let classRow = null;
    if (schoolId) {
      if (!classId) throw badRequest('Select a class/section when requesting a school');
      const { rows } = await client.query(
        `SELECT sc.id, sc.school_id, sc.class_name, sc.section, sc.academic_year,
                sch.status AS school_status
         FROM school_classes sc
         JOIN schools sch ON sch.id = sc.school_id
         WHERE sc.id = $1 AND sc.school_id = $2`,
        [classId, schoolId]
      );
      classRow = rows[0];
      if (!classRow) throw badRequest('Selected class does not belong to the selected school');
      if (classRow.school_status !== 'ACTIVE') throw badRequest('Selected school is not active');
    }

    const grade = String(gradeLevel || classRow?.class_name || '').trim();
    if (!grade) throw badRequest('Class/grade is required');

    await client.query(
      `UPDATE users SET name = $1, language = $2, updated_at = NOW() WHERE id = $3`,
      [name.trim(), language, userId]
    );

    const { rows: [student] } = await client.query(
      `INSERT INTO students
         (user_id, school_id, class_id, grade_level, school_link_status, academic_year,
          date_of_birth, gender, primary_parent_mobile)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [
        userId,
        schoolId || null,
        classId || null,
        grade,
        schoolId ? 'PENDING' : 'NOT_REQUESTED',
        classRow?.academic_year || '2026-27',
        dateOfBirth,
        gender,
        parentMobile || null,
      ]
    );

    if (schoolId) {
      await client.query(
        `INSERT INTO student_school_requests
           (student_id, requested_school_id, requested_class_id, requested_grade, student_note)
         VALUES ($1, $2, $3, $4, $5)`,
        [student.id, schoolId, classId, grade, schoolNote]
      );
    }

    if (parentMobile || parentEmail) {
      const { rows: [parent] } = await client.query(
        `SELECT id FROM users
         WHERE role = 'PARENT'
           AND ((NULLIF($1, '') IS NOT NULL AND mobile = $1)
             OR (NULLIF($2, '') IS NOT NULL AND LOWER(COALESCE(email, '')) = LOWER($2)))
         LIMIT 1`,
        [parentMobile || '', parentEmail || '']
      );
      if (parent) {
        await client.query(
          `INSERT INTO parent_student_links (parent_user_id, student_id, relation, is_primary)
           VALUES ($1, $2, $3, TRUE)
           ON CONFLICT (parent_user_id, student_id) DO NOTHING`,
          [parent.id, student.id, parentRelation]
        );
      } else {
        await client.query(
          `INSERT INTO parent_link_requests
             (student_id, parent_name, parent_mobile, parent_email, relation, status)
           VALUES ($1, $2, $3, $4, $5, 'PENDING')`,
          [student.id, parentName || null, parentMobile || null, parentEmail ? String(parentEmail).toLowerCase() : null, parentRelation]
        );
      }
    }
  });

  return getProfileByUserId(userId);
}

module.exports = {
  getSetupOptions,
  getProfileByUserId,
  getProfileStatus,
  completeProfile,
};
