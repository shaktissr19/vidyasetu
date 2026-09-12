#!/usr/bin/env bash
set -Eeuo pipefail

API_BASE="${API_BASE:-http://127.0.0.1:5000/api/v1}"
ADMIN_MOBILE="${ADMIN_MOBILE:-9000000000}"
PARENT_MOBILE="${PARENT_MOBILE:-9400000001}"
SUPPORT_SUBJECT="${SUPPORT_SUBJECT:-Admin E2E governance ticket}"
CONFIG_KEY="${CONFIG_KEY:-OFFLINE_SYNC_INTERVAL_MINS}"

log() { printf '\n==> %s\n' "$*"; }
fail() { printf '\nFAILED: %s\n' "$*" >&2; exit 1; }
json_get() { jq -er "$2" <<< "$1"; }

api_post() {
  local url="$1" body="$2" token="${3:-}"
  if [[ -n "$token" ]]; then
    curl -fsS -X POST "$url" -H "Authorization: Bearer $token" -H 'Content-Type: application/json' -d "$body"
  else
    curl -fsS -X POST "$url" -H 'Content-Type: application/json' -d "$body"
  fi
}

api_patch() {
  local url="$1" body="$2" token="$3"
  curl -fsS -X PATCH "$url" -H "Authorization: Bearer $token" -H 'Content-Type: application/json' -d "$body"
}

bearer_get() {
  local token="$1" url="$2"
  curl -fsS "$url" -H "Authorization: Bearer $token"
}

otp_session() {
  local mobile="$1" role="$2" send otp
  send="$(api_post "$API_BASE/auth/send-otp" "{\"mobile\":\"$mobile\"}")"
  otp="$(json_get "$send" '.data.otp')"
  [[ "$otp" =~ ^[0-9]{6}$ ]] || fail "Development OTP missing for $mobile"
  api_post "$API_BASE/auth/verify-otp" "$(jq -nc --arg mobile "$mobile" --arg otp "$otp" --arg role "$role" '{mobile:$mobile,otp:$otp,role:$role,deviceInfo:"admin-workflow-e2e"}')"
}

http_status_get() {
  local token="$1" url="$2"
  curl -sS -o /tmp/admin-e2e-body.json -w '%{http_code}' "$url" -H "Authorization: Bearer $token"
}

http_status_patch() {
  local token="$1" url="$2" body="$3"
  curl -sS -o /tmp/admin-e2e-body.json -w '%{http_code}' -X PATCH "$url" -H "Authorization: Bearer $token" -H 'Content-Type: application/json' -d "$body"
}

urlencode() { jq -nr --arg v "$1" '$v|@uri'; }

log "Authenticate seeded Super Admin"
ADMIN_LOGIN="$(otp_session "$ADMIN_MOBILE" SUPER_ADMIN)"
ADMIN_TOKEN="$(json_get "$ADMIN_LOGIN" '.data.accessToken')"
ADMIN_ID="$(json_get "$ADMIN_LOGIN" '.data.user.id')"
[[ "$(json_get "$ADMIN_LOGIN" '.data.user.role')" == "SUPER_ADMIN" ]] || fail "Admin role mismatch"

log "Authenticate Parent and prove Admin isolation"
PARENT_LOGIN="$(otp_session "$PARENT_MOBILE" PARENT)"
PARENT_TOKEN="$(json_get "$PARENT_LOGIN" '.data.accessToken')"
[[ "$(http_status_get "$PARENT_TOKEN" "$API_BASE/admin/audit")" == "403" ]] || fail "Parent can access Admin audit"
[[ "$(http_status_get "$PARENT_TOKEN" "$API_BASE/admin/support")" == "403" ]] || fail "Parent can access Admin support"
[[ "$(http_status_get "$PARENT_TOKEN" "$API_BASE/admin/config")" == "403" ]] || fail "Parent can access Admin config"

log "Admin control-plane reads"
ANALYTICS="$(bearer_get "$ADMIN_TOKEN" "$API_BASE/admin/analytics")"
json_get "$ANALYTICS" '.data.students.total' >/dev/null || fail "Analytics students missing"
json_get "$ANALYTICS" '.data.roleBreakdown' >/dev/null || fail "Analytics role breakdown missing"
SCHOOLS="$(bearer_get "$ADMIN_TOKEN" "$API_BASE/admin/schools?limit=10")"
json_get "$SCHOOLS" '.meta.total' >/dev/null || fail "School pagination metadata missing"
USERS="$(bearer_get "$ADMIN_TOKEN" "$API_BASE/admin/users?limit=10")"
json_get "$USERS" '.meta.total' >/dev/null || fail "User pagination metadata missing"
CONFIG="$(bearer_get "$ADMIN_TOKEN" "$API_BASE/admin/config")"
(( $(json_get "$CONFIG" '.data | length') >= 1 )) || fail "Platform config missing"
AUDIT_INITIAL="$(bearer_get "$ADMIN_TOKEN" "$API_BASE/admin/audit?limit=10")"
json_get "$AUDIT_INITIAL" '.meta.total' >/dev/null || fail "Audit pagination metadata missing"

log "Protect Super Admin identity at API level"
SELF_STATUS="$(http_status_patch "$ADMIN_TOKEN" "$API_BASE/admin/users/$ADMIN_ID/status" '{"status":"SUSPENDED"}')"
[[ "$SELF_STATUS" == "400" ]] || { cat /tmp/admin-e2e-body.json >&2 || true; fail "Super Admin suspension was not rejected; HTTP $SELF_STATUS"; }

