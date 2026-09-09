#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_DIR="${PROJECT_DIR:-/var/www/vidyasetu}"
BACKEND_ENV="${BACKEND_ENV:-$PROJECT_DIR/backend/.env}"
BACKUP_DIR="${BACKUP_DIR:-/root/vidyasetu-backups}"
MIGRATION_FILE="$PROJECT_DIR/database/migrations/042_content_platform_v3.sql"
TARGET_BRANCH="${TARGET_BRANCH:-main}"

log() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
fail() { printf '\n\033[1;31mERROR: %s\033[0m\n' "$*" >&2; exit 1; }
read_env_value() {
  local key="$1" file="$2"
  grep -m1 -E "^${key}=" "$file" 2>/dev/null | cut -d= -f2- || true
}

trap 'printf "\nERROR: Content Platform 3.0 production migration failed at line %s. Review the last completed gate and the safety backup before retrying.\n" "$LINENO" >&2' ERR

[[ $EUID -eq 0 ]] || fail "Run this script as root on the VidyaSetu VPS."
[[ -d "$PROJECT_DIR/.git" ]] || fail "Repository not found at $PROJECT_DIR"
[[ -s "$BACKEND_ENV" ]] || fail "Missing backend environment file: $BACKEND_ENV"
[[ -s "$MIGRATION_FILE" ]] || fail "Content Platform migration 042 is missing: $MIGRATION_FILE"
for command_name in git psql pg_dump; do
  command -v "$command_name" >/dev/null || fail "$command_name is not installed."
done

cd "$PROJECT_DIR"
[[ "$(git branch --show-current)" == "$TARGET_BRANCH" ]] || fail "Controller checkout must be on $TARGET_BRANCH."
[[ -z "$(git status --porcelain --untracked-files=no)" ]] || fail "Tracked controller changes exist."
git fetch origin "$TARGET_BRANCH"
LOCAL_SHA="$(git rev-parse HEAD)"
REMOTE_SHA="$(git rev-parse "origin/$TARGET_BRANCH")"
[[ "$LOCAL_SHA" == "$REMOTE_SHA" ]] || fail "Local $TARGET_BRANCH is not origin/$TARGET_BRANCH. Run: git pull --ff-only origin $TARGET_BRANCH"
printf 'Migration release commit: %s\n' "$LOCAL_SHA"

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

log "1/5 Verify Content Platform 3.0 prerequisites"
for table_name in \
  education_boards education_grade_levels learning_content_sources \
  learning_resources learning_resource_grades learning_questions learning_question_grades \
  learning_assessments learning_quality_gate_reviews; do
  exists="$("${PSQL[@]}" -Atc "SELECT to_regclass('public.$table_name') IS NOT NULL;")"
  [[ "$exists" == "t" ]] || fail "Required prerequisite table '$table_name' is missing. Migration 042 was not attempted."
done

UPDATED_AT_FN="$("${PSQL[@]}" -Atc "SELECT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='update_updated_at');")"
[[ "$UPDATED_AT_FN" == "t" ]] || fail "Required update_updated_at function is missing. Migration 042 was not attempted."

ACTIVE_GRADES="$("${PSQL[@]}" -Atc "SELECT COUNT(*) FROM education_grade_levels WHERE is_active=TRUE;")"
[[ "$ACTIVE_GRADES" == "16" ]] || fail "Expected exactly 16 active canonical grades before Content Platform 3.0; found $ACTIVE_GRADES."
for grade in PRE_NURSERY NURSERY LKG UKG CLASS_1 CLASS_5 CLASS_8 CLASS_12; do
  [[ "$("${PSQL[@]}" -Atc "SELECT COUNT(*) FROM education_grade_levels WHERE code='$grade' AND is_active=TRUE;")" == "1" ]] \
    || fail "Canonical grade $grade is missing or duplicated. Migration 042 was not attempted."
done

log "2/5 Create mandatory pre-migration PostgreSQL backup"
mkdir -p "$BACKUP_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_FILE="$BACKUP_DIR/vidyasetu_pre_content_platform_v3_$STAMP.dump"
pg_dump -h 127.0.0.1 -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -Fc > "$BACKUP_FILE"
test -s "$BACKUP_FILE" || fail "Backup is empty. Migration 042 was not attempted."
printf 'Safety backup: %s\n' "$BACKUP_FILE"

log "3/5 Capture pre-migration publication invariants"
BEFORE_RESOURCES="$("${PSQL[@]}" -Atc "SELECT COUNT(*) FROM learning_resources WHERE review_status='PUBLISHED';")"
BEFORE_QUESTIONS="$("${PSQL[@]}" -Atc "SELECT COUNT(*) FROM learning_questions WHERE review_status='PUBLISHED';")"
BEFORE_ASSESSMENTS="$("${PSQL[@]}" -Atc "SELECT COUNT(*) FROM learning_assessments WHERE review_status='PUBLISHED';")"
printf 'Published resources before: %s\n' "$BEFORE_RESOURCES"
printf 'Published questions before: %s\n' "$BEFORE_QUESTIONS"
printf 'Published assessments before: %s\n' "$BEFORE_ASSESSMENTS"

log "4/5 Apply only additive/idempotent migration 042"
"${PSQL[@]}" -f "$MIGRATION_FILE"

