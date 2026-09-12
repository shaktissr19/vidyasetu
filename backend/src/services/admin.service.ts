import type { QueryResultRow } from 'pg';
import type { UUID } from '@vidyasetu/contracts';
import { query, transaction } from '../config/db';
import { getPagination, paginationMeta } from '../utils/paginate';

export interface AdminPaginationQuery { page?: unknown; limit?: unknown; }
export interface SchoolFilters { status?: string; state?: string; plan?: string; search?: string; }
export interface UserFilters { role?: string; status?: string; search?: string; }
export interface SupportFilters { status?: string; priority?: string; search?: string; }
export interface AuditFilters { action?: string; entityType?: string; search?: string; }
export interface SupportTicketUpdate { status: string; resolution?: string | null; }
interface CountRow extends QueryResultRow { count: string; }
interface RevenueRow extends QueryResultRow { mrr: string | number; arr?: string | number; active_subscriptions?: string | number; }
interface MutableRow extends QueryResultRow { id: UUID; [key: string]: unknown; }
interface UserGovernanceRow extends QueryResultRow { id: UUID; name?: string | null; role: string; status: string; }
interface ConfigGovernanceRow extends QueryResultRow { key: string; value: string; description?: string | null; }
interface SupportGovernanceRow extends QueryResultRow {
  id: UUID;
  school_id?: UUID | null;
  status: string;
  resolution?: string | null;
  assigned_to?: UUID | null;
  [key: string]: unknown;
}

const currentSubscriptionCte = `
  WITH latest_subscription AS (
    SELECT DISTINCT ON (school_id)
           school_id, to_plan, amount_paid, valid_from, valid_until, created_at
    FROM subscription_events
    WHERE valid_from <= NOW()
    ORDER BY school_id, valid_from DESC, created_at DESC
  )
`;

function httpError(message: string, statusCode: number) {
  return Object.assign(new Error(message), { statusCode });
}

