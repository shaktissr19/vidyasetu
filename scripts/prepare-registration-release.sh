#!/usr/bin/env bash
# Explicit database change step; the native application deploy remains migration-free.
set -Eeuo pipefail
umask 077
PROJECT_DIR="${PROJECT_DIR:-/var/www/vidyasetu}"
BACKUP_DIR="${BACKUP_DIR:-/root/vidyasetu-backups}"
[[ $EUID -eq 0 ]] || { echo 'Run as root.' >&2; exit 1; }
cd "$PROJECT_DIR"
for command_name in node psql pg_dump pg_restore; do command -v "$command_name" >/dev/null; done
[[ -s backend/.env && -d backend/node_modules/dotenv ]] || { echo 'Existing backend/.env and backend dependencies are required.' >&2; exit 1; }
mapfile -t database_settings < <(node <<'NODE'
const fs = require('fs');
const env = require('./backend/node_modules/dotenv').parse(fs.readFileSync('backend/.env'));
for (const value of [env.DB_HOST || '127.0.0.1', env.DB_PORT || '5432', env.DB_NAME || 'vidyasetu_db', env.DB_USER || 'postgres', env.DB_PASSWORD || '']) {
  if (/[\r\n]/.test(value)) process.exit(1);
  console.log(value);
}
NODE
)
[[ ${#database_settings[@]} -eq 5 && -n "${database_settings[4]}" ]] || { echo 'Database configuration is incomplete.' >&2; exit 1; }
[[ "${database_settings[0]}" == localhost || "${database_settings[0]}" == 127.0.0.1 ]] || { echo 'This procedure requires native local PostgreSQL.' >&2; exit 1; }
export PGPASSWORD="${database_settings[4]}"
PSQL=(psql -h "${database_settings[0]}" -p "${database_settings[1]}" -d "${database_settings[2]}" -U "${database_settings[3]}" -v ON_ERROR_STOP=1)
for table in users schools teachers parent_link_requests audit_log learning_resources learning_assessments learning_concepts learning_questions learning_source_intake learning_content_sources curriculum_subjects curriculum_units curriculum_topics; do
  [[ "$("${PSQL[@]}" -Atc "SELECT to_regclass('public.$table') IS NOT NULL;")" == t ]] || { echo "Baseline table $table is missing. Stop and review the older migration path." >&2; exit 1; }
done
mkdir -p "$BACKUP_DIR"
BACKUP_FILE="$BACKUP_DIR/vidyasetu_before_registration_$(date +%Y%m%d_%H%M%S).dump"
pg_dump -h "${database_settings[0]}" -p "${database_settings[1]}" -d "${database_settings[2]}" -U "${database_settings[3]}" -Fc -f "$BACKUP_FILE"
test -s "$BACKUP_FILE"
pg_restore -l "$BACKUP_FILE" >/dev/null
printf 'Pre-migration backup: %s\n' "$BACKUP_FILE"

apply_if_missing() {
  local file="$1" invariant="$2"
  if [[ "$("${PSQL[@]}" -Atc "$invariant")" == t ]]; then
    printf 'Schema already present: %s\n' "$file"
  else
    printf 'Applying: %s\n' "$file"
    "${PSQL[@]}" -f "database/migrations/$file"
  fi
}
apply_if_missing 044_learning_entitlements_canonical_runtime.sql "SELECT to_regclass('public.learning_entitlements') IS NOT NULL AND (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('learning_resources','learning_assessments') AND column_name='access_requirement')=2;"
apply_if_missing 045_learning_ai_content_creator.sql "SELECT to_regclass('public.learning_creator_jobs') IS NOT NULL AND to_regclass('public.learning_creator_sources') IS NOT NULL AND to_regclass('public.learning_creator_outputs') IS NOT NULL;"
apply_if_missing 046_learning_creator_source_discovery.sql "SELECT to_regclass('public.learning_source_discovery_candidates') IS NOT NULL AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='learning_creator_jobs' AND column_name='submitted_to_learning_at');"
apply_if_missing 047_learning_source_registry_video_discovery.sql "SELECT to_regclass('public.learning_source_connectors') IS NOT NULL AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='learning_source_discovery_candidates' AND column_name='media_kind');"
apply_if_missing 048_learning_content_factory_foundation.sql "SELECT to_regclass('public.learning_content_packs') IS NOT NULL AND to_regclass('public.learning_content_pack_items') IS NOT NULL;"
apply_if_missing 049_learning_source_library_handoff.sql "SELECT (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='learning_source_intake' AND column_name IN ('licence_verified_at','imported_resource_id'))=2;"
# Always reapply 050: its data normalization and duplicate-pair protection are idempotent.
"${PSQL[@]}" -f database/migrations/050_unified_registration_role_linking.sql
[[ "$("${PSQL[@]}" -Atc "SELECT to_regclass('public.teacher_school_requests') IS NOT NULL AND (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='parent_link_requests' AND column_name IN ('initiated_by','requested_by_user_id','student_confirmed_at','parent_confirmed_at','school_confirmed_at','reviewed_by'))=6;")" == t ]]
apply_if_missing 051_learning_content_pipeline.sql "SELECT to_regclass('public.learning_content_assets') IS NOT NULL AND to_regclass('public.learning_content_pipeline_events') IS NOT NULL AND (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='learning_resources' AND column_name IN ('delivery_mode','rights_status','asset_id'))=3 AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='learning_source_intake' AND column_name='category');"
[[ "$("${PSQL[@]}" -Atc "SELECT to_regclass('public.learning_content_assets') IS NOT NULL AND to_regclass('public.learning_content_pipeline_events') IS NOT NULL;")" == t ]] || { echo 'Content Pipeline migration 051 did not complete.' >&2; exit 1; }
apply_if_missing 052_learning_content_integration.sql "SELECT to_regclass('public.learning_resource_revisions') IS NOT NULL AND (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='learning_resources' AND column_name IN ('difficulty','transcript','alt_text'))=3;"
apply_if_missing 053_verified_syllabus_workspace.sql "SELECT to_regclass('public.curriculum_topic_concepts') IS NOT NULL AND to_regclass('public.student_learning_preferences') IS NOT NULL AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='curriculum_versions' AND column_name='verified_at');"
apply_if_missing 054_syllabus_document_library.sql "SELECT to_regclass('public.syllabus_documents') IS NOT NULL AND (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='syllabus_documents' AND column_name IN ('outline','redistribution_allowed','source_url'))=3;"
apply_if_missing 055_syllabus_publication_progress.sql "SELECT to_regclass('public.student_syllabus_progress') IS NOT NULL AND to_regclass('public.syllabus_class_coverage') IS NOT NULL AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='curriculum_versions' AND column_name='publication_status');"
unset PGPASSWORD
echo 'Registration and Content Pipeline database preparation passed. Deploy using scripts/deploy-main-native.sh.'
