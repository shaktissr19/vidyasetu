#!/usr/bin/env bash
set -Eeuo pipefail

# Add VidyaSetu's synthetic automation records to an existing non-production DB.
# This script never creates, drops, truncates, or copies a database.
PROJECT_DIR="${PROJECT_DIR:-/var/www/vidyasetu}"
ENV_FILE="$PROJECT_DIR/backend/.env"
TARGET_DB="${TARGET_DB:-}"
CONFIRM_NONPRODUCTION_DB="${CONFIRM_NONPRODUCTION_DB:-}"
CREDENTIALS_DIR="${CREDENTIALS_DIR:-/root/vidyasetu-test-credentials}"

fail() { printf '\nERROR: %s\n' "$*" >&2; exit 1; }
read_env_value() {
  local key="$1" value
  value="$(grep -m1 -E "^${key}=" "$ENV_FILE" 2>/dev/null | cut -d= -f2- || true)"
  value="${value%$'\r'}"
  value="${value%\"}"; value="${value#\"}"
  value="${value%\'}"; value="${value#\'}"
  printf '%s' "$value"
}

[[ -d "$PROJECT_DIR/.git" ]] || fail "VidyaSetu repository not found at $PROJECT_DIR"
[[ -s "$ENV_FILE" ]] || fail "Missing $ENV_FILE"
[[ -s "$PROJECT_DIR/database/seeds/dev_seed.sql" ]] || fail "Base seed is missing"
[[ -s "$PROJECT_DIR/database/seeds/demo_network_expansion.sql" ]] || fail "Expansion seed is missing"
[[ -s "$PROJECT_DIR/database/seeds/03_student_seed_reconcile.sql" ]] || fail "Student reconcile seed is missing"
[[ -s "$PROJECT_DIR/database/seeds/04_student_seed_validate.sql" ]] || fail "Student validation seed is missing"
[[ -s "$PROJECT_DIR/database/seeds/05_student_module_seed.sql" ]] || fail "Student module seed is missing"
[[ -s "$PROJECT_DIR/scripts/seed-demo-network.cjs" ]] || fail "Guarded expansion runner is missing"
[[ -s "$PROJECT_DIR/backend/dist/config/db.js" ]] || fail "Backend build is missing"
[[ -s "$PROJECT_DIR/backend/dist/utils/password.js" ]] || fail "Backend password utility build is missing"
command -v psql >/dev/null || fail "psql is not installed"
command -v node >/dev/null || fail "Node.js is not installed"

APP_DB_NAME="$(read_env_value DB_NAME)"
APP_DB_NAME="${APP_DB_NAME:-vidyasetu_db}"
TARGET_DB="${TARGET_DB:-$APP_DB_NAME}"
[[ "$TARGET_DB" =~ ^[A-Za-z0-9_-]+$ ]] || fail "TARGET_DB may contain only letters, digits, underscores, or hyphens."
if [[ -z "$CONFIRM_NONPRODUCTION_DB" ]]; then
  printf 'Configured target database: %s\n' "$TARGET_DB"
  read -r -p 'Type this exact name to confirm it is non-production and authorize additive seed data: ' CONFIRM_NONPRODUCTION_DB
fi
[[ "$CONFIRM_NONPRODUCTION_DB" == "$TARGET_DB" ]] || fail "Set CONFIRM_NONPRODUCTION_DB to the same exact name after verifying TARGET_DB is non-production."

DB_AUTH_MODE="${DB_AUTH_MODE:-password}"
if [[ "$DB_AUTH_MODE" == "peer" ]]; then
  [[ "$(id -un)" == "postgres" ]] || fail "Peer mode must run as the OS postgres user: runuser -u postgres -- env DB_AUTH_MODE=peer ..."
  # Use the VPS PostgreSQL Unix socket. This avoids requiring or changing a DB password.
  DB_HOST="/var/run/postgresql"
  DB_PORT="$(read_env_value DB_PORT)"; DB_PORT="${DB_PORT:-5432}"
  DB_USER="postgres"
  DB_PASSWORD=""
