#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_DIR="/var/www/vidyasetu"
BRANCH="phase1-student-foundation"
DB_NAME="vidyasetu_db"
DB_USER="postgres"
BACKUP_DIR="/root/vidyasetu-backups"
BACKUP_FILE="$BACKUP_DIR/vidyasetu_docker_final_$(date +%F_%H%M%S).dump"
NGINX_SITE="/etc/nginx/sites-available/vidyasetu"

log() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
fail() { printf '\n\033[1;31mERROR: %s\033[0m\n' "$*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || fail "Run this script as root."
[[ -d "$PROJECT_DIR/.git" ]] || fail "Repository not found at $PROJECT_DIR"

log "1/12 Update feature branch"
cd "$PROJECT_DIR"
git fetch origin
git switch "$BRANCH"
git pull --ff-only origin "$BRANCH"
printf 'Branch: '; git branch --show-current
printf 'Commit: '; git rev-parse --short HEAD

log "2/12 Final backup of the current PostgreSQL container"
mkdir -p "$BACKUP_DIR"
if ! command -v docker >/dev/null 2>&1; then
  fail "Docker is already unavailable, so the current container DB cannot be exported automatically. Do not continue until a valid PostgreSQL dump exists."
fi
if ! docker ps --format '{{.Names}}' | grep -qx 'vidyasetu_postgres'; then
  fail "vidyasetu_postgres is not running. Start only long enough to export the DB, or restore from an existing verified dump."
fi
docker exec vidyasetu_postgres pg_dump -U postgres -d "$DB_NAME" -Fc > "$BACKUP_FILE"
test -s "$BACKUP_FILE" || fail "Database backup is empty."
ls -lh "$BACKUP_FILE"

log "3/12 Install Node.js 20, PM2, PostgreSQL 15, Redis and tools"
apt-get update
apt-get install -y ca-certificates curl gnupg lsb-release jq redis-server
install -d /usr/share/postgresql-common/pgdg
curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
  | gpg --dearmor --yes -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.gpg
echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.gpg] https://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" \
  > /etc/apt/sources.list.d/pgdg.list

install -d -m 0755 /etc/apt/keyrings
curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
  | gpg --dearmor --yes -o /etc/apt/keyrings/nodesource.gpg
echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" \
  > /etc/apt/sources.list.d/nodesource.list

apt-get update
apt-get install -y nodejs postgresql-15 postgresql-client-15
npm install -g pm2

node -v
npm -v
pm2 -v
psql --version
redis-server --version

log "4/12 Start native PostgreSQL and Redis"
systemctl enable --now postgresql
systemctl enable --now redis-server
pg_isready -h 127.0.0.1 -p 5432
redis-cli -h 127.0.0.1 -p 6379 ping | grep -q PONG

log "5/12 Restore Docker DB into native PostgreSQL 15"
DB_PASSWORD="$(openssl rand -hex 24)"
sudo -u postgres psql -v ON_ERROR_STOP=1 -c "ALTER USER postgres PASSWORD '$DB_PASSWORD';"
sudo -u postgres psql -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS $DB_NAME;"
sudo -u postgres psql -v ON_ERROR_STOP=1 -c "CREATE DATABASE $DB_NAME OWNER postgres;"
pg_restore -h 127.0.0.1 -p 5432 -U postgres -d "$DB_NAME" --no-owner "$BACKUP_FILE" <<< "$DB_PASSWORD" || {
  # pg_restore does not consume stdin as a password in all builds; retry using PGPASSWORD.
  PGPASSWORD="$DB_PASSWORD" pg_restore -h 127.0.0.1 -p 5432 -U postgres -d "$DB_NAME" --no-owner "$BACKUP_FILE"
}

log "6/12 Reconcile current Student SQL against restored DB"
export PGPASSWORD="$DB_PASSWORD"
psql -h 127.0.0.1 -U postgres -d "$DB_NAME" -v ON_ERROR_STOP=1 -f database/run_all_migrations.sql
psql -h 127.0.0.1 -U postgres -d "$DB_NAME" -v ON_ERROR_STOP=1 -f database/seeds/03_student_seed_reconcile.sql
psql -h 127.0.0.1 -U postgres -d "$DB_NAME" -v ON_ERROR_STOP=1 -f database/seeds/04_student_seed_validate.sql
psql -h 127.0.0.1 -U postgres -d "$DB_NAME" -v ON_ERROR_STOP=1 -f database/seeds/05_student_module_seed.sql

psql -h 127.0.0.1 -U postgres -d "$DB_NAME" -v ON_ERROR_STOP=1 -c "
SELECT u.id AS user_id, u.mobile, u.name, s.id AS student_id,
       sch.name AS school, sc.class_name, sc.section
FROM users u
JOIN students s ON s.user_id = u.id
JOIN schools sch ON sch.id = s.school_id
JOIN school_classes sc ON sc.id = s.class_id
WHERE u.mobile IN ('9300000001','9300000002')
ORDER BY u.mobile;"

