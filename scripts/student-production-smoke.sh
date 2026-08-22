#!/usr/bin/env bash
set -Eeuo pipefail

API_BASE="${API_BASE:-http://127.0.0.1:5000/api/v1}"
WEB_BASE="${WEB_BASE:-http://127.0.0.1:3000}"
SEED_MOBILE="${SEED_MOBILE:-9300000001}"
HEALTH_URL="${HEALTH_URL:-${API_BASE%/api/v1}/health}"
ALLOW_MOCK_AUTH_SMOKE="${ALLOW_MOCK_AUTH_SMOKE:-0}"

log() { printf '\n==> %s\n' "$*"; }
fail() { printf '\nFAILED: %s\n' "$*" >&2; exit 1; }

log "Backend/API availability"
if ! curl -fsS "$HEALTH_URL" >/dev/null 2>&1; then
  log "Dedicated health URL is not exposed here; validating backend through the Student registration API instead"
fi

log "Public Student registration contract"
OPTIONS="$(curl -fsS "$API_BASE/auth/student-registration-options")" || fail "Student registration API is not reachable"
[[ "$(jq -r '.data.schools | length' <<< "$OPTIONS")" -ge 1 ]] || fail "No active School registration options"
[[ "$(jq -r '.data.gradeLevels | length' <<< "$OPTIONS")" -eq 12 ]] || fail "Student grade options are incomplete"

log "Production Next.js routes"
for path in \
  / \
  /for-students \
  /for-schools \
  /for-parents \
  /competition \
  /communities \
  /groups-info \
  /platform-admin \
  /login \
  /register \
  /student \
  /school/enrollments \
  /school/overview \
  /parent/dashboard \
  /admin/analytics; do
  code="$(curl -sS -o /dev/null -w '%{http_code}' "$WEB_BASE$path")"
  [[ "$code" =~ ^(200|301|302|307|308)$ ]] || fail "$path returned HTTP $code"
done

if [[ "$ALLOW_MOCK_AUTH_SMOKE" == "1" ]]; then
  log "Explicit mock/development authenticated Student smoke"
  SEND="$(curl -fsS -X POST "$API_BASE/auth/send-otp" -H 'Content-Type: application/json' -d "{\"mobile\":\"$SEED_MOBILE\",\"role\":\"STUDENT\"}")"
  OTP="$(jq -r '.data.otp // empty' <<< "$SEND")"
  [[ -n "$OTP" ]] || fail "ALLOW_MOCK_AUTH_SMOKE=1 requires an environment that exposes the development/test OTP"
  LOGIN="$(curl -fsS -X POST "$API_BASE/auth/verify-otp" -H 'Content-Type: application/json' -d "{\"mobile\":\"$SEED_MOBILE\",\"otp\":\"$OTP\",\"role\":\"STUDENT\"}")"
  TOKEN="$(jq -er '.data.accessToken' <<< "$LOGIN")"
  DASH="$(curl -fsS "$API_BASE/student/dashboard" -H "Authorization: Bearer $TOKEN")"
  [[ "$(jq -r '.data.student.mobile' <<< "$DASH")" == "$SEED_MOBILE" ]] || fail "Seeded Student dashboard identity mismatch"
  [[ "$(jq -r '.data.student.schoolLinkStatus' <<< "$DASH")" == "APPROVED" ]] || fail "Seeded Student School link is not approved"
  if jq -e '.data.student | has("xpTotal") or has("xpLevel") or has("streakCurrent")' <<< "$DASH" >/dev/null; then
    fail "Production Student dashboard still exposes XP/streak fields"
  fi
else
  log "Authenticated OTP smoke intentionally skipped: production/read-only smoke must never send a real SMS. Full auth E2E is covered in disposable CI."
fi

log "Production Student smoke passed"
