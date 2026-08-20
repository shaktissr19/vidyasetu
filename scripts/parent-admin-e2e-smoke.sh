#!/usr/bin/env bash
set -Eeuo pipefail

API_BASE="${API_BASE:-http://127.0.0.1:5000/api/v1}"
PARENT_MOBILE="${PARENT_MOBILE:-9400000001}"
ADMIN_MOBILE="${ADMIN_MOBILE:-9000000000}"
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
  api_post "$API_BASE/auth/verify-otp" "$(jq -nc --arg mobile "$mobile" --arg otp "$otp" --arg role "$role" '{mobile:$mobile,otp:$otp,role:$role,deviceInfo:"parent-admin-e2e"}')"
}

http_status() {
  local token="$1" url="$2"
  curl -sS -o /tmp/pa-e2e-body.json -w '%{http_code}' "$url" -H "Authorization: Bearer $token"
}

log "Authenticate seeded Parent"
PARENT_LOGIN="$(otp_session "$PARENT_MOBILE" PARENT)"
PARENT_TOKEN="$(json_get "$PARENT_LOGIN" '.data.accessToken')"
[[ "$(json_get "$PARENT_LOGIN" '.data.user.role')" == "PARENT" ]] || fail "Parent role mismatch"

log "Parent children and isolation"
CHILDREN="$(bearer_get "$PARENT_TOKEN" "$API_BASE/parent/children")"
(( $(json_get "$CHILDREN" '.data | length') >= 2 )) || fail "Seeded Parent should have multiple linked children"
[[ "$(jq -r --arg id "$EXPECTED_CHILD" '[.data[] | select(.id == $id)] | length' <<< "$CHILDREN")" -eq 1 ]] || fail "Expected linked child missing"
[[ "$(http_status "$PARENT_TOKEN" "$API_BASE/parent/children/$FORBIDDEN_CHILD/dashboard")" == "403" ]] || fail "Parent can access an unlinked child"

log "Parent overview aggregation"
DASH="$(bearer_get "$PARENT_TOKEN" "$API_BASE/parent/children/$EXPECTED_CHILD/dashboard")"
[[ "$(json_get "$DASH" '.data.student.id')" == "$EXPECTED_CHILD" ]] || fail "Parent dashboard child mismatch"
json_get "$DASH" '.data.attendance' >/dev/null || fail "Parent attendance block missing"
json_get "$DASH" '.data.subjectProgress' >/dev/null || fail "Parent subject progress missing"
json_get "$DASH" '.data.recentExams' >/dev/null || fail "Parent recent exams missing"
json_get "$DASH" '.data.fees' >/dev/null || fail "Parent fees missing"
json_get "$DASH" '.data.academicRanking' >/dev/null || fail "Parent academic ranking block missing"
json_get "$DASH" '.data.classTeacher' >/dev/null || fail "Parent class teacher block missing"

log "Parent performance, attendance and report card"
PERFORMANCE="$(bearer_get "$PARENT_TOKEN" "$API_BASE/parent/children/$EXPECTED_CHILD/performance")"
json_get "$PERFORMANCE" '.data.subjects' >/dev/null || fail "Parent performance subjects missing"
CURRENT_YEAR="$(date +%Y)"
CURRENT_MONTH="$(date +%-m)"
ATTENDANCE="$(bearer_get "$PARENT_TOKEN" "$API_BASE/parent/children/$EXPECTED_CHILD/attendance?year=$CURRENT_YEAR&month=$CURRENT_MONTH")"
json_get "$ATTENDANCE" '.data.records' >/dev/null || fail "Parent attendance records missing"
json_get "$ATTENDANCE" '.data.annualSummary' >/dev/null || fail "Parent annual attendance summary missing"
REPORT="$(bearer_get "$PARENT_TOKEN" "$API_BASE/parent/children/$EXPECTED_CHILD/report-card")"
(( $(json_get "$REPORT" '.data.results | length') >= 1 )) || fail "Parent report card has no scored school result"
[[ "$(json_get "$REPORT" '.data.student.id')" == "$EXPECTED_CHILD" ]] || fail "Parent report card child mismatch"

log "Parent class-teacher messaging"
TEACHER="$(bearer_get "$PARENT_TOKEN" "$API_BASE/parent/children/$EXPECTED_CHILD/teacher")"
TEACHER_NAME="$(json_get "$TEACHER" '.data.name')"
[[ -n "$TEACHER_NAME" ]] || fail "Class teacher not resolved"
MESSAGE="$(api_post "$API_BASE/parent/children/$EXPECTED_CHILD/messages" '{"body":"Parent/Admin E2E message"}' "$PARENT_TOKEN")"
[[ "$(json_get "$MESSAGE" '.data.body')" == "Parent/Admin E2E message" ]] || fail "Parent message was not created"
MESSAGES="$(bearer_get "$PARENT_TOKEN" "$API_BASE/parent/children/$EXPECTED_CHILD/messages")"
[[ "$(jq -r '[.data[] | select(.body == "Parent/Admin E2E message")] | length' <<< "$MESSAGES")" -ge 1 ]] || fail "Parent message not visible in conversation"

