import type { QueryResultRow } from 'pg';
import type { UUID } from '@vidyasetu/contracts';
import { query, transaction } from '../config/db';
import { getPagination, paginationMeta } from '../utils/paginate';

export interface AdminPaginationQuery { page?: unknown; limit?: unknown; }
export interface SchoolFilters { status?: string; state?: string; plan?: string; search?: string; }
export interface UserFilters { role?: string; status?: string; search?: string; }
interface CountRow extends QueryResultRow { count: string; }
interface RevenueRow extends QueryResultRow { mrr: string | number; arr?: string | number; active_subscriptions?: string | number; }
interface MutableRow extends QueryResultRow { id: UUID; [key: string]: unknown; }

export async function getPlatformAnalytics() {
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
    query<RevenueRow>(`
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

  const { rows: topStates } = await query(`
    SELECT sch.state, COUNT(st.id) AS student_count
    FROM students st
    JOIN schools sch ON sch.id = st.school_id
    WHERE st.status = 'ACTIVE'
    GROUP BY sch.state ORDER BY student_count DESC LIMIT 8
  `);

  const { rows: pendingSchools } = await query(`
    SELECT s.id, s.name, s.district, s.state, s.udise_code, s.created_at, u.mobile AS admin_mobile
    FROM schools s JOIN users u ON u.id = s.admin_user_id
    WHERE s.status = 'PENDING'
    ORDER BY s.created_at ASC LIMIT 20
  `);

  return {
    students: students.rows[0],
    schools: schools.rows[0],
    mrr: revenue.rows[0]?.mrr ?? 0,
    dau: engagement.rows[0]?.dau,
    topStates,
    pendingSchools,
  };
}

export async function updateSchoolStatus(schoolId: UUID, status: string, adminId: UUID) {
  const validStatuses = ['ACTIVE', 'SUSPENDED', 'PENDING'];
  if (!validStatuses.includes(status)) {
    throw Object.assign(new Error(`Invalid status: ${status}`), { statusCode: 400 });
  }

  return transaction(async (client) => {
    const { rows: [school] } = await client.query<MutableRow>(
      `UPDATE schools SET status = $1, ${status === 'ACTIVE' ? 'verified_at = NOW(), verified_by = $3, is_verified = TRUE,' : ''}
       updated_at = NOW()
       WHERE id = $2 RETURNING *`,
      status === 'ACTIVE' ? [status, schoolId, adminId] : [status, schoolId],
    );

    await client.query(
      `INSERT INTO audit_log (actor_id, action, target_type, target_id, new_value)
       VALUES ($1, $2, 'SCHOOL', $3, $4)`,
      [adminId, `SCHOOL_${status}`, schoolId, JSON.stringify({ status })],
    );
    return school;
  });
}

export async function listSchools(paginationQuery: AdminPaginationQuery, filters: SchoolFilters = {}) {
  const { limit, offset, page } = getPagination(paginationQuery);
  const conditions = ['1=1'];
  const params: unknown[] = [];
  let i = 1;

  if (filters.status) { conditions.push(`s.status = $${i++}`); params.push(filters.status); }
  if (filters.state) { conditions.push(`s.state = $${i++}`); params.push(filters.state); }
  if (filters.plan) { conditions.push(`s.plan = $${i++}`); params.push(filters.plan); }
  if (filters.search) { conditions.push(`s.name ILIKE $${i++}`); params.push(`%${filters.search}%`); }

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
    query<CountRow>(`SELECT COUNT(*) FROM schools s WHERE ${where}`, params),
  ]);
  return { schools: rows, meta: paginationMeta(Number.parseInt(countRow?.count || '0', 10), page, limit) };
}

export async function listUsers(paginationQuery: AdminPaginationQuery, filters: UserFilters = {}) {
  const { limit, offset, page } = getPagination(paginationQuery);
  const conditions = ['1=1'];
  const params: unknown[] = [];
  let i = 1;

  if (filters.role) { conditions.push(`role = $${i++}`); params.push(filters.role); }
  if (filters.status) { conditions.push(`status = $${i++}`); params.push(filters.status); }
  if (filters.search) {
    conditions.push(`(name ILIKE $${i} OR mobile ILIKE $${i})`);
    i += 1;
    params.push(`%${filters.search}%`);
  }

  const where = conditions.join(' AND ');
  const [{ rows }, { rows: [countRow] }] = await Promise.all([
    query(`SELECT id, name, mobile, role, status, language, last_login_at, created_at
           FROM users WHERE ${where} ORDER BY created_at DESC
           LIMIT $${i} OFFSET $${i + 1}`, [...params, limit, offset]),
    query<CountRow>(`SELECT COUNT(*) FROM users WHERE ${where}`, params),
  ]);
  return { users: rows, meta: paginationMeta(Number.parseInt(countRow?.count || '0', 10), page, limit) };
}

export async function updateUserStatus(targetUserId: UUID, status: string, adminId: UUID) {
  return transaction(async (client) => {
    const { rows: [user] } = await client.query<MutableRow>(
      `UPDATE users SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING id, name, role, status`,
      [status, targetUserId],
    );
    await client.query(
      `INSERT INTO audit_log (actor_id, action, target_type, target_id, new_value)
       VALUES ($1, $2, 'USER', $3, $4)`,
      [adminId, `USER_${status}`, targetUserId, JSON.stringify({ status })],
    );
    return user;
  });
}

export async function getRevenueAnalytics() {
  const { rows: [mrr] } = await query<RevenueRow>(`
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
  return { mrr: mrr?.mrr ?? 0, arr: mrr?.arr ?? 0, planBreakdown, monthlyTrend };
}

export async function getPlatformConfig() {
  const { rows } = await query(`SELECT key, value, description FROM platform_config ORDER BY key`);
  return rows;
}

export async function updatePlatformConfig(key: string, value: unknown, adminId: UUID) {
  const { rows: [cfg] } = await query<MutableRow>(
    `UPDATE platform_config SET value = $1, updated_by = $2, updated_at = NOW()
     WHERE key = $3 RETURNING *`,
    [value, adminId, key],
  );
  if (!cfg) throw Object.assign(new Error(`Config key '${key}' not found`), { statusCode: 404 });
  await query(
    `INSERT INTO audit_log (actor_id, action, target_type, new_value)
     VALUES ($1, 'CONFIG_UPDATE', 'PLATFORM_CONFIG', $2)`,
    [adminId, JSON.stringify({ key, value })],
  );
  return cfg;
}
