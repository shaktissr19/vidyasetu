#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_DIR="${PROJECT_DIR:-/var/www/vidyasetu}"
BACKUP_DIR="${BACKUP_DIR:-/root/vidyasetu-backups}"
CREDENTIALS_DIR="${CREDENTIALS_DIR:-/root/vidyasetu-credentials}"
BACKEND_ENV="${BACKEND_ENV:-$PROJECT_DIR/backend/.env}"
ALLOW_NON_ROOT="${ALLOW_NON_ROOT:-0}"
SKIP_BACKUP="${SKIP_BACKUP:-0}"

log() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
fail() { printf '\n\033[1;31mERROR: %s\033[0m\n' "$*" >&2; exit 1; }
read_env_value() {
  local key="$1" file="$2"
  grep -m1 -E "^${key}=" "$file" 2>/dev/null | cut -d= -f2- || true
}

generate_password() {
  node -e "const crypto=require('crypto'); process.stdout.write('Vs2!'+crypto.randomBytes(14).toString('base64url'))"
}

hash_password() {
  local value="$1"
  PASSWORD_VALUE="$value" node <<'NODE'
const crypto = require('crypto');
const password = process.env.PASSWORD_VALUE || '';
const salt = crypto.randomBytes(16);
crypto.scrypt(password, salt, 64, (err, key) => {
  if (err) throw err;
  process.stdout.write(`scrypt$${salt.toString('hex')}$${key.toString('hex')}`);
});
NODE
}

if [[ $EUID -ne 0 ]]; then
  [[ "$ALLOW_NON_ROOT" == "1" && "${CI:-}" == "true" ]] \
    || fail "Run this script as root on the VidyaSetu VPS. Non-root mode is CI-only."
fi
if [[ "$SKIP_BACKUP" == "1" ]]; then
  [[ "${CI:-}" == "true" ]] || fail "SKIP_BACKUP=1 is allowed only in CI. Production provisioning always creates a backup."
fi

[[ -d "$PROJECT_DIR/.git" ]] || fail "Repository not found at $PROJECT_DIR"
[[ -s "$BACKEND_ENV" ]] || fail "Missing backend environment file: $BACKEND_ENV"
[[ -s "$PROJECT_DIR/database/migrations/015_realistic_demo_identities.sql" ]] || fail "Migration 015 is missing"
command -v psql >/dev/null || fail "psql is not installed"
command -v pg_dump >/dev/null || fail "pg_dump is not installed"
command -v node >/dev/null || fail "node is not installed"

cd "$PROJECT_DIR"

DB_HOST="$(read_env_value DB_HOST "$BACKEND_ENV")"
DB_PORT="$(read_env_value DB_PORT "$BACKEND_ENV")"
DB_NAME="$(read_env_value DB_NAME "$BACKEND_ENV")"
DB_USER="$(read_env_value DB_USER "$BACKEND_ENV")"
DB_PASSWORD="$(read_env_value DB_PASSWORD "$BACKEND_ENV")"
REDIS_URL="$(read_env_value REDIS_URL "$BACKEND_ENV")"
DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-vidyasetu_db}"
DB_USER="${DB_USER:-postgres}"
[[ -n "$DB_PASSWORD" ]] || fail "DB_PASSWORD is missing from backend environment"
export PGPASSWORD="$DB_PASSWORD"

PSQL=(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -P pager=off)

"${PSQL[@]}" -Atc 'SELECT 1' >/dev/null || fail "Database credentials do not authenticate"

log "1/6 Create a safety backup before changing demo credentials"
mkdir -p "$BACKUP_DIR" "$CREDENTIALS_DIR"
chmod 700 "$CREDENTIALS_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_FILE="$BACKUP_DIR/vidyasetu_pre_demo_login_provision_$STAMP.dump"
if [[ "$SKIP_BACKUP" == "1" ]]; then
  printf 'CI mode: backup skipped by explicit CI-only flag.\n'
else
  pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -Fc > "$BACKUP_FILE"
  test -s "$BACKUP_FILE" || fail "Backup is empty"
  printf 'Backup: %s\n' "$BACKUP_FILE"
fi

log "2/6 Restore human-friendly legacy usernames"
"${PSQL[@]}" -f database/migrations/015_realistic_demo_identities.sql >/dev/null

log "3/6 Verify the five canonical demo identities"
DEMO_ROWS=(
  'SUPER_ADMIN|9000000000|Platform Admin'
  'SCHOOL_ADMIN|9100000001|School Admin'
  'TEACHER|9200000001|Teacher'
  'STUDENT|9300000001|Student'
  'PARENT|9400000001|Parent'
)

for row in "${DEMO_ROWS[@]}"; do
  IFS='|' read -r role mobile label <<< "$row"
  count="$("${PSQL[@]}" -Atc "SELECT COUNT(*) FROM users WHERE mobile='$mobile' AND role::text='$role';")"
  [[ "$count" == "1" ]] || fail "$label demo account $mobile is missing or has the wrong role"
done

log "4/6 Set strong passwords without storing plaintext in Git"
ADMIN_PASSWORD="${DEMO_PLATFORM_ADMIN_PASSWORD:-$(generate_password)}"
SCHOOL_PASSWORD="${DEMO_SCHOOL_ADMIN_PASSWORD:-$(generate_password)}"
TEACHER_PASSWORD="${DEMO_TEACHER_PASSWORD:-$(generate_password)}"
STUDENT_PASSWORD="${DEMO_STUDENT_PASSWORD:-$(generate_password)}"
PARENT_PASSWORD="${DEMO_PARENT_PASSWORD:-$(generate_password)}"

