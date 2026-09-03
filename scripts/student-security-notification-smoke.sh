#!/usr/bin/env bash
set -Eeuo pipefail

API_BASE="${API_BASE:-http://127.0.0.1:5000/api/v1}"
STUDENT_MOBILE="${STUDENT_MOBILE:-9300000001}"

log() { printf '\n==> %s\n' "$*"; }
fail() { printf '\nFAILED: %s\n' "$*" >&2; exit 1; }
json_get() { jq -er "$2" <<< "$1"; }

request() {
  local method="$1" url="$2" body="${3:-}" token="${4:-}"
  local args=(-fsS -X "$method" "$url" -H 'Content-Type: application/json')
  [[ -n "$token" ]] && args+=(-H "Authorization: Bearer $token")
  [[ -n "$body" ]] && args+=(-d "$body")
  curl "${args[@]}"
}

expect_status() {
  local expected="$1" method="$2" url="$3" body="${4:-}" token="${5:-}"
  local tmp code
  tmp="$(mktemp)"
  local args=(-sS -o "$tmp" -w '%{http_code}' -X "$method" "$url" -H 'Content-Type: application/json')
  [[ -n "$token" ]] && args+=(-H "Authorization: Bearer $token")
  [[ -n "$body" ]] && args+=(-d "$body")
  code="$(curl "${args[@]}")"
  LAST_BODY="$(cat "$tmp")"
  rm -f "$tmp"
  [[ "$code" == "$expected" ]] || fail "$method $url expected HTTP $expected, got $code: $LAST_BODY"
}

otp_session() {
  local device="$1" send otp
  send="$(request POST "$API_BASE/auth/send-otp" "$(jq -nc --arg m "$STUDENT_MOBILE" '{mobile:$m,role:"STUDENT"}')")"
  otp="$(json_get "$send" '.data.otp')"
  [[ "$otp" =~ ^[0-9]{6}$ ]] || fail "Development OTP missing for $STUDENT_MOBILE"
  request POST "$API_BASE/auth/verify-otp" "$(jq -nc --arg m "$STUDENT_MOBILE" --arg o "$otp" --arg d "$device" '{mobile:$m,otp:$o,role:"STUDENT",deviceInfo:$d}')"
}

log "Create two independent Student sessions"
FIRST_LOGIN="$(otp_session 'security-ci-first-device')"
FIRST_ACCESS="$(json_get "$FIRST_LOGIN" '.data.accessToken')"
FIRST_REFRESH="$(json_get "$FIRST_LOGIN" '.data.refreshToken')"
SECOND_LOGIN="$(otp_session 'security-ci-current-device')"
SECOND_ACCESS="$(json_get "$SECOND_LOGIN" '.data.accessToken')"
SECOND_REFRESH="$(json_get "$SECOND_LOGIN" '.data.refreshToken')"

[[ "$(json_get "$SECOND_LOGIN" '.data.user.role')" == "STUDENT" ]] || fail "Second session returned wrong role"
[[ "$FIRST_ACCESS" != "$SECOND_ACCESS" || "$FIRST_REFRESH" != "$SECOND_REFRESH" ]] || fail "Independent logins returned identical tokens"

log "Active-session API is account-isolated and exposes device context"
SESSIONS="$(request GET "$API_BASE/auth/sessions" '' "$SECOND_ACCESS")"
ACTIVE_COUNT="$(jq -r '.data | length' <<< "$SESSIONS")"
[[ "$ACTIVE_COUNT" -ge 2 ]] || fail "Expected at least two active sessions, got $ACTIVE_COUNT"
[[ "$(jq -r '[.data[] | select(.deviceInfo=="security-ci-first-device")] | length' <<< "$SESSIONS")" -ge 1 ]] || fail "First device is missing from active sessions"
[[ "$(jq -r '[.data[] | select(.deviceInfo=="security-ci-current-device")] | length' <<< "$SESSIONS")" -ge 1 ]] || fail "Current device is missing from active sessions"

log "Sign out other devices while preserving the current refresh session"
REVOKED="$(request POST "$API_BASE/auth/sessions/revoke-others" "$(jq -nc --arg t "$SECOND_REFRESH" '{refreshToken:$t}')" "$SECOND_ACCESS")"
[[ "$(json_get "$REVOKED" '.data.revokedCount')" -ge 1 ]] || fail "No other session was revoked"
AFTER="$(request GET "$API_BASE/auth/sessions" '' "$SECOND_ACCESS")"
[[ "$(jq -r '.data | length' <<< "$AFTER")" == "1" ]] || fail "Expected one active refresh session after revoke-others"
[[ "$(jq -r '.data[0].deviceInfo' <<< "$AFTER")" == "security-ci-current-device" ]] || fail "Current session was not preserved"

log "Revoked refresh token can no longer mint access; current refresh still works"
expect_status 401 POST "$API_BASE/auth/refresh" "$(jq -nc --arg t "$FIRST_REFRESH" '{refreshToken:$t}')"
CURRENT_REFRESH="$(request POST "$API_BASE/auth/refresh" "$(jq -nc --arg t "$SECOND_REFRESH" '{refreshToken:$t}')")"
[[ "$(json_get "$CURRENT_REFRESH" '.data.accessToken' | wc -c)" -gt 20 ]] || fail "Current refresh token stopped working"

log "Student notification read-all persists and is account-scoped"
BEFORE_NOTIFICATIONS="$(request GET "$API_BASE/student/notifications" '' "$SECOND_ACCESS")"
UNREAD_BEFORE="$(jq -r '[.data[] | select(.is_read==false)] | length' <<< "$BEFORE_NOTIFICATIONS")"
[[ "$UNREAD_BEFORE" -ge 2 ]] || fail "Expected seeded CI unread notifications, got $UNREAD_BEFORE"
READ_ALL="$(request PATCH "$API_BASE/student/notifications/read-all" '{}' "$SECOND_ACCESS")"
UPDATED="$(json_get "$READ_ALL" '.data.updatedCount')"
[[ "$UPDATED" -ge 2 ]] || fail "Read-all did not update the expected notifications"
AFTER_NOTIFICATIONS="$(request GET "$API_BASE/student/notifications" '' "$SECOND_ACCESS")"
[[ "$(jq -r '[.data[] | select(.is_read==false)] | length' <<< "$AFTER_NOTIFICATIONS")" == "0" ]] || fail "Unread notifications remain after read-all"
[[ "$(jq -r '[.data[] | select(.read_at==null)] | length' <<< "$AFTER_NOTIFICATIONS")" == "0" ]] || fail "Read timestamp was not persisted"

printf '\nStudent Security + Notifications smoke passed.\n'
printf 'Active sessions after revoke: %s\n' "$(jq -r '.data | length' <<< "$AFTER")"
printf 'Notifications marked read: %s\n' "$UPDATED"