log "Reject invalid Admin mutations"
BAD_CONFIG="$(http_status_patch "$ADMIN_TOKEN" "$API_BASE/admin/config/$CONFIG_KEY" '{"value":{"unsafe":true}}')"
[[ "$BAD_CONFIG" == "400" ]] || fail "Object config payload must be rejected; got HTTP $BAD_CONFIG"
BAD_SUPPORT="$(http_status_patch "$ADMIN_TOKEN" "$API_BASE/admin/support/00000000-0000-0000-0000-000000000000" '{"status":"BROKEN"}')"
[[ "$BAD_SUPPORT" == "400" ]] || fail "Invalid support lifecycle status must be rejected; got HTTP $BAD_SUPPORT"

log "Governed support lifecycle"
ENCODED_SUBJECT="$(urlencode "$SUPPORT_SUBJECT")"
SUPPORT="$(bearer_get "$ADMIN_TOKEN" "$API_BASE/admin/support?status=OPEN&search=$ENCODED_SUBJECT&limit=20")"
SUPPORT_ID="$(jq -er --arg subject "$SUPPORT_SUBJECT" '.data[] | select(.subject == $subject) | .id' <<< "$SUPPORT" | head -n1)"
[[ -n "$SUPPORT_ID" ]] || fail "Disposable Admin support fixture missing"

STARTED="$(api_patch "$API_BASE/admin/support/$SUPPORT_ID" '{"status":"IN_PROGRESS"}' "$ADMIN_TOKEN")"
[[ "$(json_get "$STARTED" '.data.status')" == "IN_PROGRESS" ]] || fail "Support ticket did not enter IN_PROGRESS"

NO_RESOLUTION="$(http_status_patch "$ADMIN_TOKEN" "$API_BASE/admin/support/$SUPPORT_ID" '{"status":"RESOLVED","resolution":""}')"
[[ "$NO_RESOLUTION" == "400" ]] || fail "Resolving without note must be rejected; got HTTP $NO_RESOLUTION"

RESOLUTION_NOTE="Resolved by Admin workflow E2E"
RESOLVED="$(api_patch "$API_BASE/admin/support/$SUPPORT_ID" "$(jq -nc --arg note "$RESOLUTION_NOTE" '{status:"RESOLVED",resolution:$note}')" "$ADMIN_TOKEN")"
[[ "$(json_get "$RESOLVED" '.data.status')" == "RESOLVED" ]] || fail "Support ticket was not resolved"
[[ "$(json_get "$RESOLVED" '.data.resolution')" == "$RESOLUTION_NOTE" ]] || fail "Support resolution note mismatch"

CLOSED="$(api_patch "$API_BASE/admin/support/$SUPPORT_ID" '{"status":"CLOSED"}' "$ADMIN_TOKEN")"
[[ "$(json_get "$CLOSED" '.data.status')" == "CLOSED" ]] || fail "Support ticket was not closed"

log "Support lifecycle audit evidence"
SUPPORT_AUDIT="$(bearer_get "$ADMIN_TOKEN" "$API_BASE/admin/audit?action=SUPPORT_RESOLVED&entityType=support_ticket&search=$SUPPORT_ID&limit=20")"
(( $(jq -r --arg id "$SUPPORT_ID" '[.data[] | select(.entity_id == $id and .action == "SUPPORT_RESOLVED")] | length' <<< "$SUPPORT_AUDIT") >= 1 )) || fail "SUPPORT_RESOLVED audit event missing"

log "Governed configuration mutation and restoration"
ORIGINAL_VALUE="$(jq -er --arg key "$CONFIG_KEY" '.data[] | select(.key == $key) | .value' <<< "$CONFIG" | head -n1)"
[[ -n "$ORIGINAL_VALUE" ]] || fail "Config key $CONFIG_KEY missing"
if [[ "$ORIGINAL_VALUE" =~ ^-?[0-9]+([.][0-9]+)?$ ]]; then
  CHANGED_VALUE="$(awk -v v="$ORIGINAL_VALUE" 'BEGIN { print v + 1 }')"
else
  CHANGED_VALUE="${ORIGINAL_VALUE}-e2e"
fi

CHANGED="$(api_patch "$API_BASE/admin/config/$CONFIG_KEY" "$(jq -nc --arg value "$CHANGED_VALUE" '{value:$value}')" "$ADMIN_TOKEN")"
[[ "$(json_get "$CHANGED" '.data.key')" == "$CONFIG_KEY" ]] || fail "Config update key mismatch"
[[ "$(json_get "$CHANGED" '.data.value' | tr -d '"')" == "$CHANGED_VALUE" ]] || fail "Config update value mismatch"

RESTORED="$(api_patch "$API_BASE/admin/config/$CONFIG_KEY" "$(jq -nc --arg value "$ORIGINAL_VALUE" '{value:$value}')" "$ADMIN_TOKEN")"
[[ "$(json_get "$RESTORED" '.data.value' | tr -d '"')" == "$ORIGINAL_VALUE" ]] || fail "Config value was not restored"

CONFIG_AUDIT="$(bearer_get "$ADMIN_TOKEN" "$API_BASE/admin/audit?action=CONFIG_UPDATE&entityType=platform_config&limit=50")"
(( $(jq -r --arg key "$CONFIG_KEY" '[.data[] | select(.new_value.key == $key)] | length' <<< "$CONFIG_AUDIT") >= 2 )) || fail "Config update/restore audit evidence missing"

log "Admin workflow E2E passed"
