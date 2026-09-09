#!/usr/bin/env bash
set -Eeuo pipefail

API_BASE="${API_BASE:-http://127.0.0.1:5000/api/v1}"
STUDENT_MOBILE="${STUDENT_MOBILE:-9300000001}"

log() { printf '\n==> %s\n' "$*"; }
fail() { printf '\nFAILED: %s\n' "$*" >&2; exit 1; }
json_get() { jq -er "$2" <<< "$1"; }

post_json() {
  local url="$1" body="$2"
  curl -fsS -X POST "$url" -H 'Content-Type: application/json' -d "$body"
}

log "Registration options expose the complete Student grade range"
OPTIONS="$(curl -fsS "$API_BASE/auth/student-registration-options")"
EXPECTED='["PN","NURSERY","LKG","UKG","1","2","3","4","5","6","7","8","9","10","11","12"]'
ACTUAL="$(jq -c '.data.gradeLevels' <<< "$OPTIONS")"
[[ "$ACTUAL" == "$EXPECTED" ]] || fail "Registration grade range mismatch: $ACTUAL"

log "Issue a Student session"
OTP_RESPONSE="$(post_json "$API_BASE/auth/send-otp" "$(jq -nc --arg mobile "$STUDENT_MOBILE" '{mobile:$mobile,role:"STUDENT"}')")"
OTP="$(json_get "$OTP_RESPONSE" '.data.otp')"
SESSION="$(post_json "$API_BASE/auth/verify-otp" "$(jq -nc --arg mobile "$STUDENT_MOBILE" --arg otp "$OTP" '{mobile:$mobile,otp:$otp,role:"STUDENT",deviceInfo:"session-security-e2e"}')")"
ACCESS_TOKEN="$(json_get "$SESSION" '.data.accessToken')"
REFRESH_TOKEN="$(json_get "$SESSION" '.data.refreshToken')"

log "Access token lifetime is approximately ten minutes"
JWT_PAYLOAD="$(cut -d. -f2 <<< "$ACCESS_TOKEN" | tr '_-' '/+' | awk '{l=length($0)%4; if(l==2)$0=$0"=="; else if(l==3)$0=$0"="; print}')"
DECODED="$(printf '%s' "$JWT_PAYLOAD" | base64 -d 2>/dev/null || true)"
IAT="$(jq -er '.iat' <<< "$DECODED")"
EXP="$(jq -er '.exp' <<< "$DECODED")"
TTL="$((EXP-IAT))"
(( TTL >= 590 && TTL <= 610 )) || fail "Access token TTL must be about 600 seconds, got $TTL"

log "Refresh token works before logout"
REFRESH_BEFORE="$(post_json "$API_BASE/auth/refresh" "$(jq -nc --arg refreshToken "$REFRESH_TOKEN" '{refreshToken:$refreshToken}')")"
[[ -n "$(json_get "$REFRESH_BEFORE" '.data.accessToken')" ]] || fail "Active refresh token did not issue an access token"

log "Logout revokes refresh token even without an Authorization header"
LOGOUT="$(post_json "$API_BASE/auth/logout" "$(jq -nc --arg refreshToken "$REFRESH_TOKEN" '{refreshToken:$refreshToken}')")"
[[ "$(json_get "$LOGOUT" '.data.message')" == "Logged out successfully" ]] || fail "Refresh-token-only logout failed"

log "Revoked refresh token cannot silently restore a session"
STATUS="$(curl -sS -o /tmp/session-refresh-after-logout.json -w '%{http_code}' \
  -X POST "$API_BASE/auth/refresh" -H 'Content-Type: application/json' \
  -d "$(jq -nc --arg refreshToken "$REFRESH_TOKEN" '{refreshToken:$refreshToken}')")"
[[ "$STATUS" == "401" ]] || { cat /tmp/session-refresh-after-logout.json >&2 || true; fail "Expected revoked refresh token to return 401, got $STATUS"; }

echo "SESSION SECURITY E2E CERTIFIED — 10-MINUTE ACCESS TOKEN, COMPLETE STUDENT GRADES, REFRESH-TOKEN-ONLY LOGOUT AND REVOCATION"
