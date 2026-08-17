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

  return { schools: Array.from(bySchool.values()) };
}

async function getProfileByUserId(userId) {
  const { rows: [profile] } = await query(
    `SELECT s.id,
            s.user_id,
            s.school_id,
            s.class_id,
            s.roll_number,
            s.academic_year,
            s.date_of_birth,
            s.gender,
            s.status,
            s.xp_total,
            s.xp_level,
            s.streak_current,
            s.streak_best,
            u.name,
            u.mobile,
            u.language,
            u.profile_photo,
            sch.name AS school_name,
            sc.class_name,
            sc.section
     FROM students s
     JOIN users u ON u.id = s.user_id
     JOIN schools sch ON sch.id = s.school_id
     JOIN school_classes sc ON sc.id = s.class_id
     WHERE s.user_id = $1`,
    [userId]
  );

  if (!profile) return null;

  return {
    id: profile.id,
    userId: profile.user_id,
    name: profile.name,
    mobile: profile.mobile,
    language: profile.language,
    profilePhoto: profile.profile_photo,
    schoolId: profile.school_id,
    schoolName: profile.school_name,
    classId: profile.class_id,
    className: profile.class_name,
    section: profile.section,
    classLabel: `${profile.class_name}-${profile.section}`,
    rollNumber: profile.roll_number,
    academicYear: profile.academic_year,
    dateOfBirth: profile.date_of_birth,
    gender: profile.gender,
    status: profile.status,
    xpTotal: profile.xp_total,
    xpLevel: profile.xp_level,
    streakCurrent: profile.streak_current,
    streakBest: profile.streak_best,
  };
}

async function getProfileStatus(userId) {
  const profile = await getProfileByUserId(userId);
  return {
    complete: Boolean(profile),
    profile,
  };
}

async function completeProfile(userId, payload) {
  const {
    name,
    language,
    schoolId,
    classId,
    dateOfBirth = null,
    gender = null,
  } = payload;

  return transaction(async (client) => {
    const { rows: [user] } = await client.query(
      `SELECT id, role, status
       FROM users
       WHERE id = $1
       FOR UPDATE`,
      [userId]
    );

    if (!user) throw notFound('User not found');
    if (user.role !== 'STUDENT') throw badRequest('Only Student users can create a Student profile');
    if (user.status !== 'ACTIVE') throw badRequest('Student user is not active');

    const { rows: [existing] } = await client.query(
      `SELECT id FROM students WHERE user_id = $1`,
      [userId]
    );

    if (existing) {
      return getProfileByUserId(userId);
    }

    const { rows: [classRow] } = await client.query(
      `SELECT sc.id,
              sc.school_id,
              sc.academic_year,
              sch.status AS school_status
       FROM school_classes sc
       JOIN schools sch ON sch.id = sc.school_id
       WHERE sc.id = $1 AND sc.school_id = $2`,
      [classId, schoolId]
    );

    if (!classRow) throw badRequest('Selected class does not belong to the selected school');
    if (classRow.school_status !== 'ACTIVE') throw badRequest('Selected school is not active');

    await client.query(
      `UPDATE users
       SET name = $1,
           language = $2,
           updated_at = NOW()
       WHERE id = $3`,
      [name.trim(), language, userId]
    );

    await client.query(
      `INSERT INTO students
         (user_id, school_id, class_id, academic_year, date_of_birth, gender)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId, schoolId, classId, classRow.academic_year, dateOfBirth, gender]
    );

    const { rows: [created] } = await client.query(
      `SELECT s.id,
              s.user_id,
              s.school_id,
              s.class_id,
              s.roll_number,
              s.academic_year,
              s.date_of_birth,
              s.gender,
              s.status,
              s.xp_total,
              s.xp_level,
              s.streak_current,
              s.streak_best,
              u.name,
              u.mobile,
              u.language,
              u.profile_photo,
              sch.name AS school_name,
              sc.class_name,
              sc.section
       FROM students s
       JOIN users u ON u.id = s.user_id
       JOIN schools sch ON sch.id = s.school_id
       JOIN school_classes sc ON sc.id = s.class_id
       WHERE s.user_id = $1`,
      [userId]
    );

    return {
      id: created.id,
      userId: created.user_id,
      name: created.name,
      mobile: created.mobile,
      language: created.language,
      profilePhoto: created.profile_photo,
      schoolId: created.school_id,
      schoolName: created.school_name,
      classId: created.class_id,
      className: created.class_name,
      section: created.section,
      classLabel: `${created.class_name}-${created.section}`,
      rollNumber: created.roll_number,
      academicYear: created.academic_year,
      dateOfBirth: created.date_of_birth,
      gender: created.gender,
      status: created.status,
      xpTotal: created.xp_total,
      xpLevel: created.xp_level,
      streakCurrent: created.streak_current,
      streakBest: created.streak_best,
    };
  });
}

module.exports = {
  getSetupOptions,
  getProfileByUserId,
  getProfileStatus,
  completeProfile,
};