set_demo_password() {
  local mobile="$1" role="$2" password="$3" hash
  hash="$(hash_password "$password")"
  "${PSQL[@]}" -Atc "
    UPDATE users
       SET password_hash='$hash',
           password_changed_at=NOW(),
           must_change_password=FALSE,
           password_failed_attempts=0,
           password_locked_until=NULL,
           updated_at=NOW()
     WHERE mobile='$mobile' AND role::text='$role';
  " >/dev/null
}

set_demo_password '9000000000' 'SUPER_ADMIN' "$ADMIN_PASSWORD"
set_demo_password '9100000001' 'SCHOOL_ADMIN' "$SCHOOL_PASSWORD"
set_demo_password '9200000001' 'TEACHER' "$TEACHER_PASSWORD"
set_demo_password '9300000001' 'STUDENT' "$STUDENT_PASSWORD"
set_demo_password '9400000001' 'PARENT' "$PARENT_PASSWORD"

log "5/6 Clear only stale OTP state for the five synthetic demo mobiles"
if command -v redis-cli >/dev/null && [[ -n "$REDIS_URL" ]]; then
  redis-cli -u "$REDIS_URL" --no-auth-warning DEL \
    otp:9000000000 otp_attempts:9000000000 otp_lock:9000000000 \
    otp:9100000001 otp_attempts:9100000001 otp_lock:9100000001 \
    otp:9200000001 otp_attempts:9200000001 otp_lock:9200000001 \
    otp:9300000001 otp_attempts:9300000001 otp_lock:9300000001 \
    otp:9400000001 otp_attempts:9400000001 otp_lock:9400000001 >/dev/null || true
fi

log "6/6 Write credential sheet and verify password state"
CREDENTIALS_FILE="$CREDENTIALS_DIR/demo-logins-$STAMP.txt"
ADMIN_USERNAME="$("${PSQL[@]}" -Atc "SELECT username FROM users WHERE mobile='9000000000';")"
SCHOOL_USERNAME="$("${PSQL[@]}" -Atc "SELECT username FROM users WHERE mobile='9100000001';")"
TEACHER_USERNAME="$("${PSQL[@]}" -Atc "SELECT username FROM users WHERE mobile='9200000001';")"
STUDENT_USERNAME="$("${PSQL[@]}" -Atc "SELECT username FROM users WHERE mobile='9300000001';")"
PARENT_USERNAME="$("${PSQL[@]}" -Atc "SELECT username FROM users WHERE mobile='9400000001';")"
STUDENT_CODE="$("${PSQL[@]}" -Atc "SELECT COALESCE(s.student_code,'') FROM users u JOIN students s ON s.user_id=u.id WHERE u.mobile='9300000001';")"

cat > "$CREDENTIALS_FILE" <<EOF
VidyaSetu production demo logins
Generated: $(date --iso-8601=seconds)

Platform Admin
  Login ID: $ADMIN_USERNAME
  Mobile:   9000000000
  Password: $ADMIN_PASSWORD

School Admin
  Login ID: $SCHOOL_USERNAME
  Mobile:   9100000001
  Password: $SCHOOL_PASSWORD

Teacher
  Login ID: $TEACHER_USERNAME
  Mobile:   9200000001
  Password: $TEACHER_PASSWORD

Student
  Login ID: $STUDENT_USERNAME
  Student ID: $STUDENT_CODE
  Mobile:   9300000001
  Password: $STUDENT_PASSWORD

Parent
  Login ID: $PARENT_USERNAME
  Mobile:   9400000001
  Password: $PARENT_PASSWORD
EOF
chmod 600 "$CREDENTIALS_FILE"

"${PSQL[@]}" -c "
SELECT u.role,
       u.name,
       u.username AS login_id,
       u.mobile,
       s.student_code,
       CASE WHEN u.password_hash IS NULL THEN 'NO' ELSE 'YES' END AS password_configured
FROM users u
LEFT JOIN students s ON s.user_id=u.id
WHERE u.mobile IN ('9000000000','9100000001','9200000001','9300000001','9400000001')
ORDER BY CASE u.role::text
  WHEN 'SUPER_ADMIN' THEN 1
  WHEN 'SCHOOL_ADMIN' THEN 2
  WHEN 'TEACHER' THEN 3
  WHEN 'STUDENT' THEN 4
  WHEN 'PARENT' THEN 5
  ELSE 6 END;"

LONG_USERNAME_COUNT="$("${PSQL[@]}" -Atc "SELECT COUNT(*) FROM users WHERE username ~ '\\.[0-9a-f]{32}$';")"
[[ "$LONG_USERNAME_COUNT" == "0" ]] || fail "$LONG_USERNAME_COUNT legacy UUID-style usernames remain"

printf '\n\033[1;32mDemo password provisioning completed successfully.\033[0m\n'
printf 'Credential sheet: %s\n' "$CREDENTIALS_FILE"
printf 'Internal UUIDs are intentionally not used as login IDs.\n'
printf 'The synthetic 90/91/92/93/94 demo mobiles are suitable for password testing; real SMS OTP delivery requires an actual reachable registered mobile number.\n'