log "Parent notifications and read state"
NOTIFICATIONS="$(bearer_get "$PARENT_TOKEN" "$API_BASE/parent/notifications")"
json_get "$NOTIFICATIONS" '.data' >/dev/null || fail "Parent notifications missing"
NOTIFICATION_ID="$(jq -r '.data[] | select(.read_at == null) | .id' <<< "$NOTIFICATIONS" | head -n1)"
if [[ -n "$NOTIFICATION_ID" ]]; then
  READ_ONE="$(api_patch "$API_BASE/parent/notifications/$NOTIFICATION_ID/read" '{}' "$PARENT_TOKEN")"
  [[ "$(json_get "$READ_ONE" '.data.id')" == "$NOTIFICATION_ID" ]] || fail "Notification mark-read failed"
fi
api_patch "$API_BASE/parent/notifications/read-all" '{}' "$PARENT_TOKEN" >/dev/null

log "Authenticate seeded Super Admin"
ADMIN_LOGIN="$(otp_session "$ADMIN_MOBILE" SUPER_ADMIN)"
ADMIN_TOKEN="$(json_get "$ADMIN_LOGIN" '.data.accessToken')"
[[ "$(json_get "$ADMIN_LOGIN" '.data.user.role')" == "SUPER_ADMIN" ]] || fail "Admin role mismatch"

log "Reject Parent from Admin APIs"
[[ "$(http_status "$PARENT_TOKEN" "$API_BASE/admin/analytics")" == "403" ]] || fail "Parent can access Super Admin analytics"

log "Admin analytics, schools and users"
ANALYTICS="$(bearer_get "$ADMIN_TOKEN" "$API_BASE/admin/analytics")"
(( $(json_get "$ANALYTICS" '.data.students.total') >= 1 )) || fail "Admin student analytics missing"
json_get "$ANALYTICS" '.data.roleBreakdown' >/dev/null || fail "Admin role breakdown missing"
SCHOOLS="$(bearer_get "$ADMIN_TOKEN" "$API_BASE/admin/schools?limit=20")"
SCHOOL_ID="$(json_get "$SCHOOLS" '.data[0].id')"
DETAIL="$(bearer_get "$ADMIN_TOKEN" "$API_BASE/admin/schools/$SCHOOL_ID")"
[[ "$(json_get "$DETAIL" '.data.id')" == "$SCHOOL_ID" ]] || fail "Admin school detail mismatch"
json_get "$DETAIL" '.data.teacher_count' >/dev/null || fail "Admin school teacher count missing"
USERS="$(bearer_get "$ADMIN_TOKEN" "$API_BASE/admin/users?limit=25")"
(( $(json_get "$USERS" '.data | length') >= 1 )) || fail "Admin user list empty"
EXPORT="$(bearer_get "$ADMIN_TOKEN" "$API_BASE/admin/users/export")"
(( $(json_get "$EXPORT" '.data | length') >= 1 )) || fail "Admin user export empty"

log "Admin content, revenue, support and settings"
CONTENT="$(bearer_get "$ADMIN_TOKEN" "$API_BASE/admin/content")"
(( $(json_get "$CONTENT" '.data.bySubject | length') >= 1 )) || fail "Admin content subject analytics missing"
json_get "$CONTENT" '.data.videos' >/dev/null || fail "Admin video count missing"
json_get "$CONTENT" '.data.quizQuestions' >/dev/null || fail "Admin quiz count missing"
REVENUE="$(bearer_get "$ADMIN_TOKEN" "$API_BASE/admin/revenue")"
json_get "$REVENUE" '.data.mrr' >/dev/null || fail "Admin MRR missing"
CONFIG="$(bearer_get "$ADMIN_TOKEN" "$API_BASE/admin/config")"
(( $(json_get "$CONFIG" '.data | length') >= 1 )) || fail "Admin platform config missing"
SUPPORT="$(bearer_get "$ADMIN_TOKEN" "$API_BASE/admin/support?status=OPEN")"
json_get "$SUPPORT" '.data' >/dev/null || fail "Admin support endpoint missing"
COMPETITIONS="$(bearer_get "$ADMIN_TOKEN" "$API_BASE/admin/competitions")"
json_get "$COMPETITIONS" '.data' >/dev/null || fail "Admin competitions endpoint missing"

log "Parent/Admin E2E passed"
