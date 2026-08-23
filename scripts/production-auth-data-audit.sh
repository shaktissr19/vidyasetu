#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_DIR="${PROJECT_DIR:-/var/www/vidyasetu}"
BACKEND_ENV="$PROJECT_DIR/backend/.env"

fail() { printf '\nERROR: %s\n' "$*" >&2; exit 1; }
read_env_value() {
  local key="$1" file="$2"
  grep -m1 -E "^${key}=" "$file" 2>/dev/null | cut -d= -f2- || true
}

[[ -d "$PROJECT_DIR/.git" ]] || fail "Repository not found at $PROJECT_DIR"
[[ -s "$BACKEND_ENV" ]] || fail "Missing backend/.env"
command -v psql >/dev/null || fail "psql is not installed"

DB_HOST="$(read_env_value DB_HOST "$BACKEND_ENV")"
DB_PORT="$(read_env_value DB_PORT "$BACKEND_ENV")"
DB_NAME="$(read_env_value DB_NAME "$BACKEND_ENV")"
DB_USER="$(read_env_value DB_USER "$BACKEND_ENV")"
DB_PASSWORD="$(read_env_value DB_PASSWORD "$BACKEND_ENV")"
DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-vidyasetu_db}"
DB_USER="${DB_USER:-postgres}"
[[ -n "$DB_PASSWORD" ]] || fail "DB_PASSWORD is missing from backend/.env"
export PGPASSWORD="$DB_PASSWORD"

PSQL=(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -P pager=off)

printf '\n========== VIDYASETU PRODUCTION AUTH / DATA AUDIT ==========\n'
printf 'Git HEAD: '
cd "$PROJECT_DIR"
git rev-parse HEAD
printf 'Branch:   '
git branch --show-current

printf '\n-- Canonical demo identities (no hashes/secrets) --\n'
"${PSQL[@]}" -c "
SELECT u.role,
       u.name,
       u.username AS login_id,
       u.mobile,
       u.email,
       s.student_code,
       CASE WHEN u.password_hash IS NULL THEN 'NO' ELSE 'YES' END AS password_configured,
       u.status
FROM users u
LEFT JOIN students s ON s.user_id = u.id
WHERE u.mobile IN ('9000000000','9100000001','9200000001','9300000001','9400000001')
ORDER BY CASE u.role::text
  WHEN 'SUPER_ADMIN' THEN 1
  WHEN 'SCHOOL_ADMIN' THEN 2
  WHEN 'TEACHER' THEN 3
  WHEN 'STUDENT' THEN 4
  WHEN 'PARENT' THEN 5
  ELSE 6 END;"

printf '\n-- Role counts --\n'
"${PSQL[@]}" -c "
SELECT role, COUNT(*) AS users
FROM users
GROUP BY role
ORDER BY role;"

printf '\n-- Core integrated demo-data volume --\n'
"${PSQL[@]}" -c "
SELECT 'schools' AS entity, COUNT(*)::bigint AS rows FROM schools
UNION ALL SELECT 'students', COUNT(*) FROM students
UNION ALL SELECT 'teachers', COUNT(*) FROM teachers
UNION ALL SELECT 'parent_student_links', COUNT(*) FROM parent_student_links
UNION ALL SELECT 'school_classes', COUNT(*) FROM school_classes
UNION ALL SELECT 'attendance', COUNT(*) FROM attendance
UNION ALL SELECT 'exams', COUNT(*) FROM exams
UNION ALL SELECT 'fee_invoices', COUNT(*) FROM fee_invoices
UNION ALL SELECT 'notifications', COUNT(*) FROM notifications
ORDER BY entity;"

printf '\n-- Human-friendly identity checks --\n'
"${PSQL[@]}" -c "
SELECT
  COUNT(*) FILTER (WHERE username IS NULL OR username = '') AS missing_usernames,
  COUNT(*) FILTER (WHERE username ~ '\\.[0-9a-f]{32}$') AS legacy_uuid_style_usernames,
  COUNT(*) FILTER (WHERE password_hash IS NOT NULL) AS users_with_password,
  COUNT(*) AS total_users
FROM users;"

printf '\n-- Representative School integration --\n'
"${PSQL[@]}" -c "
SELECT s.name,
       s.city,
       s.academic_year,
       COUNT(DISTINCT st.id) AS students,
       COUNT(DISTINCT t.id) AS teachers,
       COUNT(DISTINCT sc.id) AS classes
FROM schools s
LEFT JOIN students st ON st.school_id = s.id
LEFT JOIN teachers t ON t.school_id = s.id
LEFT JOIN school_classes sc ON sc.school_id = s.id
GROUP BY s.id, s.name, s.city, s.academic_year
ORDER BY s.name;"

printf '\n=============================================================\n'
printf 'Read-only audit complete. No database rows were changed.\n'
