#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_DIR="${PROJECT_DIR:-/var/www/vidyasetu}"
BACKUP_DIR="${BACKUP_DIR:-/root/vidyasetu-backups}"
BACKEND_ENV="$PROJECT_DIR/backend/.env"

log() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
fail() { printf '\n\033[1;31mERROR: %s\033[0m\n' "$*" >&2; exit 1; }
read_env_value() {
  local key="$1" file="$2"
  grep -m1 -E "^${key}=" "$file" 2>/dev/null | cut -d= -f2- || true
}

[[ $EUID -eq 0 ]] || fail "Run this script as root."
[[ -d "$PROJECT_DIR/.git" ]] || fail "Repository not found at $PROJECT_DIR"
[[ -s "$BACKEND_ENV" ]] || fail "Missing backend/.env"
command -v psql >/dev/null || fail "psql is not installed"
command -v pg_dump >/dev/null || fail "pg_dump is not installed"
systemctl is-active --quiet postgresql || fail "Native PostgreSQL is not active"

cd "$PROJECT_DIR"
[[ "$(git branch --show-current)" == "main" ]] || fail "Run from main branch"

DB_PORT="$(read_env_value DB_PORT "$BACKEND_ENV")"
DB_NAME="$(read_env_value DB_NAME "$BACKEND_ENV")"
DB_USER="$(read_env_value DB_USER "$BACKEND_ENV")"
DB_PASSWORD="$(read_env_value DB_PASSWORD "$BACKEND_ENV")"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-vidyasetu_db}"
DB_USER="${DB_USER:-postgres}"
[[ -n "$DB_PASSWORD" ]] || fail "DB_PASSWORD is missing from backend/.env"
export PGPASSWORD="$DB_PASSWORD"

psql -h 127.0.0.1 -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -Atc 'SELECT 1' >/dev/null \
  || fail "Database credentials do not authenticate"

log "1/4 Create safety backup"
mkdir -p "$BACKUP_DIR"
BACKUP_FILE="$BACKUP_DIR/vidyasetu_pre_realistic_demo_cleanup_$(date +%F_%H%M%S).dump"
pg_dump -h 127.0.0.1 -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -Fc > "$BACKUP_FILE"
test -s "$BACKUP_FILE" || fail "Backup is empty"
printf 'Backup: %s\n' "$BACKUP_FILE"

log "2/4 Apply realistic identity migration"
psql -h 127.0.0.1 -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
  -v ON_ERROR_STOP=1 -f database/migrations/015_realistic_demo_identities.sql

log "3/4 Align known demo schools to academic year 2026-27"
psql -h 127.0.0.1 -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
  -v ON_ERROR_STOP=1 -f database/migrations/016_demo_academic_year_alignment.sql

log "4/4 Verify representative integrated accounts and schools"
psql -h 127.0.0.1 -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -P pager=off -c "
SELECT u.role,
       u.name,
       u.username,
       u.email,
       u.mobile,
       s.student_code,
       sch.name AS school,
       sc.class_name,
       sc.section,
       COALESCE(s.academic_year, sch.academic_year) AS academic_year
FROM users u
LEFT JOIN students s ON s.user_id = u.id
LEFT JOIN schools sch ON sch.id = s.school_id
LEFT JOIN school_classes sc ON sc.id = s.class_id
WHERE u.mobile IN ('9300000001','9100000001','9400000001')
ORDER BY CASE u.role WHEN 'STUDENT' THEN 1 WHEN 'SCHOOL_ADMIN' THEN 2 WHEN 'PARENT' THEN 3 ELSE 4 END;"

psql -h 127.0.0.1 -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -P pager=off -c "
SELECT name, city, academic_year, total_students
FROM schools
WHERE id IN (
  '10000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000002'
)
ORDER BY name;"

LEGACY_COUNT="$(psql -h 127.0.0.1 -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -Atc "SELECT COUNT(*) FROM users WHERE username ~ '\\.[0-9a-f]{32}$';")"
[[ "$LEGACY_COUNT" == "0" ]] || fail "$LEGACY_COUNT UUID-style usernames remain"

printf '\n\033[1;32mRealistic demo-data cleanup completed successfully.\033[0m\n'
printf 'Backup retained: %s\n' "$BACKUP_FILE"
printf 'Passwords, Student IDs, School approval state and Parent links were preserved.\n'