log "5/5 Verify Content Platform 3.0 invariants"
for table_name in learning_assessment_grades learning_content_targets; do
  exists="$("${PSQL[@]}" -Atc "SELECT to_regclass('public.$table_name') IS NOT NULL;")"
  [[ "$exists" == "t" ]] || fail "Expected Content Platform table '$table_name' is missing after migration. Backup: $BACKUP_FILE"
done

for column_name in media_readiness transcript transcript_hi thumbnail_alt thumbnail_alt_hi; do
  exists="$("${PSQL[@]}" -Atc "SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='learning_resources' AND column_name='$column_name');")"
  [[ "$exists" == "t" ]] || fail "learning_resources.$column_name is missing after migration. Backup: $BACKUP_FILE"
done

NAME_HI_EXISTS="$("${PSQL[@]}" -Atc "SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='education_grade_levels' AND column_name='name_hi');")"
[[ "$NAME_HI_EXISTS" == "t" ]] || fail "education_grade_levels.name_hi is missing after migration. Backup: $BACKUP_FILE"
MISSING_GRADE_HI="$("${PSQL[@]}" -Atc "SELECT COUNT(*) FROM education_grade_levels WHERE is_active=TRUE AND NULLIF(BTRIM(name_hi),'') IS NULL;")"
[[ "$MISSING_GRADE_HI" == "0" ]] || fail "$MISSING_GRADE_HI active canonical grades are missing Hindi names. Backup: $BACKUP_FILE"

TARGET_COUNT="$("${PSQL[@]}" -Atc "SELECT COUNT(*) FROM learning_content_targets;")"
TARGET_GRADES="$("${PSQL[@]}" -Atc "SELECT COUNT(DISTINCT grade_id) FROM learning_content_targets;")"
[[ "$TARGET_COUNT" -gt 0 ]] || fail "Content production targets were not created. Backup: $BACKUP_FILE"
[[ "$TARGET_GRADES" == "16" ]] || fail "Content targets do not cover all 16 canonical grades; found $TARGET_GRADES. Backup: $BACKUP_FILE"

UNMAPPED_LEGACY_ASSESSMENTS="$("${PSQL[@]}" -Atc "SELECT COUNT(*) FROM learning_assessments la WHERE (la.class_min IS NOT NULL OR la.class_max IS NOT NULL) AND NOT EXISTS (SELECT 1 FROM learning_assessment_grades lag WHERE lag.assessment_id=la.id);")"
[[ "$UNMAPPED_LEGACY_ASSESSMENTS" == "0" ]] || fail "$UNMAPPED_LEGACY_ASSESSMENTS legacy class-ranged assessments lack canonical grade mappings. Backup: $BACKUP_FILE"

for trigger_name in trg_learning_resource_v3_publication trg_learning_question_v3_publication trg_learning_assessment_v3_publication; do
  [[ "$("${PSQL[@]}" -Atc "SELECT COUNT(*) FROM pg_trigger WHERE tgname='$trigger_name' AND NOT tgisinternal;")" == "1" ]] \
    || fail "Publication guard $trigger_name is missing after migration. Backup: $BACKUP_FILE"
done

for enum_label in STORY ACTIVITY FLASHCARD GAME SIMULATION PRACTICAL; do
  [[ "$("${PSQL[@]}" -Atc "SELECT COUNT(*) FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid WHERE t.typname='learning_resource_type' AND e.enumlabel='$enum_label';")" == "1" ]] \
    || fail "learning_resource_type.$enum_label is missing after migration. Backup: $BACKUP_FILE"
done

AFTER_RESOURCES="$("${PSQL[@]}" -Atc "SELECT COUNT(*) FROM learning_resources WHERE review_status='PUBLISHED';")"
AFTER_QUESTIONS="$("${PSQL[@]}" -Atc "SELECT COUNT(*) FROM learning_questions WHERE review_status='PUBLISHED';")"
AFTER_ASSESSMENTS="$("${PSQL[@]}" -Atc "SELECT COUNT(*) FROM learning_assessments WHERE review_status='PUBLISHED';")"
[[ "$AFTER_RESOURCES" == "$BEFORE_RESOURCES" ]] || fail "Migration changed published resource count: $BEFORE_RESOURCES -> $AFTER_RESOURCES. Backup: $BACKUP_FILE"
[[ "$AFTER_QUESTIONS" == "$BEFORE_QUESTIONS" ]] || fail "Migration changed published question count: $BEFORE_QUESTIONS -> $AFTER_QUESTIONS. Backup: $BACKUP_FILE"
[[ "$AFTER_ASSESSMENTS" == "$BEFORE_ASSESSMENTS" ]] || fail "Migration changed published assessment count: $BEFORE_ASSESSMENTS -> $AFTER_ASSESSMENTS. Backup: $BACKUP_FILE"

printf '\n\033[1;32mCONTENT PLATFORM 3.0 PRODUCTION MIGRATION COMPLETE\033[0m\n'
printf 'Commit: %s\n' "$LOCAL_SHA"
printf 'Content targets: %s across %s canonical grades\n' "$TARGET_COUNT" "$TARGET_GRADES"
printf 'Published resources unchanged: %s\n' "$AFTER_RESOURCES"
printf 'Published questions unchanged: %s\n' "$AFTER_QUESTIONS"
printf 'Published assessments unchanged: %s\n' "$AFTER_ASSESSMENTS"
printf 'Safety backup: %s\n' "$BACKUP_FILE"
printf 'Only migration 042 was executed. No dev seed, reset, full migration runner, Docker command, PM2 restart, or Nginx rewrite was executed.\n'
