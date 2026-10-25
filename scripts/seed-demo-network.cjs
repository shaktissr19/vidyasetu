#!/usr/bin/env node
'use strict';

// Run only against an explicitly named development, test, or staging database.
// Temporary passwords are generated on each run and printed once after commit.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const repoRoot = path.resolve(__dirname, '..');
require(path.join(repoRoot, 'backend/node_modules/dotenv')).config({
  path: path.join(repoRoot, 'backend/.env'),
});

const { pool } = require(path.join(repoRoot, 'backend/dist/config/db'));
const { hashPassword } = require(path.join(repoRoot, 'backend/dist/utils/password'));

const seedPath = path.join(repoRoot, 'database/seeds/demo_network_expansion.sql');
const userId = (suffix) => `00000000-0000-0000-0000-${Number(suffix).toString(16).padStart(12, '0')}`;
const userIds = [
  ...Array.from({ length: 7 }, (_, i) => userId(0x52 + i)),
  ...Array.from({ length: 8 }, (_, i) => userId(0x14 + i)),
  ...Array.from({ length: 3 }, (_, i) => userId(0x32 + i)),
  ...Array.from({ length: 6 }, (_, i) => userId(0x46 + i)),
];

function temporaryPassword() {
  return `VS!${crypto.randomBytes(12).toString('base64url')}9a`;
}

async function main() {
  if (!fs.existsSync(seedPath)) throw new Error(`Seed file not found: ${seedPath}`);
  const client = await pool.connect();
  try {
    const { rows: [db] } = await client.query('SELECT current_database() AS name');
    if (process.env.NODE_ENV === 'production' || !/(dev|test|stage|staging)/i.test(db.name)) {
      throw new Error(`Refusing to seed database "${db.name}". Use a dev, test, or staging database.`);
    }

    await client.query("SET app.allow_synthetic_seed = 'on'");
    await client.query(fs.readFileSync(seedPath, 'utf8'));

    const accounts = [];
    for (const id of userIds) {
      const password = temporaryPassword();
      accounts.push({ id, password, hash: await hashPassword(password) });
    }

    await client.query('BEGIN');
    try {
      for (const account of accounts) {
        const result = await client.query(
          `UPDATE users
             SET password_hash = $2,
                 password_changed_at = NOW(),
                 must_change_password = TRUE,
                 failed_login_attempts = 0,
                 locked_until = NULL,
                 updated_at = NOW()
           WHERE id = $1`,
          [account.id, account.hash],
        );
        if (result.rowCount !== 1) throw new Error(`Expected one seeded user for ${account.id}; found ${result.rowCount}`);
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }

    const { rows } = await client.query(
      `SELECT id, username, email, mobile, role
         FROM users WHERE id = ANY($1::uuid[])
         ORDER BY role, username`,
      [userIds],
    );
    if (rows.length !== userIds.length) throw new Error(`Credential report expected ${userIds.length} users, found ${rows.length}`);
    const byId = new Map(accounts.map((account) => [account.id, account.password]));
    console.log('\nTemporary demo account credentials (copy now; passwords are not saved in the repository):');
    console.log('role\tusername\temail\tmobile\ttemporary_password');
    for (const row of rows) {
      console.log(`${row.role}\t${row.username}\t${row.email}\t${row.mobile}\t${byId.get(row.id)}`);
    }
    console.log('\nEach account is flagged to change its password at first login. Re-running this command resets these demo accounts to new temporary passwords.');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(`Demo network seed failed: ${error.message}`);
  process.exitCode = 1;
});
