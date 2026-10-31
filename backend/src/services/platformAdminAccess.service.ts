import type { QueryResultRow } from 'pg';
import type { RequestHandler } from 'express';
import type { UUID, UserRole } from '@vidyasetu/contracts';
import { query, transaction } from '../config/db';

export const PLATFORM_ADMIN_CAPABILITIES = ['SCHOOLS', 'USERS', 'CONTENT_ANALYTICS', 'COMPETITIONS', 'SUPPORT'] as const;
export type PlatformAdminCapability = typeof PLATFORM_ADMIN_CAPABILITIES[number];
export type AdminCapability = 'ANALYTICS' | PlatformAdminCapability;

interface CapabilityRow extends QueryResultRow { permission: PlatformAdminCapability; }
interface AdminRow extends QueryResultRow { id: UUID; name: string; username: string; email: string | null; mobile: string; status: string; created_at: string; permissions: PlatformAdminCapability[]; }

function httpError(message: string, statusCode: number) { return Object.assign(new Error(message), { statusCode }); }

export function validPlatformAdminCapabilities(values: unknown): values is PlatformAdminCapability[] {
  return Array.isArray(values) && values.every((value) => PLATFORM_ADMIN_CAPABILITIES.includes(value as PlatformAdminCapability)) && new Set(values).size === values.length;
}

export async function getCapabilities(userId: UUID, role: UserRole) {
  if (role === 'SUPER_ADMIN') return ['ANALYTICS', ...PLATFORM_ADMIN_CAPABILITIES] as AdminCapability[];
  if (role !== 'PLATFORM_ADMIN') return [] as AdminCapability[];
  const { rows } = await query<CapabilityRow>('SELECT permission FROM platform_admin_permissions WHERE user_id=$1 ORDER BY permission', [userId]);
  return ['ANALYTICS', ...rows.map((row) => row.permission)] as AdminCapability[];
}

export async function hasCapability(userId: UUID, capability: AdminCapability): Promise<boolean> {
  if (capability === 'ANALYTICS') return true;
  const { rows } = await query<{ allowed: boolean }>(
    'SELECT EXISTS(SELECT 1 FROM platform_admin_permissions WHERE user_id=$1 AND permission=$2) AS allowed', [userId, capability],
  );
  return rows[0]?.allowed === true;
}

export async function listPlatformAdmins(): Promise<AdminRow[]> {
  const { rows } = await query<AdminRow>(
    `SELECT u.id,u.name,u.username,u.email,u.mobile,u.status,u.created_at,
       COALESCE(array_agg(p.permission ORDER BY p.permission) FILTER (WHERE p.permission IS NOT NULL),'{}') AS permissions
     FROM users u LEFT JOIN platform_admin_permissions p ON p.user_id=u.id
     WHERE u.role='PLATFORM_ADMIN' GROUP BY u.id ORDER BY u.created_at DESC`,
  );
  return rows;
}

export async function setPlatformAdminCapabilities(targetUserId: UUID, actorId: UUID, capabilities: PlatformAdminCapability[]) {
  if (!validPlatformAdminCapabilities(capabilities)) throw httpError('Choose only supported Platform Admin access areas', 400);
  return transaction(async (client) => {
    const { rows: [actor] } = await client.query("SELECT id FROM users WHERE id=$1 AND role='SUPER_ADMIN' AND status='ACTIVE' FOR SHARE", [actorId]);
    if (!actor) throw httpError('Active Super Admin required', 403);
    const { rows: [target] } = await client.query<{ id: UUID; role: string }>('SELECT id,role FROM users WHERE id=$1 FOR UPDATE', [targetUserId]);
    if (!target) throw httpError('Platform Admin not found', 404);
    if (target.role !== 'PLATFORM_ADMIN') throw httpError('Access areas can only be changed for Platform Admin accounts', 409);
    const { rows: previous } = await client.query<CapabilityRow>('SELECT permission FROM platform_admin_permissions WHERE user_id=$1 ORDER BY permission', [targetUserId]);
    await client.query('DELETE FROM platform_admin_permissions WHERE user_id=$1', [targetUserId]);
    await client.query(
      `INSERT INTO platform_admin_permissions(user_id,permission,granted_by,granted_at)
       SELECT $1,permission,$2,NOW() FROM UNNEST($3::text[]) AS permission`, [targetUserId,actorId,capabilities],
    );
    await client.query(
      `INSERT INTO audit_log(actor_id,actor_role,action,entity_type,entity_id,old_value,new_value)
       VALUES($1,'SUPER_ADMIN','PLATFORM_ADMIN_PERMISSIONS_UPDATED','user',$2,$3::jsonb,$4::jsonb)`,
      [actorId,targetUserId,JSON.stringify({ permissions: previous.map((row) => row.permission) }),JSON.stringify({ permissions: capabilities })],
    );
    return { userId: targetUserId, permissions: capabilities };
  });
}

export function requirePlatformCapability(capability: AdminCapability): RequestHandler {
  return async (req, res, next) => {
    if (!req.user) { res.status(401).json({ success: false, message: 'Authentication required' }); return; }
    if (req.user.role === 'SUPER_ADMIN') { next(); return; }
    if (req.user.role !== 'PLATFORM_ADMIN') { res.status(403).json({ success: false, message: 'Administrator access required' }); return; }
    try {
      if (!(await hasCapability(req.user.userId, capability))) { res.status(403).json({ success: false, message: `Platform Admin access area not granted: ${capability}` }); return; }
      next();
    } catch (error: unknown) { next(error); }
  };
}
