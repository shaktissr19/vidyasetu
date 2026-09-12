#!/usr/bin/env bash
set -Eeuo pipefail

API_BASE="${API_BASE:-http://127.0.0.1:5000/api/v1}"
PARENT_MOBILE="${PARENT_MOBILE:-9400000001}"
EXPECTED_CHILD="${EXPECTED_CHILD:-30000000-0000-0000-0000-000000000001}"
FORBIDDEN_CHILD="${FORBIDDEN_CHILD:-30000000-0000-0000-0000-000000000002}"

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

bearer_get() {
  local token="$1" url="$2"
  curl -fsS "$url" -H "Authorization: Bearer $token"
}

http_status() {
  local token="$1" url="$2"
  curl -sS -o /tmp/parent-workflow-body.json -w '%{http_code}' "$url" -H "Authorization: Bearer $token"
}

expect_data() {
  local token="$1" path="$2" label="$3" response
  response="$(bearer_get "$token" "$API_BASE$path")" || fail "$label endpoint failed"
  jq -e '.data != null' <<< "$response" >/dev/null || fail "$label response data missing"
  printf '%-42s OK\n' "$label"
}

log "Authenticate seeded Parent"
SEND="$(api_post "$API_BASE/auth/send-otp" "{\"mobile\":\"$PARENT_MOBILE\"}")"
OTP="$(json_get "$SEND" '.data.otp')"
[[ "$OTP" =~ ^[0-9]{6}$ ]] || fail "Development OTP missing for Parent"
LOGIN="$(api_post "$API_BASE/auth/verify-otp" "$(jq -nc --arg mobile "$PARENT_MOBILE" --arg otp "$OTP" '{mobile:$mobile,otp:$otp,role:"PARENT",deviceInfo:"parent-workflow-e2e"}')")"
TOKEN="$(json_get "$LOGIN" '.data.accessToken')"
[[ "$(json_get "$LOGIN" '.data.user.role')" == "PARENT" ]] || fail "Parent role mismatch"

log "Multi-child identity and linked-child isolation"
CHILDREN="$(bearer_get "$TOKEN" "$API_BASE/parent/children")"
(( $(json_get "$CHILDREN" '.data | length') >= 2 )) || fail "Seeded Parent must have at least two linked children for switch isolation"
[[ "$(jq -r --arg id "$EXPECTED_CHILD" '[.data[] | select(.id == $id)] | length' <<< "$CHILDREN")" -eq 1 ]] || fail "Expected linked child missing"
SECOND_CHILD="$(jq -r --arg id "$EXPECTED_CHILD" '.data[] | select(.id != $id) | .id' <<< "$CHILDREN" | head -n1)"
[[ -n "$SECOND_CHILD" ]] || fail "Second linked child missing"

for child in "$EXPECTED_CHILD" "$SECOND_CHILD"; do
  DASH="$(bearer_get "$TOKEN" "$API_BASE/parent/children/$child/dashboard")"
  [[ "$(json_get "$DASH" '.data.student.id')" == "$child" ]] || fail "Dashboard switched to the wrong child"
done

for path in \
  "/parent/children/$FORBIDDEN_CHILD/dashboard" \
  "/parent/children/$FORBIDDEN_CHILD/homework" \
  "/parent/children/$FORBIDDEN_CHILD/achievements"; do
  [[ "$(http_status "$TOKEN" "$API_BASE$path")" == "403" ]] || fail "Unlinked child access was not rejected for $path"
done

log "Parent child story and academic visibility"
expect_data "$TOKEN" "/parent/children/$EXPECTED_CHILD/dashboard" "Dashboard story"
expect_data "$TOKEN" "/parent/children/$EXPECTED_CHILD/homework" "Homework visibility"
expect_data "$TOKEN" "/parent/children/$EXPECTED_CHILD/performance" "Performance"
expect_data "$TOKEN" "/parent/children/$EXPECTED_CHILD/report-card" "Report card"
expect_data "$TOKEN" "/parent/children/$EXPECTED_CHILD/fees" "Fees and receipts"
expect_data "$TOKEN" "/parent/children/$EXPECTED_CHILD/achievements" "Competitions and achievements"
expect_data "$TOKEN" "/parent/learning-insights/$EXPECTED_CHILD" "Learning insights"
expect_data "$TOKEN" "/parent/learning-support/$EXPECTED_CHILD" "Learning support"

CURRENT_YEAR="$(date +%Y)"
CURRENT_MONTH="$(date +%-m)"
expect_data "$TOKEN" "/parent/children/$EXPECTED_CHILD/attendance?year=$CURRENT_YEAR&month=$CURRENT_MONTH" "Attendance"

log "Parent School operations visibility"
expect_data "$TOKEN" "/parent/absence/children/$EXPECTED_CHILD/leave" "Leave"
expect_data "$TOKEN" "/parent/absence/children/$EXPECTED_CHILD/calendar" "School calendar"
expect_data "$TOKEN" "/parent/ptm/children/$EXPECTED_CHILD/options" "PTM options"
expect_data "$TOKEN" "/parent/ptm/children/$EXPECTED_CHILD/bookings" "PTM bookings"
expect_data "$TOKEN" "/parent/transport/children/$EXPECTED_CHILD" "Transport safety"
expect_data "$TOKEN" "/parent/documents/children/$EXPECTED_CHILD" "Documents"
expect_data "$TOKEN" "/parent/documents/children/$EXPECTED_CHILD/requests" "Certificate requests"

log "Parent communication and notifications"
expect_data "$TOKEN" "/parent/children/$EXPECTED_CHILD/teacher" "Class teacher"
expect_data "$TOKEN" "/parent/children/$EXPECTED_CHILD/messages" "Teacher messages"
expect_data "$TOKEN" "/parent/notifications" "Notifications"
expect_data "$TOKEN" "/parent/grievances" "Grievances"

log "Parent mutation boundary"
[[ "$(http_status "$TOKEN" "$API_BASE/admin/analytics")" == "403" ]] || fail "Parent can access Admin analytics"
[[ "$(http_status "$TOKEN" "$API_BASE/student/homework")" == "403" ]] || fail "Parent can impersonate Student homework API"
[[ "$(http_status "$TOKEN" "$API_BASE/competition/mine/list")" == "403" ]] || fail "Parent can impersonate Student competition API"

printf '\nParent Workflow E2E passed: multi-child switching, child isolation, academics, operations, communication and authorization are certified.\n'