elif [[ "$DB_AUTH_MODE" == "password" ]]; then
  DB_HOST="${DB_HOST:-$(read_env_value DB_HOST)}"; DB_HOST="${DB_HOST:-127.0.0.1}"
  DB_PORT="${DB_PORT:-$(read_env_value DB_PORT)}"; DB_PORT="${DB_PORT:-5432}"
  DB_USER="${DB_USER:-$(read_env_value DB_USER)}"; DB_USER="${DB_USER:-postgres}"
  DB_PASSWORD="${DB_PASSWORD:-$(read_env_value DB_PASSWORD)}"
  [[ -n "$DB_PASSWORD" ]] || fail "DB_PASSWORD is missing from backend/.env"
else
  fail "DB_AUTH_MODE must be password or peer."
fi

export PGPASSWORD="$DB_PASSWORD" DB_HOST DB_PORT DB_USER DB_PASSWORD
export CONFIRM_NONPRODUCTION_DB
PSQL=(psql -X -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -v ON_ERROR_STOP=1 -P pager=off)
exists="$("${PSQL[@]}" -d postgres -Atc "SELECT COUNT(*) FROM pg_database WHERE datname = '$TARGET_DB'")"
[[ "$exists" == "1" ]] || fail "Database '$TARGET_DB' does not exist on $DB_HOST:$DB_PORT. No database was created."

actual_db="$("${PSQL[@]}" -d "$TARGET_DB" -Atc 'SELECT current_database()')"
[[ "$actual_db" == "$TARGET_DB" ]] || fail "Connected to '$actual_db', expected '$TARGET_DB'."
printf 'Target verified: existing database %s on %s:%s. No database DDL will be run.\n' "$TARGET_DB" "$DB_HOST" "$DB_PORT"

# Fixed synthetic user IDs in database/seeds/dev_seed.sql (25 accounts).
base_ids="'00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000003',
'00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000011','00000000-0000-0000-0000-000000000012','00000000-0000-0000-0000-000000000013',
'00000000-0000-0000-0000-000000000020','00000000-0000-0000-0000-000000000021','00000000-0000-0000-0000-000000000022','00000000-0000-0000-0000-000000000023','00000000-0000-0000-0000-000000000024','00000000-0000-0000-0000-000000000025','00000000-0000-0000-0000-000000000026','00000000-0000-0000-0000-000000000027','00000000-0000-0000-0000-000000000028','00000000-0000-0000-0000-000000000029','00000000-0000-0000-0000-000000000030','00000000-0000-0000-0000-000000000031',
'00000000-0000-0000-0000-000000000040','00000000-0000-0000-0000-000000000041','00000000-0000-0000-0000-000000000042','00000000-0000-0000-0000-000000000043','00000000-0000-0000-0000-000000000044','00000000-0000-0000-0000-000000000045'"
base_count="$("${PSQL[@]}" -d "$TARGET_DB" -Atc "SELECT COUNT(*) FROM users WHERE id IN ($base_ids)")"
if [[ "$base_count" == "0" ]]; then
  printf 'Base synthetic accounts are absent; inserting the base seed in its own transaction.\\n'
  "${PSQL[@]}" -d "$TARGET_DB" -f "$PROJECT_DIR/database/seeds/dev_seed.sql"
  # A newly inserted canonical fixture is validated before module enrichment.
  for seed in database/seeds/03_student_seed_reconcile.sql database/seeds/04_student_seed_validate.sql; do
    "${PSQL[@]}" -d "$TARGET_DB" -f "$PROJECT_DIR/$seed"
  done
elif [[ "$base_count" == "25" ]]; then
  printf 'Base synthetic accounts already exist; preserving them and skipping fresh-database reconciliation.\\n'
else
  fail "Found $base_count of 25 base seed accounts. Stopped to avoid colliding with a partial seed; existing rows were not changed."
fi

# This module seed is idempotent and scoped to fixed demo fixture IDs.
"${PSQL[@]}" -d "$TARGET_DB" -f "$PROJECT_DIR/database/seeds/05_student_module_seed.sql"

# Expansion has 24 deterministic synthetic users. The runner now refuses partial
# overlaps and skips its SQL insert after a complete prior load.
export PROJECT_DIR TARGET_DB CREDENTIALS_DIR
install -d -m 700 "$CREDENTIALS_DIR"
umask 077
credentials_log="$CREDENTIALS_DIR/demo-network-accounts-$(date +%Y%m%d-%H%M%S).txt"
cd "$PROJECT_DIR"
SEED_DEMO_PASSWORDS=0 NODE_ENV=test DB_NAME="$TARGET_DB" TARGET_DB="$TARGET_DB" CREDENTIALS_DIR="$CREDENTIALS_DIR" \
  node scripts/seed-demo-network.cjs | tee "$credentials_log"
