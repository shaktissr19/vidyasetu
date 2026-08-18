#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_DIR="${PROJECT_DIR:-/var/www/vidyasetu}"
TARGET_BRANCH="${TARGET_BRANCH:-main}"
BACKUP_DIR="${BACKUP_DIR:-/root/vidyasetu-backups}"
NGINX_SITE="${NGINX_SITE:-/etc/nginx/sites-available/vidyasetu}"
BACKEND_ENV="$PROJECT_DIR/backend/.env"
FRONTEND_ENV="$PROJECT_DIR/frontend/.env.production"

log() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
warn() { printf '\n\033[1;33mWARN: %s\033[0m\n' "$*"; }
fail() { printf '\n\033[1;31mERROR: %s\033[0m\n' "$*" >&2; exit 1; }
read_env_value() {
  local key="$1" file="$2"
  grep -m1 -E "^${key}=" "$file" 2>/dev/null | cut -d= -f2- || true
}

[[ $EUID -eq 0 ]] || fail "Run this script as root."
[[ -d "$PROJECT_DIR/.git" ]] || fail "Repository not found at $PROJECT_DIR"
cd "$PROJECT_DIR"

log "1/10 Verify release checkout and native dependencies"
[[ "$(git branch --show-current)" == "$TARGET_BRANCH" ]] || fail "Expected branch '$TARGET_BRANCH'."
[[ -z "$(git status --porcelain --untracked-files=no)" ]] || fail "Tracked working-tree changes exist. Commit/stash them first."
for command_name in node npm pm2 psql pg_dump redis-cli jq openssl nginx; do
  command -v "$command_name" >/dev/null || fail "$command_name is not installed."
done
systemctl is-active --quiet postgresql || fail "Native PostgreSQL is not active."
systemctl is-active --quiet redis-server || fail "Native Redis is not active."
pg_isready -h 127.0.0.1 -p 5432 >/dev/null || fail "PostgreSQL is not accepting connections on 5432."
redis-cli -h 127.0.0.1 -p 6379 ping | grep -q PONG || fail "Redis is not responding on 6379."

[[ -s "$BACKEND_ENV" ]] || fail "Missing $BACKEND_ENV. Do not generate production credentials during an application deploy."
if [[ ! -s "$FRONTEND_ENV" ]]; then
  cat > "$FRONTEND_ENV" <<'EOF'
NEXT_PUBLIC_API_URL=https://vidyasetu.sbs/api/v1
INTERNAL_API_URL=http://127.0.0.1:5000/api/v1
EOF
fi
# Backend NODE_ENV must never leak into `next build`.
sed -i '/^[[:space:]]*NODE_ENV=/d' "$FRONTEND_ENV"

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
psql -h 127.0.0.1 -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -Atc 'SELECT 1' >/dev/null \
  || fail "Native application database credentials do not authenticate."

log "2/10 Create mandatory PostgreSQL safety backup"
mkdir -p "$BACKUP_DIR"
SAFETY_DUMP="$BACKUP_DIR/vidyasetu_pre_student_identity_$(date +%F_%H%M%S).dump"
pg_dump -h 127.0.0.1 -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -Fc > "$SAFETY_DUMP" \
  || fail "Could not create PostgreSQL safety dump."
test -s "$SAFETY_DUMP" || fail "PostgreSQL safety dump is empty."
printf 'Safety DB dump: %s\n' "$SAFETY_DUMP"

log "3/10 Verify base Student schema before migration"
for table_name in users students schools school_classes subjects chapters content_items student_content_progress attendance exams exam_attempts doubts offline_downloads parent_student_links; do
  exists="$(psql -h 127.0.0.1 -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -Atc "SELECT to_regclass('public.$table_name') IS NOT NULL;")"
  [[ "$exists" == "t" ]] || fail "Required base table '$table_name' is missing. Database was not modified; backup: $SAFETY_DUMP"
done
PROFILE_COUNT="$(psql -h 127.0.0.1 -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -Atc "SELECT COUNT(*) FROM users u JOIN students s ON s.user_id=u.id WHERE u.mobile IN ('9300000001','9300000002');")"
[[ "$PROFILE_COUNT" == "2" ]] || fail "Seeded Student baseline is incomplete; refusing migration. Backup: $SAFETY_DUMP"

log "4/10 Apply idempotent Student content enrichment and identity/enrollment migration"
# 05 is designed to enrich the existing Student demo contract without rebuilding the DB.
psql -h 127.0.0.1 -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
  -v ON_ERROR_STOP=1 -f database/seeds/05_student_module_seed.sql >/dev/null \
  || fail "Student module enrichment failed. Backup retained: $SAFETY_DUMP"