PROFILE_COUNT="$(psql -h 127.0.0.1 -U postgres -d "$DB_NAME" -Atc "SELECT COUNT(*) FROM users u JOIN students s ON s.user_id=u.id WHERE u.mobile IN ('9300000001','9300000002');")"
[[ "$PROFILE_COUNT" == "2" ]] || fail "Aarav/Priya Student relationship validation failed after restore."

log "7/12 Create native application environment"
JWT_ACCESS_SECRET="$(openssl rand -hex 48)"
JWT_REFRESH_SECRET="$(openssl rand -hex 48)"
cat > "$PROJECT_DIR/backend/.env" <<EOF
PORT=5000
NODE_ENV=development
DB_HOST=127.0.0.1
DB_PORT=5432
DB_NAME=$DB_NAME
DB_USER=$DB_USER
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
chmod 600 "$PROJECT_DIR/backend/.env"

cat > "$PROJECT_DIR/frontend/.env.production" <<EOF
NEXT_PUBLIC_API_URL=https://vidyasetu.sbs/api/v1
INTERNAL_API_URL=http://127.0.0.1:5000/api/v1
EOF

log "8/12 Install dependencies and build current branch"
cd "$PROJECT_DIR/backend"
npm ci
find src -name '*.js' -print0 | xargs -0 -n1 node --check

cd "$PROJECT_DIR/frontend"
npm ci
npm run build

log "9/12 Start native API and Next.js with PM2"
pm2 delete vs-api >/dev/null 2>&1 || true
pm2 delete vs-web >/dev/null 2>&1 || true
pm2 start src/index.js --name vs-api --cwd "$PROJECT_DIR/backend" --time
pm2 start npm --name vs-web --cwd "$PROJECT_DIR/frontend" --time -- start
pm2 save

for i in {1..30}; do
  curl -fsS http://127.0.0.1:5000/health >/dev/null && break
  sleep 1
  [[ "$i" -lt 30 ]] || { pm2 logs vs-api --lines 100 --nostream; fail "Native API did not become healthy."; }
done
for i in {1..30}; do
  curl -fsSI http://127.0.0.1:3000 >/dev/null && break
  sleep 1
  [[ "$i" -lt 30 ]] || { pm2 logs vs-web --lines 100 --nostream; fail "Native Next.js did not become healthy."; }
done

log "10/12 Point existing Nginx/SSL config to native ports"
[[ -f "$NGINX_SITE" ]] || fail "Nginx site file not found: $NGINX_SITE"
cp "$NGINX_SITE" "$NGINX_SITE.before-native-$(date +%F_%H%M%S)"
sed -i 's#127\.0\.0\.1:3001#127.0.0.1:3000#g; s#127\.0\.0\.1:5001#127.0.0.1:5000#g' "$NGINX_SITE"
nginx -t
systemctl reload nginx
sleep 2
curl -kfsS https://api.vidyasetu.sbs/health | jq -e '.status == "ok"' >/dev/null
curl -kfsSI https://vidyasetu.sbs/ >/dev/null

log "11/12 Public Student login/dashboard smoke test"
SEND_JSON="$(curl -kfsS -X POST https://vidyasetu.sbs/api/v1/auth/send-otp -H 'Content-Type: application/json' -d '{"mobile":"9300000001"}')"
OTP="$(jq -r '.data.otp' <<< "$SEND_JSON")"
[[ "$OTP" =~ ^[0-9]{6}$ ]] || fail "Mock OTP was not returned; inspect SMS/NODE_ENV settings."
LOGIN_JSON="$(curl -kfsS -X POST https://vidyasetu.sbs/api/v1/auth/verify-otp -H 'Content-Type: application/json' -d "{\"mobile\":\"9300000001\",\"otp\":\"$OTP\"}")"
TOKEN="$(jq -r '.data.accessToken' <<< "$LOGIN_JSON")"
[[ -n "$TOKEN" && "$TOKEN" != "null" ]] || fail "Student login did not return an access token."
DASH_JSON="$(curl -kfsS https://vidyasetu.sbs/api/v1/student/dashboard -H "Authorization: Bearer $TOKEN")"
[[ "$(jq -r '.data.student.mobile' <<< "$DASH_JSON")" == "9300000001" ]] || fail "Public Student dashboard identity mismatch."
printf 'Public Student: %s | Class %s | School %s\n' \
  "$(jq -r '.data.student.name' <<< "$DASH_JSON")" \
  "$(jq -r '.data.student.classLabel' <<< "$DASH_JSON")" \
  "$(jq -r '.data.student.schoolName' <<< "$DASH_JSON")"

log "12/12 Remove old Docker runtime only after native/public checks passed"
cd "$PROJECT_DIR"
docker compose down || true
docker volume rm vidyasetu_postgres_data vidyasetu_redis_data >/dev/null 2>&1 || true
apt-get purge -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin docker.io docker-compose-v2 docker-compose || true
apt-get autoremove -y || true
rm -rf /var/lib/docker /var/lib/containerd

printf '\nNative VidyaSetu cutover complete.\n'
printf 'Git: '; git rev-parse --short HEAD
printf 'Backup retained: %s\n' "$BACKUP_FILE"
pm2 status
systemctl --no-pager --full status postgresql redis-server nginx | sed -n '1,80p'
printf '\nVerify in browser: https://vidyasetu.sbs/student\n'
