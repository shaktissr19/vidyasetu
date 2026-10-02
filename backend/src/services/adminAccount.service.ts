import { z } from 'zod';
import type { UUID } from '@vidyasetu/contracts';
import { transaction } from '../config/db';
import { hashPassword } from '../utils/password';

export const adminAccountSchema = z.object({
  name: z.string().trim().min(2).max(120),
  username: z.string().trim().min(3).max(60).regex(/^[A-Za-z0-9._-]+$/),
  mobile: z.string().regex(/^\d{10}$/),
  email: z.string().email().max(180).optional(),
  password: z.string().min(8).max(128).regex(/[A-Za-z]/).regex(/\d/),
});

export async function createPlatformAdmin(input: unknown, actorId: UUID | null) {
  const data = adminAccountSchema.parse(input);
  const passwordHash = await hashPassword(data.password);
  return transaction(async (client) => {
    // Serializes bootstrap and admin creation; bootstrap never promotes an existing user.
    await client.query("SELECT pg_advisory_xact_lock(hashtext('vidyasetu-admin-account-create'))");
    if (actorId) {
      const { rows } = await client.query("SELECT id FROM users WHERE id=$1 AND role='SUPER_ADMIN' AND status='ACTIVE' FOR SHARE", [actorId]);
      if (!rows.length) throw Object.assign(new Error('Active Platform Admin required'), { statusCode: 403 });
    } else {
      const { rows } = await client.query("SELECT id FROM users WHERE role='SUPER_ADMIN' LIMIT 1");
      if (rows.length) throw Object.assign(new Error('Platform Admin already exists. Use Admin User Management.'), { statusCode: 409 });
    }
    const email = data.email?.toLowerCase() || null;
    const username = data.username.toLowerCase();
    const { rows: duplicates } = await client.query(
      "SELECT id FROM users WHERE mobile=$1 OR LOWER(username)=$2 OR ($3::text IS NOT NULL AND LOWER(email)=$3)",
      [data.mobile, username, email],
    );
    if (duplicates.length) throw Object.assign(new Error('Mobile, username or email is already registered'), { statusCode: 409 });
    const { rows: [user] } = await client.query(
      `INSERT INTO users(name,username,mobile,email,password_hash,password_changed_at,role,status,language)
       VALUES($1,$2,$3,$4,$5,NOW(),'SUPER_ADMIN','ACTIVE','en')
       RETURNING id,name,username,mobile,email,role,status`,
      [data.name, username, data.mobile, email, passwordHash],
    );
    await client.query(
      `INSERT INTO audit_log(actor_id,actor_role,action,entity_type,entity_id,new_value)
       VALUES($1,'SUPER_ADMIN',$2,'user',$3,$4)`,
      [actorId || user.id, actorId ? 'PLATFORM_ADMIN_CREATED' : 'PLATFORM_ADMIN_BOOTSTRAPPED', user.id, JSON.stringify({ role: user.role, username: user.username })],
    );
    return user;
  });
}
