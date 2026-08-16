// services/admin.service.js
const { query, transaction } = require('../config/db');
const { getPagination, paginationMeta } = require('../utils/paginate');

/**
 * Platform-wide analytics overview.
 */
async function getPlatformAnalytics() {
  const [students, schools, revenue, engagement] = await Promise.all([
    query(`
      SELECT COUNT(*) AS total,
             COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days') AS new_this_month
      FROM students WHERE status = 'ACTIVE'
    `),
    query(`
      SELECT COUNT(*) AS total,
             COUNT(*) FILTER (WHERE status = 'ACTIVE') AS active,
             COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days') AS new_this_month,
             COUNT(*) FILTER (WHERE plan != 'FREE') AS paid
      FROM schools
    `),
    query(`
      SELECT COALESCE(SUM(amount), 0) AS mrr
      FROM subscription_events
      WHERE starts_at <= NOW() AND expires_at >= NOW()
    `),
    query(`
      SELECT COUNT(DISTINCT student_id) AS dau
      FROM xp_events
      WHERE created_at >= NOW() - INTERVAL '1 day'
    `),
  ]);

  // Top states by enrollment
  const { rows: topStates } = await query(`
    SELECT sch.state, COUNT(st.id) AS student_count
    FROM students st
    JOIN schools sch ON sch.id = st.school_id
    WHERE st.status = 'ACTIVE'
    GROUP BY sch.state ORDER BY student_count DESC LIMIT 8
  `);

  // Pending school approvals
  const { rows: pendingSchools } = await query(`
    SELECT s.id, s.name, s.district, s.state, s.udise_code, s.created_at, u.mobile AS admin_mobile
    FROM schools s JOIN users u ON u.id = s.admin_user_id
    WHERE s.status = 'PENDING'
    ORDER BY s.created_at ASC LIMIT 20
  `);

  return {
    students: students.rows[0],
    schools: schools.rows[0],
    mrr: revenue.rows[0].mrr,
    dau: engagement.rows[0].dau,
    topStates,
    pendingSchools,
  };
}

/**
 * Approve or suspend a school.
 */
async function updateSchoolStatus(schoolId, status, adminId) {
  const validStatuses = ['ACTIVE', 'SUSPENDED', 'PENDING'];
  if (!validStatuses.includes(status)) {
    throw Object.assign(new Error(`Invalid status: ${status}`), { statusCode: 400 });
  }

  return transaction(async (client) => {
    const { rows: [school] } = await client.query(
      `UPDATE schools SET status = $1, ${status === 'ACTIVE' ? 'verified_at = NOW(), verified_by = $3, is_verified = TRUE,' : ''}
       updated_at = NOW()
       WHERE id = $2 RETURNING *`,
      status === 'ACTIVE' ? [status, schoolId, adminId] : [status, schoolId]
    );

    // Audit log
    await client.query(
      `INSERT INTO audit_log (actor_id, action, target_type, target_id, new_value)
       VALUES ($1, $2, 'SCHOOL', $3, $4)`,
      [adminId, `SCHOOL_${status}`, schoolId, JSON.stringify({ status })]
    );

    return school;
  });
}

/**
 * List all schools with filters.
 */
async function listSchools(paginationQuery, filters = {}) {
  const { limit, offset, page } = getPagination(paginationQuery);
  const conditions = ['1=1'];
  const params = [];
  let i = 1;

  if (filters.status)   { conditions.push(`s.status = $${i++}`);   params.push(filters.status); }
  if (filters.state)    { conditions.push(`s.state = $${i++}`);    params.push(filters.state); }
  if (filters.plan)     { conditions.push(`s.plan = $${i++}`);     params.push(filters.plan); }
  if (filters.search)   { conditions.push(`s.name ILIKE $${i++}`); params.push(`%${filters.search}%`); }

  const where = conditions.join(' AND ');

  const [{ rows }, { rows: [countRow] }] = await Promise.all([
    query(`
      SELECT s.*, u.name AS admin_name, u.mobile AS admin_mobile,
             COUNT(st.id) AS student_count
      FROM schools s
      JOIN users u ON u.id = s.admin_user_id
      LEFT JOIN students st ON st.school_id = s.id AND st.status = 'ACTIVE'
      WHERE ${where}
      GROUP BY s.id, u.name, u.mobile
      ORDER BY s.created_at DESC
      LIMIT $${i} OFFSET $${i + 1}
    `, [...params, limit, offset]),
    query(`SELECT COUNT(*) FROM schools s WHERE ${where}`, params),
  ]);

  return { schools: rows, meta: paginationMeta(parseInt(countRow.count), page, limit) };
}

