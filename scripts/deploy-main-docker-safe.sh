#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_DIR="${PROJECT_DIR:-/var/www/vidyasetu}"
TARGET_BRANCH="main"
DB_CONTAINER="${DB_CONTAINER:-vidyasetu_postgres}"
DB_NAME="${DB_NAME:-vidyasetu_db}"
DB_USER="${DB_USER:-postgres}"
BACKUP_DIR="${BACKUP_DIR:-/root/vidyasetu-backups}"
API_BASE="${API_BASE:-http://127.0.0.1:5001/api/v1}"
WEB_BASE="${WEB_BASE:-http://127.0.0.1:3001}"
PUBLIC_WEB="${PUBLIC_WEB:-https://vidyasetu.sbs}"

log() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
fail() { printf '\n\033[1;31mERROR: %s\033[0m\n' "$*" >&2; exit 1; }

[[ -d "$PROJECT_DIR/.git" ]] || fail "Repository not found at $PROJECT_DIR"
command -v git >/dev/null || fail "git is not installed"
command -v docker >/dev/null || fail "docker is not installed"
docker compose version >/dev/null 2>&1 || fail "docker compose is not available"
command -v curl >/dev/null || fail "curl is not installed"
command -v jq >/dev/null || fail "jq is not installed"

cd "$PROJECT_DIR"

log "1/8 Update merged main safely"
if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
  fail "Tracked local changes exist. Commit/stash them before deployment."
fi
git fetch origin
git switch "$TARGET_BRANCH"
git pull --ff-only origin "$TARGET_BRANCH"
printf 'Branch: '; git branch --show-current
printf 'Commit: '; git rev-parse --short HEAD

log "2/8 Verify live Docker database before touching application containers"
docker ps --format '{{.Names}}' | grep -qx "$DB_CONTAINER" \
  || fail "$DB_CONTAINER is not running. No deployment changes were made."
docker exec "$DB_CONTAINER" pg_isready -U "$DB_USER" -d "$DB_NAME" >/dev/null \
  || fail "PostgreSQL is not ready. No deployment changes were made."

log "3/8 Create and verify PostgreSQL safety backup"
mkdir -p "$BACKUP_DIR"
BACKUP_FILE="$BACKUP_DIR/vidyasetu_pre_student_release_$(date +%F_%H%M%S).dump"
docker exec "$DB_CONTAINER" pg_dump -U "$DB_USER" -d "$DB_NAME" -Fc > "$BACKUP_FILE"
test -s "$BACKUP_FILE" || fail "Database backup is empty; aborting before migration."
ls -lh "$BACKUP_FILE"

log "4/8 Apply only Student identity/enrollment migration 014"
test -s database/migrations/014_student_identity_enrollment.sql \
  || fail "Migration 014 is missing from main."
docker exec -i "$DB_CONTAINER" \
  psql -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 \
  < database/migrations/014_student_identity_enrollment.sql

# Read-only contract checks after the backward-compatible migration.
docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -Atc "
SELECT CASE WHEN
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='users' AND column_name='username')
  AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='users' AND column_name='password_hash')
  AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='students' AND column_name='student_code')
  AND to_regclass('public.student_school_requests') IS NOT NULL
  AND to_regclass('public.parent_link_requests') IS NOT NULL
THEN 'ok' ELSE 'missing' END;" | grep -qx ok \
  || fail "Migration 014 contract check failed. Backup retained at $BACKUP_FILE"

log "5/8 Rebuild and restart backend/frontend only"
docker compose build backend frontend
docker compose up -d --no-deps backend frontend

docker compose ps

log "6/8 Wait for local application health"
for i in {1..60}; do
  if curl -fsS "${API_BASE%/api/v1}/health" >/dev/null; then break; fi
  sleep 2
  if [[ "$i" -eq 60 ]]; then
    docker compose logs --tail=160 backend || true
    fail "Backend did not become healthy. PostgreSQL/Redis and their volumes were never stopped or removed. Backup: $BACKUP_FILE"
  fi
done

for i in {1..60}; do
  code="$(curl -sS -o /dev/null -w '%{http_code}' "$WEB_BASE/student" || true)"
  if [[ "$code" =~ ^(200|301|302|307|308)$ ]]; then break; fi
  sleep 2
  if [[ "$i" -eq 60 ]]; then
    docker compose logs --tail=160 frontend || true
    fail "Frontend /student did not become healthy. PostgreSQL/Redis and their volumes were never stopped or removed. Backup: $BACKUP_FILE"
  fi
done

log "7/8 Run non-destructive Student production smoke"
chmod +x scripts/student-production-smoke.sh
API_BASE="$API_BASE" WEB_BASE="$WEB_BASE" bash scripts/student-production-smoke.sh

log "8/8 Verify public HTTPS route"
curl -kfsSI "$PUBLIC_WEB/student" >/dev/null \
  || fail "Public /student is not reachable after local smoke passed. Check Nginx proxy/logs; application containers are healthy."
curl -kfsS "$PUBLIC_WEB/api/v1/auth/student-registration-options" | jq -e '.data.gradeLevels | length == 12' >/dev/null \
  || fail "Public Student registration API contract failed."

printf '\n\033[1;32mVidyaSetu Student release deployed successfully on the existing Docker stack.\033[0m\n'
printf 'Git commit: '; git rev-parse --short HEAD
printf 'Safety DB backup: %s\n' "$BACKUP_FILE"
printf 'Docker PostgreSQL/Redis and all volumes were preserved.\n'
printf 'Live Student URL: %s/student\n' "$PUBLIC_WEB"
