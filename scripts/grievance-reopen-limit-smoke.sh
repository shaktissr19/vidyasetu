#!/usr/bin/env bash
set -Eeuo pipefail

API_BASE="${API_BASE:-http://127.0.0.1:5000/api/v1}"
DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-vidyasetu_db}"
DB_USER="${DB_USER:-postgres}"
export PGPASSWORD="${DB_PASSWORD:-postgres}"
PARENT_MOBILE="${PARENT_MOBILE:-9400000001}"
SCHOOL_ADMIN_MOBILE="${SCHOOL_ADMIN_MOBILE:-9100000001}"

fail(){ printf '\nFAILED: %s\n' "$*" >&2; exit 1; }
json_get(){ jq -er "$2" <<<"$1"; }

request(){
  local method="$1" url="$2" body="${3:-}" token="${4:-}"
  local args=(-fsS -X "$method" "$url" -H 'Content-Type: application/json')
  [[ -n "$token" ]] && args+=(-H "Authorization: Bearer $token")
  [[ -n "$body" ]] && args+=(-d "$body")
  curl "${args[@]}"
}

expect_status(){
  local expected="$1" method="$2" url="$3" body="${4:-}" token="${5:-}"
  local tmp code
  tmp="$(mktemp)"
  local args=(-sS -o "$tmp" -w '%{http_code}' -X "$method" "$url" -H 'Content-Type: application/json')
  [[ -n "$token" ]] && args+=(-H "Authorization: Bearer $token")
  [[ -n "$body" ]] && args+=(-d "$body")
  code="$(curl "${args[@]}")"
  LAST_BODY="$(cat "$tmp")"; rm -f "$tmp"
  [[ "$code" == "$expected" ]] || fail "$method $url expected HTTP $expected, got $code: $LAST_BODY"
}

otp_session(){
  local mobile="$1" role="$2" send otp
  send="$(request POST "$API_BASE/auth/send-otp" "$(jq -nc --arg m "$mobile" '{mobile:$m}')")"
  otp="$(json_get "$send" '.data.otp')"
  request POST "$API_BASE/auth/verify-otp" "$(jq -nc --arg m "$mobile" --arg o "$otp" --arg r "$role" '{mobile:$m,otp:$o,role:$r,deviceInfo:"grievance-reopen-limit"}')"
}

PARENT_TOKEN="$(json_get "$(otp_session "$PARENT_MOBILE" PARENT)" '.data.accessToken')"
SCHOOL_TOKEN="$(json_get "$(otp_session "$SCHOOL_ADMIN_MOBILE" SCHOOL_ADMIN)" '.data.accessToken')"
LIST="$(request GET "$API_BASE/parent/grievances" '' "$PARENT_TOKEN")"
GID="$(json_get "$LIST" '.data[0].id')"
CURRENT="$(request GET "$API_BASE/parent/grievances/$GID" '' "$PARENT_TOKEN")"
[[ "$(json_get "$CURRENT" '.data.status')" == "RESOLVED" ]] || fail "Expected lifecycle smoke to leave grievance RESOLVED"
[[ "$(json_get "$CURRENT" '.data.reopen_count | tonumber')" == "1" ]] || fail "Expected one prior reopen before limit test"
[[ "$(json_get "$CURRENT" '.data.reopen_limit | tonumber')" == "3" ]] || fail "Default configured reopen limit was not exposed"

CLOSED="$(request PATCH "$API_BASE/parent/grievances/$GID/action" '{"action":"CLOSE","note":"Close before configured reopen-limit test"}' "$PARENT_TOKEN")"
[[ "$(json_get "$CLOSED" '.data.status')" == "CLOSED" ]] || fail "Could not close grievance before limit test"

psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 \
  -c "UPDATE platform_config SET value='1' WHERE key='GRIEVANCE_REOPEN_LIMIT';" >/dev/null

LIMITED="$(request GET "$API_BASE/parent/grievances/$GID" '' "$PARENT_TOKEN")"
[[ "$(json_get "$LIMITED" '.data.reopen_limit | tonumber')" == "1" ]] || fail "Updated reopen limit was not reflected by API"
expect_status 409 PATCH "$API_BASE/parent/grievances/$GID/action" '{"action":"REOPEN","note":"This reopen must be blocked by configured limit"}' "$PARENT_TOKEN"

ESCALATED="$(request PATCH "$API_BASE/parent/grievances/$GID/action" '{"action":"ESCALATE","note":"Reopen limit reached; request Platform Admin review"}' "$PARENT_TOKEN")"
[[ "$(json_get "$ESCALATED" '.data.status')" == "ESCALATED" ]] || fail "Closed grievance could not escalate after reopen limit"
[[ "$(jq -r '.data.closed_at == null and .data.resolved_at == null and .data.escalated_at != null' <<<"$ESCALATED")" == "true" ]] || fail "Escalation did not clear stale closed/resolved timestamps"
expect_status 409 PATCH "$API_BASE/school/grievances/$GID/action" '{"action":"START","note":"School must not downgrade Platform escalation"}' "$SCHOOL_TOKEN"

psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 \
  -c "UPDATE platform_config SET value='3' WHERE key='GRIEVANCE_REOPEN_LIMIT';" >/dev/null

printf '\nGrievance reopen-limit edge smoke passed.\n'