/**
 * List all users with filters.
 */
async function listUsers(paginationQuery, filters = {}) {
  const { limit, offset, page } = getPagination(paginationQuery);
  const conditions = ['1=1'];
  const params = [];
  let i = 1;

  if (filters.role)   { conditions.push(`role = $${i++}`);         params.push(filters.role); }
  if (filters.status) { conditions.push(`status = $${i++}`);       params.push(filters.status); }
  if (filters.search) { conditions.push(`(name ILIKE $${i} OR mobile ILIKE $${i})`); i++; params.push(`%${filters.search}%`); }

  const where = conditions.join(' AND ');

  const [{ rows }, { rows: [countRow] }] = await Promise.all([
    query(`SELECT id, name, mobile, role, status, language, last_login_at, created_at
           FROM users WHERE ${where} ORDER BY created_at DESC
           LIMIT $${i} OFFSET $${i + 1}`, [...params, limit, offset]),
    query(`SELECT COUNT(*) FROM users WHERE ${where}`, params),
  ]);

  return { users: rows, meta: paginationMeta(parseInt(countRow.count), page, limit) };
}

/**
 * Suspend or activate a user.
 */
async function updateUserStatus(targetUserId, status, adminId) {
  return transaction(async (client) => {
    const { rows: [user] } = await client.query(
      `UPDATE users SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING id, name, role, status`,
      [status, targetUserId]
    );

    await client.query(
      `INSERT INTO audit_log (actor_id, action, target_type, target_id, new_value)
       VALUES ($1, $2, 'USER', $3, $4)`,
      [adminId, `USER_${status}`, targetUserId, JSON.stringify({ status })]
    );

    return user;
  });
}

/**
 * Revenue dashboard.
 */
async function getRevenueAnalytics() {
  const { rows: [mrr] } = await query(`
    SELECT
      COALESCE(SUM(amount), 0) AS mrr,
      COALESCE(SUM(amount) * 12, 0) AS arr,
      COUNT(*) AS active_subscriptions
    FROM subscription_events
    WHERE starts_at <= NOW() AND expires_at >= NOW()
  `);

  const { rows: planBreakdown } = await query(`
    SELECT plan, COUNT(*) AS school_count,
           COALESCE(SUM(amount), 0) AS monthly_revenue
    FROM subscription_events
    WHERE starts_at <= NOW() AND expires_at >= NOW()
    GROUP BY plan ORDER BY monthly_revenue DESC
  `);

  const { rows: monthlyTrend } = await query(`
    SELECT TO_CHAR(starts_at, 'YYYY-MM') AS month, SUM(amount) AS revenue
    FROM subscription_events
    WHERE starts_at >= NOW() - INTERVAL '12 months'
    GROUP BY month ORDER BY month
  `);

  return { mrr: mrr.mrr, arr: mrr.arr, planBreakdown, monthlyTrend };
}

/**
 * Get platform config.
 */
async function getPlatformConfig() {
  const { rows } = await query(`SELECT key, value, description FROM platform_config ORDER BY key`);
  return rows;
}

/**
 * Update a platform config key.
 */
async function updatePlatformConfig(key, value, adminId) {
  const { rows: [cfg] } = await query(
    `UPDATE platform_config SET value = $1, updated_by = $2, updated_at = NOW()
     WHERE key = $3 RETURNING *`,
    [value, adminId, key]
  );
  if (!cfg) throw Object.assign(new Error(`Config key '${key}' not found`), { statusCode: 404 });

  await query(
    `INSERT INTO audit_log (actor_id, action, target_type, new_value)
     VALUES ($1, 'CONFIG_UPDATE', 'PLATFORM_CONFIG', $2)`,
    [adminId, JSON.stringify({ key, value })]
  );

  return cfg;
}

module.exports = {
  getPlatformAnalytics,
  updateSchoolStatus, listSchools,
  listUsers, updateUserStatus,
  getRevenueAnalytics,
  getPlatformConfig, updatePlatformConfig,
};
