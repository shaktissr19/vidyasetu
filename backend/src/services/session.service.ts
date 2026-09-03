import type { QueryResultRow } from 'pg';
import type { UUID } from '@vidyasetu/contracts';
import { query } from '../config/db';
import { hashToken } from '../utils/jwt';

interface SessionRow extends QueryResultRow {
  id: UUID;
  device_info: string | null;
  ip_address: string | null;
  created_at: string | Date;
  expires_at: string | Date;
}

interface IdRow extends QueryResultRow {
  id: UUID;
}

export interface ActiveSession {
  id: UUID;
  deviceInfo: string | null;
  ipAddress: string | null;
  createdAt: string | Date;
  expiresAt: string | Date;
}

export async function listActiveSessions(userId: UUID): Promise<ActiveSession[]> {
  const { rows } = await query<SessionRow>(
    `SELECT id, device_info, ip_address, created_at, expires_at
     FROM refresh_tokens
     WHERE user_id = $1
       AND revoked_at IS NULL
       AND expires_at > NOW()
     ORDER BY created_at DESC`,
    [userId],
  );

  return rows.map((row) => ({
    id: row.id,
    deviceInfo: row.device_info,
    ipAddress: row.ip_address,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  }));
}

export async function revokeOtherSessions(
  userId: UUID,
  currentRefreshToken: string,
): Promise<{ revokedCount: number }> {
  const currentHash = hashToken(currentRefreshToken);
  const { rows: currentRows } = await query<IdRow>(
    `SELECT id
     FROM refresh_tokens
     WHERE user_id = $1
       AND token_hash = $2
       AND revoked_at IS NULL
       AND expires_at > NOW()
     LIMIT 1`,
    [userId, currentHash],
  );

  if (!currentRows.length) {
    throw Object.assign(new Error('Current session is no longer active. Please sign in again.'), { statusCode: 401 });
  }

  const result = await query(
    `UPDATE refresh_tokens
     SET revoked_at = NOW()
     WHERE user_id = $1
       AND token_hash <> $2
       AND revoked_at IS NULL
       AND expires_at > NOW()`,
    [userId, currentHash],
  );

  return { revokedCount: result.rowCount || 0 };
}