psql -h 127.0.0.1 -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
  -v ON_ERROR_STOP=1 -f database/migrations/014_student_identity_enrollment.sql >/dev/null \
  || fail "Student identity/enrollment migration failed. Backup retained: $SAFETY_DUMP"

for table_name in student_school_requests parent_link_requests; do
  exists="$(psql -h 127.0.0.1 -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -Atc "SELECT to_regclass('public.$table_name') IS NOT NULL;")"
  [[ "$exists" == "t" ]] || fail "Migration did not create '$table_name'. Backup retained: $SAFETY_DUMP"
done
NULL_USERNAMES="$(psql -h 127.0.0.1 -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -Atc "SELECT COUNT(*) FROM users WHERE username IS NULL OR BTRIM(username)='';")"
[[ "$NULL_USERNAMES" == "0" ]] || fail "Identity migration left users without usernames. Backup retained: $SAFETY_DUMP"
NULL_CODES="$(psql -h 127.0.0.1 -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -Atc "SELECT COUNT(*) FROM students WHERE student_code IS NULL OR BTRIM(student_code)='';")"
[[ "$NULL_CODES" == "0" ]] || fail "Identity migration left Students without Student IDs. Backup retained: $SAFETY_DUMP"
DUP_USERNAMES="$(psql -h 127.0.0.1 -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -Atc "SELECT COUNT(*) FROM (SELECT LOWER(username) FROM users GROUP BY LOWER(username) HAVING COUNT(*)>1) x;")"
[[ "$DUP_USERNAMES" == "0" ]] || fail "Duplicate usernames detected. Backup retained: $SAFETY_DUMP"
DUP_CODES="$(psql -h 127.0.0.1 -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -Atc "SELECT COUNT(*) FROM (SELECT student_code FROM students GROUP BY student_code HAVING COUNT(*)>1) x;")"
[[ "$DUP_CODES" == "0" ]] || fail "Duplicate Student IDs detected. Backup retained: $SAFETY_DUMP"

log "5/10 Install dependencies and build production frontend"
cd "$PROJECT_DIR/backend"
npm ci
find src -name '*.js' -print0 | xargs -0 -n1 node --check
cd "$PROJECT_DIR/frontend"
unset NODE_ENV || true
rm -rf .next node_modules
npm install --no-audit --no-fund
NODE_ENV=production npm run build

log "6/10 Restart native PM2 applications"
pm2 delete vs-api >/dev/null 2>&1 || true
pm2 delete vs-web >/dev/null 2>&1 || true
NODE_ENV=production pm2 start src/index.js --name vs-api --cwd "$PROJECT_DIR/backend" --time
NODE_ENV=production pm2 start npm --name vs-web --cwd "$PROJECT_DIR/frontend" --time -- start
pm2 save
for i in {1..40}; do
  curl -fsS http://127.0.0.1:5000/health >/dev/null && break
  sleep 1
  [[ "$i" -lt 40 ]] || { pm2 logs vs-api --lines 120 --nostream; fail "Native API did not become healthy."; }
done
for i in {1..40}; do
  code="$(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/student || true)"
  [[ "$code" =~ ^(200|301|302|307|308)$ ]] && break
  sleep 1
  [[ "$i" -lt 40 ]] || { pm2 logs vs-web --lines 120 --nostream; fail "Next.js /student did not become healthy."; }
done

log "7/10 Run non-destructive local Student production smoke"
cd "$PROJECT_DIR"
API_BASE=http://127.0.0.1:5000/api/v1 WEB_BASE=http://127.0.0.1:3000 bash scripts/student-production-smoke.sh

log "8/10 Point Nginx to native PM2 ports"
[[ -f "$NGINX_SITE" ]] || fail "Nginx site file not found: $NGINX_SITE"
cp "$NGINX_SITE" "$NGINX_SITE.before-student-release-$(date +%F_%H%M%S)"
sed -i 's#127\.0\.0\.1:3001#127.0.0.1:3000#g; s#127\.0\.0\.1:5001#127.0.0.1:5000#g' "$NGINX_SITE"
nginx -t
systemctl reload nginx
sleep 2

log "9/10 Verify public Student routes without mutating live Student data"
WEB_BASE=https://vidyasetu.sbs API_BASE=https://vidyasetu.sbs/api/v1 bash scripts/student-production-smoke.sh

log "10/10 Retain rollback assets and report status"
if command -v docker >/dev/null 2>&1; then
  # Stop legacy application containers only after native public smoke is green.
  # Do NOT remove containers, images or volumes here.
  cd "$PROJECT_DIR"
  docker compose stop frontend backend >/dev/null 2>&1 || true
fi
pm2 status
printf '\nStudent release deployment completed.\nCommit: %s\nBackup: %s\n' "$(git rev-parse --short HEAD)" "$SAFETY_DUMP"
printf 'No Docker volume was deleted.\n'
