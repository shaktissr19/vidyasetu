#!/usr/bin/env bash
set -Eeuo pipefail

API_BASE="${API_BASE:-http://127.0.0.1:5000/api/v1}"
WEB_BASE="${WEB_BASE:-http://127.0.0.1:3000}"
SEED_MOBILE="${SEED_MOBILE:-9300000001}"

log() { printf '\n==> %s\n' "$*"; }
fail() { printf '\nFAILED: %s\n' "$*" >&2; exit 1; }

log "Backend health"
curl -fsS "${API_BASE%/api/v1}/health" >/dev/null || fail "Backend health endpoint failed"

log "Public Student registration contract"
OPTIONS="$(curl -fsS "$API_BASE/auth/student-registration-options")"
[[ "$(jq -r '.data.schools | length' <<< "$OPTIONS")" -ge 1 ]] || fail "No active School registration options"
[[ "$(jq -r '.data.gradeLevels | length' <<< "$OPTIONS")" -eq 12 ]] || fail "Student grade options are incomplete"

log "Production Next.js routes"
for path in / /login /register /student /school/enrollments /school/overview /parent/dashboard /admin/analytics; do
  code="$(curl -sS -o /dev/null -w '%{http_code}' "$WEB_BASE$path")"
  [[ "$code" =~ ^(200|301|302|307|308)$ ]] || fail "$path returned HTTP $code"
done

log "Seeded authenticated read smoke when a development/mock OTP is exposed"
SEND="$(curl -fsS -X POST "$API_BASE/auth/send-otp" -H 'Content-Type: application/json' -d "{\"mobile\":\"$SEED_MOBILE\"}")"
OTP="$(jq -r '.data.otp // empty' <<< "$SEND")"
if [[ -n "$OTP" ]]; then
  LOGIN="$(curl -fsS -X POST "$API_BASE/auth/verify-otp" -H 'Content-Type: application/json' -d "{\"mobile\":\"$SEED_MOBILE\",\"otp\":\"$OTP\",\"role\":\"STUDENT\"}")"
  TOKEN="$(jq -er '.data.accessToken' <<< "$LOGIN")"
  DASH="$(curl -fsS "$API_BASE/student/dashboard" -H "Authorization: Bearer $TOKEN")"
  [[ "$(jq -r '.data.student.mobile' <<< "$DASH")" == "$SEED_MOBILE" ]] || fail "Seeded Student dashboard identity mismatch"
  [[ "$(jq -r '.data.student.schoolLinkStatus' <<< "$DASH")" == "APPROVED" ]] || fail "Seeded Student School link is not approved"
  if jq -e '.data.student | has("xpTotal") or has("xpLevel") or has("streakCurrent")' <<< "$DASH" >/dev/null; then
    fail "Production Student dashboard still exposes XP/streak fields"
  fi
else
  log "NODE_ENV does not expose development OTP; skipping authenticated smoke without mutating or bypassing production auth"
fi

log "Production Student smoke passed"