chmod 600 "$credentials_log"

# Configure dedicated automation principals on the target database only.
NODE_ENV=test DB_NAME="$TARGET_DB" TARGET_DB="$TARGET_DB" CREDENTIALS_DIR="$CREDENTIALS_DIR" node <<'NODE'
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const root = process.env.PROJECT_DIR;
const target = process.env.TARGET_DB;
require(path.join(root, 'backend/node_modules/dotenv')).config({ path: path.join(root, 'backend/.env') });
process.env.DB_NAME = target;
process.env.NODE_ENV = 'test';
const { pool } = require(path.join(root, 'backend/dist/config/db'));
const { hashPassword } = require(path.join(root, 'backend/dist/utils/password'));
const id = (suffix) => `00000000-0000-0000-0000-${Number(suffix).toString(16).padStart(12, '0')}`;
const accounts = [
  { key: 'SUPER_ADMIN', id: id(1), role: 'SUPER_ADMIN' },
  { key: 'SCHOOL_ADMIN', id: id(0x52), role: 'SCHOOL_ADMIN' },
  { key: 'TEACHER', id: id(0x14), role: 'TEACHER' },
  { key: 'IDOR_CALLER', id: id(0x32), role: 'STUDENT' },
  { key: 'IDOR_OWNER', id: id(0x33), role: 'STUDENT' },
  { key: 'STUDENT', id: id(0x34), role: 'STUDENT' },
  { key: 'PARENT', id: id(0x46), role: 'PARENT' },
];
const password = () => `VSqa!${crypto.randomBytes(18).toString('base64url')}9`;

(async () => {
  const { rows: [database] } = await pool.query('SELECT current_database() AS name');
  if (database.name !== target) throw new Error(`Refusing to provision accounts in ${database.name}; expected ${target}`);
  const envPath = path.join(process.env.CREDENTIALS_DIR, 'api-test.env');
  if (fs.existsSync(envPath)) {
    const firstLine = fs.readFileSync(envPath, 'utf8').split(/\r?\n/, 1)[0];
    if (!firstLine.includes(`for ${target}.`)) throw new Error(`Existing credentials file does not identify target ${target}; refusing to overwrite it.`);
    console.log(`Preserving existing automation credentials for ${target}: ${envPath}`);
    return;
  }
  const output = [];
  for (const account of accounts) {
    const { rows } = await pool.query('SELECT id, role, username, mobile FROM users WHERE id=$1', [account.id]);
    if (rows.length !== 1 || rows[0].role !== account.role) {
      throw new Error(`Expected one ${account.role} test user ${account.id}; found ${rows.length} with role ${rows[0]?.role || 'missing'}`);
    }
    const secret = password();
    const hash = await hashPassword(secret);
    await pool.query(`UPDATE users SET password_hash=$2, password_changed_at=NOW(), must_change_password=FALSE,
      password_failed_attempts=0, password_locked_until=NULL, updated_at=NOW() WHERE id=$1`, [account.id, hash]);
    output.push({ ...account, identifier: rows[0].username || rows[0].mobile, password: secret });
  }
  const byKey = Object.fromEntries(output.map((entry) => [entry.key, entry]));
  const env = [
    `# Automation-only credentials for ${target}. Keep this file private.`,
    ...output.flatMap((entry) => [`E2E_${entry.key}_IDENTIFIER=${entry.identifier}`, `E2E_${entry.key}_PASSWORD=${entry.password}`]),
    '',
  ].join('\n');
  fs.writeFileSync(envPath, env, { mode: 0o600 });
  fs.chmodSync(envPath, 0o600);
  console.log(`Generated automation login settings for ${target}: ${envPath}`);
})().catch((error) => {
  console.error(`Automation-account setup failed: ${error.message}`);
  process.exitCode = 1;
}).finally(async () => pool.end());
NODE

printf '\nAdditive seed completed in existing database %s. No DB was created, dropped, truncated, or copied.\n' "$TARGET_DB"
printf 'Private account settings: %s/api-test.env\n' "$CREDENTIALS_DIR"
