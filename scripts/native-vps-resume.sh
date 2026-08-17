#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_DIR="/var/www/vidyasetu"
DB_NAME="vidyasetu_db"
NGINX_SITE="/etc/nginx/sites-available/vidyasetu"
BACKUP_DIR="/root/vidyasetu-backups"

log() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
fail() { printf '\n\033[1;31mERROR: %s\033[0m\n' "$*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || fail "Run this script as root."
[[ -d "$PROJECT_DIR/.git" ]] || fail "Repository not found at $PROJECT_DIR"
cd "$PROJECT_DIR"

log "1/9 Verify the already-migrated native runtime"
[[ "$(git branch --show-current)" == "phase1-student-foundation" ]] || fail "Wrong Git branch."
command -v node >/dev/null || fail "Node.js is not installed."
command -v pm2 >/dev/null || fail "PM2 is not installed."
command -v psql >/dev/null || fail "PostgreSQL client is not installed."
command -v redis-cli >/dev/null || fail "Redis client is not installed."
systemctl is-active --quiet postgresql || fail "Native PostgreSQL is not active."
systemctl is-active --quiet redis-server || fail "Native Redis is not active."
pg_isready -h 127.0.0.1 -p 5432 >/dev/null || fail "Native PostgreSQL is not accepting connections on 5432."
redis-cli -h 127.0.0.1 -p 6379 ping | grep -q PONG || fail "Native Redis is not responding on 6379."
[[ -s "$PROJECT_DIR/backend/.env" ]] || fail "backend/.env is missing; do not continue without the restored native DB configuration."
[[ -s "$PROJECT_DIR/frontend/.env.production" ]] || fail "frontend/.env.production is missing."
find "$BACKUP_DIR" -maxdepth 1 -type f -name 'vidyasetu_docker_final_*.dump' -size +0c | grep -q . \
  || fail "No verified pre-removal PostgreSQL backup exists in $BACKUP_DIR."

log "2/9 Validate native Student identity/data before application cutover"
set -a
# shellcheck disable=SC1091
source "$PROJECT_DIR/backend/.env"
set +a
export PGPASSWORD="${DB_PASSWORD:?DB_PASSWORD missing from backend/.env}"
PROFILE_COUNT="$(psql -h 127.0.0.1 -p "${DB_PORT:-5432}" -U "${DB_USER:-postgres}" -d "${DB_NAME:-$DB_NAME}" -Atc "SELECT COUNT(*) FROM users u JOIN students s ON s.user_id=u.id WHERE u.mobile IN ('9300000001','9300000002');")"
[[ "$PROFILE_COUNT" == "2" ]] || fail "Aarav/Priya Student mappings are not present in the native database."
psql -h 127.0.0.1 -p "${DB_PORT:-5432}" -U "${DB_USER:-postgres}" -d "${DB_NAME:-$DB_NAME}" -c "
SELECT u.mobile, u.name, s.xp_total, s.xp_level,
       sch.name AS school, sc.class_name, sc.section
FROM users u
JOIN students s ON s.user_id=u.id
JOIN schools sch ON sch.id=s.school_id
JOIN school_classes sc ON sc.id=s.class_id
WHERE u.mobile IN ('9300000001','9300000002')
ORDER BY u.mobile;"

log "3/9 Install dependencies and build current Git code natively"
cd "$PROJECT_DIR/backend"
npm ci
find src -name '*.js' -print0 | xargs -0 -n1 node --check

cd "$PROJECT_DIR/frontend"
npm install --no-audit --no-fund
npm run build

log "4/9 Start/restart native API and Next.js under PM2"
pm2 delete vs-api >/dev/null 2>&1 || true
pm2 delete vs-web >/dev/null 2>&1 || true
pm2 start src/index.js --name vs-api --cwd "$PROJECT_DIR/backend" --time
pm2 start npm --name vs-web --cwd "$PROJECT_DIR/frontend" --time -- start
pm2 save
pm2 startup systemd -u root --hp /root >/tmp/vidyasetu-pm2-startup.txt 2>&1 || true

for i in {1..40}; do
  curl -fsS http://127.0.0.1:5000/health >/dev/null && break
  sleep 1
  [[ "$i" -lt 40 ]] || { pm2 logs vs-api --lines 120 --nostream; fail "Native API did not become healthy."; }
done
for i in {1..40}; do
  curl -fsSI http://127.0.0.1:3000/student >/dev/null && break
  sleep 1
  [[ "$i" -lt 40 ]] || { pm2 logs vs-web --lines 120 --nostream; fail "Native Next.js did not become healthy."; }
done

log "5/9 Run non-destructive Student deployment smoke against native API"
SEND_JSON="$(curl -fsS -X POST http://127.0.0.1:5000/api/v1/auth/send-otp -H 'Content-Type: application/json' -d '{"mobile":"9300000001"}')"
OTP="$(jq -er '.data.otp' <<< "$SEND_JSON")"
LOGIN_JSON="$(curl -fsS -X POST http://127.0.0.1:5000/api/v1/auth/verify-otp -H 'Content-Type: application/json' -d "{\"mobile\":\"9300000001\",\"otp\":\"$OTP\"}")"
TOKEN="$(jq -er '.data.accessToken' <<< "$LOGIN_JSON")"
STATUS_JSON="$(curl -fsS http://127.0.0.1:5000/api/v1/student/profile/status -H "Authorization: Bearer $TOKEN")"
[[ "$(jq -r '.data.complete' <<< "$STATUS_JSON")" == "true" ]] || fail "Aarav Student profile is incomplete on native API."
DASH_JSON="$(curl -fsS http://127.0.0.1:5000/api/v1/student/dashboard -H "Authorization: Bearer $TOKEN")"
[[ "$(jq -r '.data.student.mobile' <<< "$DASH_JSON")" == "9300000001" ]] || fail "Native Student dashboard identity mismatch."
SUBJECTS_JSON="$(curl -fsS 'http://127.0.0.1:5000/api/v1/content/subjects?class=8')"
[[ "$(jq -r '.data | length' <<< "$SUBJECTS_JSON")" -ge 6 ]] || fail "Native Student subject catalogue is incomplete."
ATT_JSON="$(curl -fsS "http://127.0.0.1:5000/api/v1/student/attendance/$(date +%Y)/$(date +%-m)" -H "Authorization: Bearer $TOKEN")"
jq -e '.data.summary' <<< "$ATT_JSON" >/dev/null || fail "Native Student attendance response is invalid."
REPORT_JSON="$(curl -fsS http://127.0.0.1:5000/api/v1/student/report-card -H "Authorization: Bearer $TOKEN")"
jq -e '.data' <<< "$REPORT_JSON" >/dev/null || fail "Native Student report-card response is invalid."

log "6/9 Switch Nginx/SSL to native ports"
[[ -f "$NGINX_SITE" ]] || fail "Nginx site file not found: $NGINX_SITE"
cp "$NGINX_SITE" "$NGINX_SITE.before-native-resume-$(date +%F_%H%M%S)"
sed -i 's#127\.0\.0\.1:3001#127.0.0.1:3000#g; s#127\.0\.0\.1:5001#127.0.0.1:5000#g' "$NGINX_SITE"
nginx -t
systemctl reload nginx
sleep 2
curl -kfsSI https://vidyasetu.sbs/student >/dev/null

log "7/9 Verify Student through public HTTPS"
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

log "8/9 Disable and uninstall old Docker runtime"
# The database has already been backed up and restored natively. Stop the old
# runtime at the service level; no new Docker application deployment occurs here.
systemctl stop docker.service docker.socket containerd.service >/dev/null 2>&1 || true
systemctl disable docker.service docker.socket containerd.service >/dev/null 2>&1 || true
apt-get purge -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin docker.io docker-compose-v2 docker-compose || true
apt-get autoremove -y || true
rm -rf /var/lib/docker /var/lib/containerd

log "9/9 Final native production verification"
systemctl is-active --quiet postgresql || fail "PostgreSQL stopped unexpectedly."
systemctl is-active --quiet redis-server || fail "Redis stopped unexpectedly."
systemctl is-active --quiet nginx || fail "Nginx stopped unexpectedly."
curl -fsS http://127.0.0.1:5000/health | jq .
curl -kfsSI https://vidyasetu.sbs/student | head
pm2 status
printf '\n\033[1;32mVidyaSetu native resume/cutover completed successfully.\033[0m\n'
printf 'Git commit: '; git -C "$PROJECT_DIR" rev-parse --short HEAD
printf 'Backups retained in: %s\n' "$BACKUP_DIR"
printf 'Student portal: https://vidyasetu.sbs/student\n'