export async function getPlatformAnalytics() {
  const [students, schools, revenue, engagement, roleBreakdownResult] = await Promise.all([
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
    query<RevenueRow>(`${currentSubscriptionCte}
      SELECT COALESCE(SUM(amount_paid), 0) AS mrr
      FROM latest_subscription
      WHERE (valid_until IS NULL OR valid_until >= NOW())
        AND COALESCE(to_plan::text, 'FREE') != 'FREE'
    `),
    query(`
      SELECT COUNT(DISTINCT student_id) AS dau
      FROM xp_events
      WHERE created_at >= NOW() - INTERVAL '1 day'
    `),
    query(`SELECT role, COUNT(*) AS count FROM users WHERE status = 'ACTIVE' GROUP BY role ORDER BY role`),
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
    roleBreakdown: roleBreakdownResult.rows,
    topStates,
    pendingSchools,
  };
}

export async function updateSchoolStatus(schoolId: UUID, status: string, adminId: UUID) {
  const validStatuses = ['ACTIVE', 'SUSPENDED', 'PENDING'];
  if (!validStatuses.includes(status)) throw httpError(`Invalid status: ${status}`, 400);

  return transaction(async (client) => {
    const { rows: [current] } = await client.query<MutableRow>(
      `SELECT * FROM schools WHERE id = $1 FOR UPDATE`,
      [schoolId],
    );
    if (!current) throw httpError('School not found', 404);
    if (current.status === status) return current;

    const { rows: [school] } = await client.query<MutableRow>(
      `UPDATE schools
       SET status = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [status, schoolId],
    );

    await client.query(
      `INSERT INTO audit_log (actor_id, actor_role, school_id, action, entity_type, entity_id, old_value, new_value)
       VALUES ($1, 'SUPER_ADMIN', $2, $3, 'school', $2, $4, $5)`,
      [adminId, schoolId, `SCHOOL_${status}`, JSON.stringify({ status: current.status }), JSON.stringify({ status })],
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
  if (filters.search) {
    conditions.push(`(s.name ILIKE $${i} OR COALESCE(s.udise_code, '') ILIKE $${i})`);
    i += 1;
    params.push(`%${filters.search}%`);
  }

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

export async function getSchoolDetail(schoolId: UUID) {
  const { rows: [school] } = await query(
    `SELECT s.*, u.name AS admin_name, u.mobile AS admin_mobile, u.email AS admin_email,
            COUNT(DISTINCT st.id) FILTER (WHERE st.status = 'ACTIVE') AS student_count,
            COUNT(DISTINCT t.id) FILTER (WHERE t.status = 'ACTIVE') AS teacher_count,
            COUNT(DISTINCT sc.id) FILTER (WHERE sc.is_active = TRUE) AS class_count
     FROM schools s
     JOIN users u ON u.id = s.admin_user_id
     LEFT JOIN students st ON st.school_id = s.id
     LEFT JOIN teachers t ON t.school_id = s.id
     LEFT JOIN school_classes sc ON sc.school_id = s.id
     WHERE s.id = $1
     GROUP BY s.id, u.name, u.mobile, u.email`,
    [schoolId],
  );
  if (!school) throw httpError('School not found', 404);

  const { rows: recentActivity } = await query(
    `SELECT action,
            entity_type AS target_type,
            entity_id AS target_id,
            created_at
     FROM audit_log
     WHERE school_id = $1 OR (entity_type = 'school' AND entity_id = $1)
     ORDER BY created_at DESC LIMIT 10`,
    [schoolId],
  );
  return { ...school, recentActivity };
}

export async function listUsers(paginationQuery: AdminPaginationQuery, filters: UserFilters = {}) {
  const { limit, offset, page } = getPagination(paginationQuery);
  const conditions = ['1=1'];
  const params: unknown[] = [];
  let i = 1;

  if (filters.role) { conditions.push(`role = $${i++}`); params.push(filters.role); }
  if (filters.status) { conditions.push(`status = $${i++}`); params.push(filters.status); }
  if (filters.search) {
    conditions.push(`(name ILIKE $${i} OR mobile ILIKE $${i} OR COALESCE(email, '') ILIKE $${i})`);
    i += 1;
    params.push(`%${filters.search}%`);
  }

  const where = conditions.join(' AND ');
  const [{ rows }, { rows: [countRow] }] = await Promise.all([
    query(`SELECT id, name, mobile, email, role, status, language, last_login_at, created_at
           FROM users WHERE ${where} ORDER BY created_at DESC
           LIMIT $${i} OFFSET $${i + 1}`, [...params, limit, offset]),
    query<CountRow>(`SELECT COUNT(*) FROM users WHERE ${where}`, params),
  ]);
  return { users: rows, meta: paginationMeta(Number.parseInt(countRow?.count || '0', 10), page, limit) };
}

export async function updateUserStatus(targetUserId: UUID, status: string, adminId: UUID) {
  const validStatuses = ['ACTIVE', 'SUSPENDED', 'PENDING'];
  if (!validStatuses.includes(status)) throw httpError(`Invalid status: ${status}`, 400);

  return transaction(async (client) => {
    const { rows: [current] } = await client.query<UserGovernanceRow>(
      `SELECT id, name, role, status FROM users WHERE id = $1 FOR UPDATE`,
      [targetUserId],
    );
    if (!current) throw httpError('User not found', 404);
    if (current.role === 'SUPER_ADMIN' && status !== 'ACTIVE') {
      throw httpError('Super Admin accounts cannot be suspended or moved to pending state', 400);
    }
    if (targetUserId === adminId && status !== 'ACTIVE') {
      throw httpError('You cannot suspend your own admin account', 400);
    }
    if (current.status === status) return current;

    const { rows: [user] } = await client.query<MutableRow>(
      `UPDATE users SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING id, name, role, status`,
      [status, targetUserId],
    );
    await client.query(
      `INSERT INTO audit_log (actor_id, actor_role, action, entity_type, entity_id, old_value, new_value)
       VALUES ($1, 'SUPER_ADMIN', $2, 'user', $3, $4, $5)`,
      [adminId, `USER_${status}`, targetUserId, JSON.stringify({ status: current.status }), JSON.stringify({ status })],
    );
    return user;
  });
}

export async function getRevenueAnalytics() {
  const { rows: [mrr] } = await query<RevenueRow>(`${currentSubscriptionCte}
    SELECT
      COALESCE(SUM(amount_paid) FILTER (
        WHERE (valid_until IS NULL OR valid_until >= NOW())
          AND COALESCE(to_plan::text, 'FREE') != 'FREE'
      ), 0) AS mrr,
      COALESCE(SUM(amount_paid) FILTER (
        WHERE (valid_until IS NULL OR valid_until >= NOW())
          AND COALESCE(to_plan::text, 'FREE') != 'FREE'
      ), 0) * 12 AS arr,
      COUNT(*) FILTER (
        WHERE (valid_until IS NULL OR valid_until >= NOW())
          AND COALESCE(to_plan::text, 'FREE') != 'FREE'
      ) AS active_subscriptions
    FROM latest_subscription
  `);
  const { rows: planBreakdown } = await query(`${currentSubscriptionCte}
    SELECT COALESCE(to_plan::text, 'FREE') AS plan,
           COUNT(*) AS school_count,
           COALESCE(SUM(amount_paid), 0) AS monthly_revenue
    FROM latest_subscription
    WHERE valid_until IS NULL OR valid_until >= NOW()
    GROUP BY COALESCE(to_plan::text, 'FREE')
    ORDER BY monthly_revenue DESC
  `);
  const { rows: monthlyTrend } = await query(`
    SELECT TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') AS month,
           COALESCE(SUM(amount_paid), 0) AS revenue
    FROM subscription_events
    WHERE created_at >= NOW() - INTERVAL '12 months'
    GROUP BY DATE_TRUNC('month', created_at)
    ORDER BY DATE_TRUNC('month', created_at)
  `);
  return { mrr: mrr?.mrr ?? 0, arr: mrr?.arr ?? 0, activeSubscriptions: mrr?.active_subscriptions ?? 0, planBreakdown, monthlyTrend };
}

export async function getContentAnalytics() {
  const { rows: [totals] } = await query(`
    SELECT COUNT(*) FILTER (WHERE ci.type = 'VIDEO' AND ci.status = 'PUBLISHED') AS videos,
           COUNT(*) FILTER (WHERE ci.type IN ('PDF','NOTES') AND ci.status = 'PUBLISHED') AS documents,
           COUNT(DISTINCT ci.language) FILTER (WHERE ci.status = 'PUBLISHED') AS languages,
           COUNT(*) FILTER (WHERE ci.status = 'PUBLISHED') AS published_items,
           COUNT(*) FILTER (WHERE ci.status = 'DRAFT') AS draft_items
    FROM content_items ci
  `);
  const { rows: [quizTotals] } = await query(`SELECT COUNT(*) AS quiz_questions FROM quiz_questions`);
  const { rows: bySubject } = await query(`
    SELECT sub.id AS subject_id, sub.name AS subject_name, sub.code,
           COUNT(ci.id) FILTER (WHERE ci.type = 'VIDEO' AND ci.status = 'PUBLISHED') AS videos,
           COUNT(ci.id) FILTER (WHERE ci.type IN ('PDF','NOTES') AND ci.status = 'PUBLISHED') AS documents,
           COUNT(DISTINCT qq.id) AS quiz_questions,
           COUNT(DISTINCT ci.language) FILTER (WHERE ci.status = 'PUBLISHED') AS languages,
           COUNT(DISTINCT ch.id) AS chapters
    FROM subjects sub
    LEFT JOIN chapters ch ON ch.subject_id = sub.id AND ch.is_active = TRUE
    LEFT JOIN content_items ci ON ci.chapter_id = ch.id
    LEFT JOIN quiz_questions qq ON qq.content_item_id = ci.id
    WHERE sub.is_active = TRUE
    GROUP BY sub.id, sub.name, sub.code, sub.sort_order
    ORDER BY sub.sort_order, sub.name
  `);
  const { rows: recentItems } = await query(`
    SELECT ci.id, ci.title, ci.type, ci.status, ci.language, ci.created_at,
           ch.title AS chapter_title, sub.name AS subject_name
    FROM content_items ci
    JOIN chapters ch ON ch.id = ci.chapter_id
    JOIN subjects sub ON sub.id = ch.subject_id
    ORDER BY ci.created_at DESC LIMIT 10
  `);
  return {
    videos: totals?.videos ?? 0,
    documents: totals?.documents ?? 0,
    quizQuestions: quizTotals?.quiz_questions ?? 0,
    languages: totals?.languages ?? 0,
    publishedItems: totals?.published_items ?? 0,
    draftItems: totals?.draft_items ?? 0,
    bySubject,
    recentItems,
  };
}

export async function getPlatformConfig() {
  const { rows } = await query(`SELECT key, value, description FROM platform_config ORDER BY key`);
  return rows;
}

export async function updatePlatformConfig(key: string, value: unknown, adminId: UUID) {
  const storedValue = String(value);
  return transaction(async (client) => {
    const { rows: [current] } = await client.query<ConfigGovernanceRow>(
      `SELECT key, value, description FROM platform_config WHERE key = $1 FOR UPDATE`,
      [key],
    );
    if (!current) throw httpError(`Config key '${key}' not found`, 404);
    if (current.value === storedValue) return current;

    const { rows: [cfg] } = await client.query<ConfigGovernanceRow>(
      `UPDATE platform_config SET value = $1, updated_by = $2, updated_at = NOW()
       WHERE key = $3 RETURNING key, value, description`,
      [storedValue, adminId, key],
    );
    await client.query(
      `INSERT INTO audit_log (actor_id, actor_role, action, entity_type, old_value, new_value)
       VALUES ($1, 'SUPER_ADMIN', 'CONFIG_UPDATE', 'platform_config', $2, $3)`,
      [adminId, JSON.stringify({ key, value: current.value }), JSON.stringify({ key, value: storedValue })],
    );
    return cfg;
  });
}

export async function listSupportTickets(paginationQuery: AdminPaginationQuery, filters: SupportFilters = {}) {
  const { limit, offset, page } = getPagination(paginationQuery);
  const conditions = ['1=1'];
  const params: unknown[] = [];
  let i = 1;

  if (filters.status) { conditions.push(`st.status = $${i++}`); params.push(filters.status); }
  if (filters.priority) { conditions.push(`st.priority = $${i++}`); params.push(filters.priority); }
  if (filters.search) {
    params.push(`%${filters.search}%`);
    conditions.push(`(
      st.subject ILIKE $${i}
      OR st.description ILIKE $${i}
      OR COALESCE(raiser.name, '') ILIKE $${i}
      OR COALESCE(s.name, '') ILIKE $${i}
    )`);
    i += 1;
  }

  const where = conditions.join(' AND ');
  const from = `
    FROM support_tickets st
    JOIN users raiser ON raiser.id = st.raised_by
    LEFT JOIN users assignee ON assignee.id = st.assigned_to
    LEFT JOIN schools s ON s.id = st.school_id
  `;
  const [{ rows }, { rows: [countRow] }] = await Promise.all([
    query(`
      SELECT st.*, raiser.name AS raised_by_name, assignee.name AS assigned_to_name, s.name AS school_name
      ${from}
      WHERE ${where}
      ORDER BY
        CASE st.priority WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MEDIUM' THEN 3 ELSE 4 END,
        st.created_at DESC
      LIMIT $${i} OFFSET $${i + 1}
    `, [...params, limit, offset]),
    query<CountRow>(`SELECT COUNT(*) ${from} WHERE ${where}`, params),
  ]);
  return { tickets: rows, meta: paginationMeta(Number.parseInt(countRow?.count || '0', 10), page, limit) };
}

export async function updateSupportTicket(ticketId: UUID, patch: SupportTicketUpdate, adminId: UUID) {
  const validStatuses = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'];
  if (!validStatuses.includes(patch.status)) throw httpError(`Invalid ticket status: ${patch.status}`, 400);

  return transaction(async (client) => {
    const { rows: [current] } = await client.query<SupportGovernanceRow>(
      `SELECT * FROM support_tickets WHERE id = $1 FOR UPDATE`,
      [ticketId],
    );
    if (!current) throw httpError('Support ticket not found', 404);

    const finalResolution = patch.resolution === undefined ? current.resolution : patch.resolution;
    if (['RESOLVED', 'CLOSED'].includes(patch.status) && !String(finalResolution || '').trim()) {
      throw httpError('A resolution note is required before resolving or closing a support ticket', 400);
    }

    const { rows: [updated] } = await client.query<SupportGovernanceRow>(
      `UPDATE support_tickets
       SET status = $1::ticket_status,
           resolution = $2,
           assigned_to = CASE WHEN $1::ticket_status IN ('IN_PROGRESS'::ticket_status,'RESOLVED'::ticket_status,'CLOSED'::ticket_status) THEN $3 ELSE assigned_to END,
           closed_at = CASE WHEN $1::ticket_status IN ('RESOLVED'::ticket_status,'CLOSED'::ticket_status) THEN NOW() ELSE NULL END,
           updated_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [patch.status, finalResolution || null, adminId, ticketId],
    );

    await client.query(
      `INSERT INTO audit_log (actor_id, actor_role, school_id, action, entity_type, entity_id, old_value, new_value)
       VALUES ($1, 'SUPER_ADMIN', $2, $3, 'support_ticket', $4, $5, $6)`,
      [
        adminId,
        current.school_id || null,
        `SUPPORT_${patch.status}`,
        ticketId,
        JSON.stringify({ status: current.status, resolution: current.resolution || null, assigned_to: current.assigned_to || null }),
        JSON.stringify({ status: updated.status, resolution: updated.resolution || null, assigned_to: updated.assigned_to || null }),
      ],
    );
    return updated;
  });
}

export async function listAuditLog(paginationQuery: AdminPaginationQuery, filters: AuditFilters = {}) {
  const { limit, offset, page } = getPagination(paginationQuery);
  const conditions = ['1=1'];
  const params: unknown[] = [];
  let i = 1;

  if (filters.action) { conditions.push(`al.action = $${i++}`); params.push(filters.action); }
  if (filters.entityType) { conditions.push(`al.entity_type = $${i++}`); params.push(filters.entityType); }
  if (filters.search) {
    params.push(`%${filters.search}%`);
    conditions.push(`(
      al.action ILIKE $${i}
      OR COALESCE(al.entity_type, '') ILIKE $${i}
      OR COALESCE(actor.name, '') ILIKE $${i}
      OR COALESCE(s.name, '') ILIKE $${i}
      OR COALESCE(al.entity_id::text, '') ILIKE $${i}
    )`);
    i += 1;
  }

  const where = conditions.join(' AND ');
  const from = `
    FROM audit_log al
    LEFT JOIN users actor ON actor.id = al.actor_id
    LEFT JOIN schools s ON s.id = al.school_id
  `;
  const [{ rows }, { rows: [countRow] }] = await Promise.all([
    query(`
      SELECT al.id, al.actor_id, al.actor_role, al.school_id, al.action, al.entity_type, al.entity_id,
             al.old_value, al.new_value, al.ip_address, al.user_agent, al.created_at,
             actor.name AS actor_name, actor.mobile AS actor_mobile, s.name AS school_name
      ${from}
      WHERE ${where}
      ORDER BY al.created_at DESC
      LIMIT $${i} OFFSET $${i + 1}
    `, [...params, limit, offset]),
    query<CountRow>(`SELECT COUNT(*) ${from} WHERE ${where}`, params),
  ]);
  return { entries: rows, meta: paginationMeta(Number.parseInt(countRow?.count || '0', 10), page, limit) };
}
