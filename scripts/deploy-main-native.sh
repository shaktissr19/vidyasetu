#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_DIR="/var/www/vidyasetu"
TARGET_BRANCH="main"
DB_NAME_DEFAULT="vidyasetu_db"
DB_USER_DEFAULT="postgres"
BACKUP_DIR="/root/vidyasetu-backups"
NGINX_SITE="/etc/nginx/sites-available/vidyasetu"
BACKEND_ENV="$PROJECT_DIR/backend/.env"
FRONTEND_ENV="$PROJECT_DIR/frontend/.env.production"

log() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
warn() { printf '\n\033[1;33mWARN: %s\033[0m\n' "$*"; }
fail() { printf '\n\033[1;31mERROR: %s\033[0m\n' "$*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || fail "Run this script as root."
[[ -d "$PROJECT_DIR/.git" ]] || fail "Repository not found at $PROJECT_DIR"
cd "$PROJECT_DIR"

log "1/10 Verify main release and native services"
[[ "$(git branch --show-current)" == "$TARGET_BRANCH" ]] || fail "Expected branch '$TARGET_BRANCH'. Run: git switch main && git pull --ff-only origin main"
[[ -z "$(git status --porcelain --untracked-files=no)" ]] || fail "Tracked working tree changes exist. Commit/stash them before deployment."
command -v node >/dev/null || fail "Node.js is not installed."
command -v npm >/dev/null || fail "npm is not installed."
command -v pm2 >/dev/null || fail "PM2 is not installed."
command -v psql >/dev/null || fail "PostgreSQL client is not installed."
command -v redis-cli >/dev/null || fail "Redis client is not installed."
command -v jq >/dev/null || fail "jq is not installed."
command -v openssl >/dev/null || fail "openssl is not installed."
systemctl is-active --quiet postgresql || fail "Native PostgreSQL is not active."
systemctl is-active --quiet redis-server || fail "Native Redis is not active."
pg_isready -h 127.0.0.1 -p 5432 >/dev/null || fail "Native PostgreSQL is not accepting connections on 5432."
redis-cli -h 127.0.0.1 -p 6379 ping | grep -q PONG || fail "Native Redis is not responding on 6379."

mkdir -p "$BACKUP_DIR"
SAFETY_DUMP="$BACKUP_DIR/vidyasetu_native_pre_main_$(date +%F_%H%M%S).dump"
runuser -u postgres -- pg_dump -d "$DB_NAME_DEFAULT" -Fc > "$SAFETY_DUMP" \
  || fail "Could not create native PostgreSQL safety dump."
test -s "$SAFETY_DUMP" || fail "Native PostgreSQL safety dump is empty."
printf 'Safety DB dump: %s\n' "$SAFETY_DUMP"

log "2/10 Recover/create native application environment without rebuilding the DB"
if [[ ! -s "$BACKEND_ENV" ]]; then
  DB_PASSWORD="$(openssl rand -hex 24)"
  JWT_ACCESS_SECRET="$(openssl rand -hex 48)"
  JWT_REFRESH_SECRET="$(openssl rand -hex 48)"

  runuser -u postgres -- psql -v ON_ERROR_STOP=1 \
    -c "ALTER USER postgres PASSWORD '$DB_PASSWORD';" >/dev/null \
    || fail "Could not reset the local postgres password through peer authentication."

  cat > "$BACKEND_ENV" <<EOF
PORT=5000
NODE_ENV=development
DB_HOST=127.0.0.1
DB_PORT=5432
DB_NAME=$DB_NAME_DEFAULT
DB_USER=$DB_USER_DEFAULT
DB_PASSWORD=$DB_PASSWORD
DB_POOL_MIN=2
DB_POOL_MAX=10
REDIS_URL=redis://127.0.0.1:6379
JWT_ACCESS_SECRET=$JWT_ACCESS_SECRET
JWT_REFRESH_SECRET=$JWT_REFRESH_SECRET
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=30d
OTP_EXPIRY_MINUTES=10
OTP_MAX_ATTEMPTS=3
SMS_PROVIDER=mock
WHATSAPP_PROVIDER=mock
AI_PROVIDER=mock
AWS_REGION=ap-south-1
AWS_ACCESS_KEY_ID=mock
AWS_SECRET_ACCESS_KEY=mock
S3_BUCKET_NAME=vidyasetu-content
RAZORPAY_KEY_ID=rzp_test_mock
RAZORPAY_KEY_SECRET=mock_secret
FRONTEND_URL=https://vidyasetu.sbs
EOF
  chmod 600 "$BACKEND_ENV"
  printf 'Recovered backend/.env with a new local PostgreSQL password.\n'
fi

if [[ ! -s "$FRONTEND_ENV" ]]; then
  cat > "$FRONTEND_ENV" <<'EOF'
NEXT_PUBLIC_API_URL=https://vidyasetu.sbs/api/v1
INTERNAL_API_URL=http://127.0.0.1:5000/api/v1
EOF
fi

set -a
# shellcheck disable=SC1091
source "$BACKEND_ENV"
set +a

DB_NAME="${DB_NAME:-$DB_NAME_DEFAULT}"
DB_USER="${DB_USER:-$DB_USER_DEFAULT}"
DB_PORT="${DB_PORT:-5432}"
[[ "$DB_HOST" == "127.0.0.1" || "$DB_HOST" == "localhost" ]] || fail "backend/.env DB_HOST must target native PostgreSQL, found '$DB_HOST'."
[[ -n "${DB_PASSWORD:-}" ]] || fail "DB_PASSWORD is missing from backend/.env"

export PGPASSWORD="$DB_PASSWORD"
if ! psql -h 127.0.0.1 -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -Atc 'SELECT 1' >/dev/null 2>&1; then
  if [[ "$DB_USER" == "postgres" ]]; then
    warn "Stored postgres password no longer authenticates; re-applying the same password locally."
    runuser -u postgres -- psql -v ON_ERROR_STOP=1 \
      -c "ALTER USER postgres PASSWORD '$DB_PASSWORD';" >/dev/null
  else
    fail "backend/.env database credentials do not authenticate."
  fi
fi
psql -h 127.0.0.1 -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -Atc 'SELECT 1' >/dev/null \
  || fail "Native application database authentication failed."

log "3/10 Reconcile and validate Student database contract"
cd "$PROJECT_DIR"
# These canonical migrations are idempotent (CREATE IF NOT EXISTS / duplicate-safe enums)
# and cover every table required by the Student release. Existing data is preserved.
for migration in \
  database/migrations/001_users.sql \
  database/migrations/002_schools.sql \
  database/migrations/003_students.sql \
  database/migrations/005_attendance.sql \
  database/migrations/007_content.sql \
  database/migrations/008_exams.sql \
  database/migrations/009_gamification.sql \
  database/migrations/010_doubt_forum.sql; do
  printf 'Applying %s\n' "$migration"
  psql -h 127.0.0.1 -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
    -v ON_ERROR_STOP=1 -f "$migration" >/dev/null \
    || fail "Student schema reconciliation failed at $migration. Safety dump retained: $SAFETY_DUMP"
done

# Student enrichment/reconciliation scripts are designed to be idempotent.
psql -h 127.0.0.1 -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
  -v ON_ERROR_STOP=1 -f database/seeds/03_student_seed_reconcile.sql >/dev/null \
  || fail "Student XP/streak reconciliation failed. Safety dump retained: $SAFETY_DUMP"
psql -h 127.0.0.1 -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
  -v ON_ERROR_STOP=1 -f database/seeds/05_student_module_seed.sql >/dev/null \
  || fail "Student module enrichment failed. Safety dump retained: $SAFETY_DUMP"
psql -h 127.0.0.1 -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
  -v ON_ERROR_STOP=1 -f database/seeds/04_student_seed_validate.sql >/dev/null \
  || fail "Student seed validation failed. Safety dump retained: $SAFETY_DUMP"

for table_name in \
  users students school_classes subjects chapters content_items student_content_progress \
  attendance exams exam_attempts badges student_badges xp_events doubts offline_downloads; do
  psql -h 127.0.0.1 -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
    -Atc "SELECT to_regclass('public.$table_name') IS NOT NULL;" | grep -qx t \
    || fail "Required Student table '$table_name' is missing after reconciliation. Safety dump retained: $SAFETY_DUMP"
done

PROFILE_COUNT="$(psql -h 127.0.0.1 -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -Atc "SELECT COUNT(*) FROM users u JOIN students s ON s.user_id=u.id WHERE u.mobile IN ('9300000001','9300000002');")"
[[ "$PROFILE_COUNT" == "2" ]] || fail "Aarav/Priya Student mappings are missing from native PostgreSQL after reconciliation."

psql -h 127.0.0.1 -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -c "
SELECT u.mobile, u.name, s.id AS student_id, s.xp_total, s.xp_level,
       sch.name AS school, sc.class_name, sc.section
FROM users u
JOIN students s ON s.user_id=u.id
JOIN schools sch ON sch.id=s.school_id
JOIN school_classes sc ON sc.id=s.class_id
WHERE u.mobile IN ('9300000001','9300000002')
ORDER BY u.mobile;"

log "4/10 Install dependencies and build main"
cd "$PROJECT_DIR/backend"
npm ci
find src -name '*.js' -print0 | xargs -0 -n1 node --check

cd "$PROJECT_DIR/frontend"
npm install --no-audit --no-fund
npm run build

log "5/10 Start main API and web under PM2"
pm2 delete vs-api >/dev/null 2>&1 || true
pm2 delete vs-web >/dev/null 2>&1 || true
pm2 start src/index.js --name vs-api --cwd "$PROJECT_DIR/backend" --time
pm2 start npm --name vs-web --cwd "$PROJECT_DIR/frontend" --time -- start
pm2 save
pm2 startup systemd -u root --hp /root >/tmp/vidyasetu-pm2-startup.txt 2>&1 || true

for i in {1..40}; do
  if curl -fsS http://127.0.0.1:5000/health >/dev/null; then break; fi
  sleep 1
  [[ "$i" -lt 40 ]] || { pm2 logs vs-api --lines 120 --nostream; fail "Native API did not become healthy."; }
done
for i in {1..40}; do
  if curl -fsSI http://127.0.0.1:3000/student >/dev/null; then break; fi
  sleep 1
  [[ "$i" -lt 40 ]] || { pm2 logs vs-web --lines 120 --nostream; fail "Next.js /student did not become healthy."; }
done

log "6/10 Run seeded Student smoke against native API"
SEND_JSON="$(curl -fsS -X POST http://127.0.0.1:5000/api/v1/auth/send-otp -H 'Content-Type: application/json' -d '{"mobile":"9300000001"}')"
OTP="$(jq -er '.data.otp' <<< "$SEND_JSON")"
LOGIN_JSON="$(curl -fsS -X POST http://127.0.0.1:5000/api/v1/auth/verify-otp -H 'Content-Type: application/json' -d "{\"mobile\":\"9300000001\",\"otp\":\"$OTP\"}")"
TOKEN="$(jq -er '.data.accessToken' <<< "$LOGIN_JSON")"
STATUS_JSON="$(curl -fsS http://127.0.0.1:5000/api/v1/student/profile/status -H "Authorization: Bearer $TOKEN")"
[[ "$(jq -r '.data.complete' <<< "$STATUS_JSON")" == "true" ]] || fail "Seeded Student profile is incomplete."
DASH_JSON="$(curl -fsS http://127.0.0.1:5000/api/v1/student/dashboard -H "Authorization: Bearer $TOKEN")"
[[ "$(jq -r '.data.student.mobile' <<< "$DASH_JSON")" == "9300000001" ]] || fail "Student dashboard identity mismatch."
SUBJECTS_JSON="$(curl -fsS 'http://127.0.0.1:5000/api/v1/content/subjects?class=8')"
[[ "$(jq -r '.data | length' <<< "$SUBJECTS_JSON")" -ge 6 ]] || fail "Student subject catalogue has fewer than six subjects."
BADGES_JSON="$(curl -fsS http://127.0.0.1:5000/api/v1/student/badges -H "Authorization: Bearer $TOKEN")"
jq -e '.data' <<< "$BADGES_JSON" >/dev/null || fail "Student badges endpoint is invalid."
REPORT_JSON="$(curl -fsS http://127.0.0.1:5000/api/v1/student/report-card -H "Authorization: Bearer $TOKEN")"
jq -e '.data' <<< "$REPORT_JSON" >/dev/null || fail "Student report-card endpoint is invalid."

log "7/10 Switch Nginx from Docker ports to native PM2 ports"
[[ -f "$NGINX_SITE" ]] || fail "Nginx site file not found: $NGINX_SITE"
cp "$NGINX_SITE" "$NGINX_SITE.before-main-native-$(date +%F_%H%M%S)"
sed -i 's#127\.0\.0\.1:3001#127.0.0.1:3000#g; s#127\.0\.0\.1:5001#127.0.0.1:5000#g' "$NGINX_SITE"
nginx -t
systemctl reload nginx
sleep 2

log "8/10 Verify public Student release"
curl -kfsSI https://vidyasetu.sbs/student >/dev/null || fail "Public /student route is not reachable."
PUBLIC_SEND="$(curl -kfsS -X POST https://vidyasetu.sbs/api/v1/auth/send-otp -H 'Content-Type: application/json' -d '{"mobile":"9300000001"}')"
PUBLIC_OTP="$(jq -er '.data.otp' <<< "$PUBLIC_SEND")"
PUBLIC_LOGIN="$(curl -kfsS -X POST https://vidyasetu.sbs/api/v1/auth/verify-otp -H 'Content-Type: application/json' -d "{\"mobile\":\"9300000001\",\"otp\":\"$PUBLIC_OTP\"}")"
PUBLIC_TOKEN="$(jq -er '.data.accessToken' <<< "$PUBLIC_LOGIN")"
PUBLIC_DASH="$(curl -kfsS https://vidyasetu.sbs/api/v1/student/dashboard -H "Authorization: Bearer $PUBLIC_TOKEN")"
[[ "$(jq -r '.data.student.mobile' <<< "$PUBLIC_DASH")" == "9300000001" ]] || fail "Public Student dashboard identity mismatch."
printf 'Public Student: %s | Class %s | School %s\n' \
  "$(jq -r '.data.student.name' <<< "$PUBLIC_DASH")" \
  "$(jq -r '.data.student.classLabel' <<< "$PUBLIC_DASH")" \
  "$(jq -r '.data.student.schoolName' <<< "$PUBLIC_DASH")"

log "9/10 Stop legacy Docker application containers, retain Docker/volumes for rollback"
if command -v docker >/dev/null 2>&1; then
  cd "$PROJECT_DIR"
  docker compose stop frontend backend postgres redis >/dev/null 2>&1 || true
  warn "Docker packages and volumes were intentionally retained as a rollback safety net."
fi

log "10/10 Final main production verification"
systemctl is-active --quiet postgresql || fail "PostgreSQL stopped unexpectedly."
systemctl is-active --quiet redis-server || fail "Redis stopped unexpectedly."
systemctl is-active --quiet nginx || fail "Nginx stopped unexpectedly."
curl -fsS http://127.0.0.1:5000/health | jq .
curl -kfsSI https://vidyasetu.sbs/student | head -n 8
pm2 status
printf '\n\033[1;32mVidyaSetu Student Module main deployment completed successfully.\033[0m\n'
printf 'Git branch: '; git -C "$PROJECT_DIR" branch --show-current
printf 'Git commit: '; git -C "$PROJECT_DIR" rev-parse --short HEAD
printf 'Student portal: https://vidyasetu.sbs/student\n'
printf 'Safety DB dump: %s\n' "$SAFETY_DUMP"
printf 'Rollback safety: Docker packages/volumes retained until final browser sign-off.\n'
