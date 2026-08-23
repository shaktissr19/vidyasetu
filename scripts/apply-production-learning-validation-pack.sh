#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_DIR="${PROJECT_DIR:-/var/www/vidyasetu}"
BACKEND_ENV="${BACKEND_ENV:-$PROJECT_DIR/backend/.env}"
BACKUP_DIR="${BACKUP_DIR:-/root/vidyasetu-backups}"
MIGRATION_FILE="$PROJECT_DIR/database/migrations/025_learning_public_validation_pack.sql"

log() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
fail() { printf '\n\033[1;31mERROR: %s\033[0m\n' "$*" >&2; exit 1; }
read_env_value() {
  local key="$1" file="$2"
  grep -m1 -E "^${key}=" "$file" 2>/dev/null | cut -d= -f2- || true
}

[[ $EUID -eq 0 ]] || fail "Run this script as root on the VidyaSetu VPS."
[[ -d "$PROJECT_DIR/.git" ]] || fail "Repository not found at $PROJECT_DIR"
[[ -s "$BACKEND_ENV" ]] || fail "Missing backend environment file: $BACKEND_ENV"
[[ -s "$MIGRATION_FILE" ]] || fail "Migration 025 is missing: $MIGRATION_FILE"
command -v psql >/dev/null || fail "psql is not installed"
command -v pg_dump >/dev/null || fail "pg_dump is not installed"

cd "$PROJECT_DIR"
[[ "$(git branch --show-current)" == "main" ]] || fail "Controller checkout must be on main."
[[ -z "$(git status --porcelain --untracked-files=no)" ]] || fail "Tracked controller changes exist."

DB_HOST="$(read_env_value DB_HOST "$BACKEND_ENV")"
DB_PORT="$(read_env_value DB_PORT "$BACKEND_ENV")"
DB_NAME="$(read_env_value DB_NAME "$BACKEND_ENV")"
DB_USER="$(read_env_value DB_USER "$BACKEND_ENV")"
DB_PASSWORD="$(read_env_value DB_PASSWORD "$BACKEND_ENV")"
DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-vidyasetu_db}"
DB_USER="${DB_USER:-postgres}"
[[ "$DB_HOST" == "127.0.0.1" || "$DB_HOST" == "localhost" ]] || fail "DB_HOST must target native PostgreSQL; found '$DB_HOST'."
[[ -n "$DB_PASSWORD" ]] || fail "DB_PASSWORD is missing from backend/.env"
export PGPASSWORD="$DB_PASSWORD"
PSQL=(psql -h 127.0.0.1 -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -P pager=off)
"${PSQL[@]}" -Atc 'SELECT 1' >/dev/null || fail "Database credentials do not authenticate."

for table_name in learning_resources learning_content_sources education_grade_levels learning_resource_grades; do
  exists="$("${PSQL[@]}" -Atc "SELECT to_regclass('public.$table_name') IS NOT NULL;")"
  [[ "$exists" == "t" ]] || fail "Required Learning table '$table_name' is missing. Migration 025 was not attempted."
done

log "1/4 Create mandatory pre-migration PostgreSQL backup"
mkdir -p "$BACKUP_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_FILE="$BACKUP_DIR/vidyasetu_pre_learning_validation_pack_$STAMP.dump"
pg_dump -h 127.0.0.1 -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -Fc > "$BACKUP_FILE"
test -s "$BACKUP_FILE" || fail "Backup is empty. Migration was not attempted."
printf 'Safety backup: %s\n' "$BACKUP_FILE"

log "2/4 Capture pre-migration Learning counts"
BEFORE_PACK="$("${PSQL[@]}" -Atc "SELECT COUNT(*) FROM learning_resources WHERE id::text LIKE '89500000-0000-0000-0000-%';")"
BEFORE_PUBLIC="$("${PSQL[@]}" -Atc "SELECT COUNT(*) FROM learning_resources WHERE visibility='PUBLIC' AND review_status='PUBLISHED';")"
printf 'Validation-pack rows before: %s\n' "$BEFORE_PACK"
printf 'Public published resources before: %s\n' "$BEFORE_PUBLIC"

log "3/4 Apply only additive migration 025"
"${PSQL[@]}" -f "$MIGRATION_FILE"

log "4/4 Verify migration invariants"
AFTER_PACK="$("${PSQL[@]}" -Atc "SELECT COUNT(*) FROM learning_resources WHERE id::text LIKE '89500000-0000-0000-0000-%';")"
AFTER_PUBLIC="$("${PSQL[@]}" -Atc "SELECT COUNT(*) FROM learning_resources WHERE visibility='PUBLIC' AND review_status='PUBLISHED';")"
[[ "$AFTER_PACK" == "16" ]] || fail "Expected exactly 16 validation-pack resources; found $AFTER_PACK. Backup: $BACKUP_FILE"
[[ "$AFTER_PUBLIC" -ge "$BEFORE_PUBLIC" ]] || fail "Public Learning resource count decreased unexpectedly. Backup: $BACKUP_FILE"

for grade in PRE_NURSERY NURSERY CLASS_5 CLASS_8 CLASS_12; do
  mapped="$("${PSQL[@]}" -Atc "SELECT COUNT(DISTINCT lr.id) FROM learning_resources lr JOIN learning_resource_grades lrg ON lrg.resource_id=lr.id JOIN education_grade_levels egl ON egl.id=lrg.grade_id WHERE lr.id::text LIKE '89500000-0000-0000-0000-%' AND egl.code='$grade';")"
  [[ "$mapped" -ge 1 ]] || fail "Validation pack has no resource mapped to $grade. Backup: $BACKUP_FILE"
done

printf '\n\033[1;32mLearning validation pack applied and verified.\033[0m\n'
printf 'Validation-pack rows: %s\n' "$AFTER_PACK"
printf 'Public published resources: %s -> %s\n' "$BEFORE_PUBLIC" "$AFTER_PUBLIC"
printf 'Backup: %s\n' "$BACKUP_FILE"
printf 'No dev seed, reset, full migration runner, or destructive SQL was executed.\n'
