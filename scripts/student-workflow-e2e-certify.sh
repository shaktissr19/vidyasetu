#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

export PGPASSWORD="${PGPASSWORD:-postgres}"
DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-vidyasetu_db}"
DB_USER="${DB_USER:-postgres}"
API_BASE="${API_BASE:-http://127.0.0.1:5000/api/v1}"

log() { printf '\n===== %s =====\n' "$*"; }

log "Build disposable Student + School database"
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -f database/run_all_migrations.sql
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -f database/seeds/dev_seed.sql
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -f database/seeds/03_student_seed_reconcile.sql
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -f database/seeds/04_student_seed_validate.sql
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -f database/seeds/05_student_module_seed.sql
for migration in \
  014_student_identity_enrollment.sql \
  015_realistic_demo_identities.sql \
  016_demo_academic_year_alignment.sql \
  017_school_management_core.sql; do
  psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -f "database/migrations/$migration"
done

log "Add early-years class to exercise non-numeric Student setup"
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 <<'SQL'
INSERT INTO school_classes(school_id,class_name,section,academic_year,is_active)
SELECT id,'PN','A',academic_year,TRUE
FROM schools
WHERE id='10000000-0000-0000-0000-000000000001'
ON CONFLICT (school_id,class_name,section,academic_year)
DO UPDATE SET is_active=TRUE;
SQL

log "Start API with production-equivalent ten-minute default access lifetime"
cd "$ROOT/backend"
env \
  PORT=5000 \
  NODE_ENV=development \
  DB_HOST="$DB_HOST" \
  DB_PORT="$DB_PORT" \
  DB_NAME="$DB_NAME" \
  DB_USER="$DB_USER" \
  DB_PASSWORD="$PGPASSWORD" \
  REDIS_URL=redis://127.0.0.1:6379 \
  SMS_PROVIDER=mock \
  WHATSAPP_PROVIDER=mock \
  AI_PROVIDER=mock \
  FRONTEND_URL=http://127.0.0.1:3000 \
  nohup npm start > /tmp/vidyasetu-student-workflow-api.log 2>&1 &
API_PID=$!
cd "$ROOT"
trap 'kill "$API_PID" 2>/dev/null || true' EXIT

for i in {1..40}; do
  if curl -fsS http://127.0.0.1:5000/health >/dev/null; then break; fi
  sleep 1
  if [[ "$i" -eq 40 ]]; then
    cat /tmp/vidyasetu-student-workflow-api.log || true
    exit 1
  fi
done

log "Certify Student grade/setup contract"
OPTIONS="$(curl -fsS "$API_BASE/auth/student-registration-options")"
test "$(jq -c '.data.gradeLevels' <<< "$OPTIONS")" = '["PN","NURSERY","LKG","UKG","1","2","3","4","5","6","7","8","9","10","11","12"]'
test "$(jq -r '[.data.schools[].classes[] | select(.className=="PN")] | length' <<< "$OPTIONS")" -ge 1

SEND="$(curl -fsS -X POST "$API_BASE/auth/send-otp" -H 'Content-Type: application/json' -d '{"mobile":"9300000001","role":"STUDENT"}')"
OTP="$(jq -er '.data.otp' <<< "$SEND")"
LOGIN="$(curl -fsS -X POST "$API_BASE/auth/verify-otp" -H 'Content-Type: application/json' -d "{\"mobile\":\"9300000001\",\"otp\":\"$OTP\",\"role\":\"STUDENT\"}")"
TOKEN="$(jq -er '.data.accessToken' <<< "$LOGIN")"
SETUP="$(curl -fsS "$API_BASE/student/profile/setup-options" -H "Authorization: Bearer $TOKEN")"
test "$(jq -c '.data.gradeLevels' <<< "$SETUP")" = '["PN","NURSERY","LKG","UKG","1","2","3","4","5","6","7","8","9","10","11","12"]'
test "$(jq -r '[.data.schools[].classes[] | select(.className=="PN")] | length' <<< "$SETUP")" -ge 1

log "Run established complete Student API E2E"
API_BASE="$API_BASE" \
CI_MOBILE=9399999999 \
CI_EMAIL=ci.student@vidyasetu.test \
CI_USERNAME=ci.student \
CI_PASSWORD=Student12345 \
CI_RESET_PASSWORD=Student54321 \
bash scripts/student-e2e-smoke.sh

log "Certify global session logout and refresh revocation"
API_BASE="$API_BASE" STUDENT_MOBILE=9300000001 bash scripts/session-security-e2e-smoke.sh

log "Validate Student persistence and session revocation"
test "$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -Atc "SELECT COUNT(*) FROM users u JOIN students s ON s.user_id=u.id WHERE u.mobile='9399999999' AND u.username='ci.student' AND u.email='ci.student@vidyasetu.test' AND s.school_link_status='APPROVED' AND s.roll_number='CI8A99';")" = "1"
test "$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -Atc "SELECT COUNT(*) FROM parent_student_links p JOIN students s ON s.id=p.student_id JOIN users u ON u.id=s.user_id JOIN users pu ON pu.id=p.parent_user_id WHERE u.mobile='9399999999' AND pu.mobile='9400000001';")" = "1"
test "$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -Atc "SELECT COUNT(*) FROM attendance a JOIN students s ON s.id=a.student_id JOIN users u ON u.id=s.user_id WHERE u.mobile='9399999999' AND a.status='PRESENT';")" -ge 1
test "$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -Atc "SELECT COUNT(*) FROM refresh_tokens rt JOIN users u ON u.id=rt.user_id WHERE u.mobile='9300000001' AND rt.device_info='session-security-e2e' AND rt.revoked_at IS NOT NULL;")" -ge 1

echo "STUDENT WORKFLOW E2E CERTIFIED — IDENTITY, SCHOOL/PARENT LINKAGE, ATTENDANCE, LEARNING, ASSESSMENT, AI, SECURITY AND SESSION REVOCATION"
