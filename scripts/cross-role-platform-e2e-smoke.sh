#!/usr/bin/env bash
set -Eeuo pipefail

API_BASE="${API_BASE:-http://127.0.0.1:5000/api/v1}"
STUDENT_ID="${CROSS_ROLE_STUDENT_ID:-30000000-0000-0000-0000-000000000001}"
CLASS_ID="${CROSS_ROLE_CLASS_ID:-20000000-0000-0000-0000-000000000001}"
STUDENT_MOBILE="${CROSS_ROLE_STUDENT_MOBILE:-9300000001}"
PARENT_MOBILE="${CROSS_ROLE_PARENT_MOBILE:-9400000001}"
TEACHER_MOBILE="${CROSS_ROLE_TEACHER_MOBILE:-9200000001}"
SCHOOL_ADMIN_MOBILE="${CROSS_ROLE_SCHOOL_ADMIN_MOBILE:-9100000001}"
SUPER_ADMIN_MOBILE="${CROSS_ROLE_SUPER_ADMIN_MOBILE:-9000000000}"

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
  local mobile="$1" role="$2" send otp login
  send="$(request POST "$API_BASE/auth/send-otp" "$(jq -nc --arg m "$mobile" '{mobile:$m}')")"
  otp="$(json_get "$send" '.data.otp')"
  [[ "$otp" =~ ^[0-9]{6}$ ]] || fail "Development OTP missing for $mobile"
  login="$(request POST "$API_BASE/auth/verify-otp" "$(jq -nc --arg m "$mobile" --arg o "$otp" --arg r "$role" '{mobile:$m,otp:$o,role:$r,deviceInfo:"module6-cross-role-e2e"}')")"
  [[ "$(json_get "$login" '.data.user.role')" == "$role" ]] || fail "$mobile did not authenticate as $role"
  printf '%s' "$login"
}

log "Authenticate Student, Parent, Teacher, School Admin and Super Admin"
STUDENT_LOGIN="$(otp_session "$STUDENT_MOBILE" STUDENT)"
PARENT_LOGIN="$(otp_session "$PARENT_MOBILE" PARENT)"
TEACHER_LOGIN="$(otp_session "$TEACHER_MOBILE" TEACHER)"
SCHOOL_LOGIN="$(otp_session "$SCHOOL_ADMIN_MOBILE" SCHOOL_ADMIN)"
ADMIN_LOGIN="$(otp_session "$SUPER_ADMIN_MOBILE" SUPER_ADMIN)"

STUDENT_TOKEN="$(json_get "$STUDENT_LOGIN" '.data.accessToken')"
PARENT_TOKEN="$(json_get "$PARENT_LOGIN" '.data.accessToken')"
TEACHER_TOKEN="$(json_get "$TEACHER_LOGIN" '.data.accessToken')"
SCHOOL_TOKEN="$(json_get "$SCHOOL_LOGIN" '.data.accessToken')"
ADMIN_TOKEN="$(json_get "$ADMIN_LOGIN" '.data.accessToken')"

log "Enforce cross-role authorization boundaries"
expect_status 403 GET "$API_BASE/admin/analytics" '' "$PARENT_TOKEN"
expect_status 403 GET "$API_BASE/admin/analytics" '' "$SCHOOL_TOKEN"
expect_status 403 GET "$API_BASE/school/fees" '' "$TEACHER_TOKEN"
expect_status 403 GET "$API_BASE/parent/children" '' "$STUDENT_TOKEN"
expect_status 403 GET "$API_BASE/school/overview" '' "$PARENT_TOKEN"

log "Verify Parent ↔ Student linkage and Teacher assignment"
CHILDREN="$(request GET "$API_BASE/parent/children" '' "$PARENT_TOKEN")"
[[ "$(jq -r --arg id "$STUDENT_ID" '[.data[] | select(.id==$id)] | length' <<< "$CHILDREN")" == "1" ]] || fail "Seeded Parent is not linked to the target Student"
TARGETS="$(request GET "$API_BASE/school/homework/targets" '' "$TEACHER_TOKEN")"
[[ "$(jq -r --arg classId "$CLASS_ID" '[.data[] | select(.class_id==$classId and .subject_code=="MATH")] | length' <<< "$TARGETS")" -ge 1 ]] || fail "Teacher is missing the Class 8A Mathematics assignment"

log "Teacher → Student → Parent Homework propagation"
DUE_AT="$(date -u -d '2 days' +%Y-%m-%dT%H:%M:%SZ)"
HOMEWORK_PAYLOAD="$(jq -nc --arg classId "$CLASS_ID" --arg dueAt "$DUE_AT" '{classId:$classId,subjectCode:"MATH",title:"Module 6 Cross-Role Mathematics",description:"Cross-role certification assignment for Student and Parent visibility.",instructions:"Solve and explain each step.",dueAt:$dueAt,maxMarks:10}')"
DRAFT="$(request POST "$API_BASE/school/homework" "$HOMEWORK_PAYLOAD" "$TEACHER_TOKEN")"
HOMEWORK_ID="$(json_get "$DRAFT" '.data.id')"
[[ "$(json_get "$DRAFT" '.data.status')" == "DRAFT" ]] || fail "Teacher Homework was not created as DRAFT"

request POST "$API_BASE/school/homework/$HOMEWORK_ID/publish" '{}' "$TEACHER_TOKEN" >/dev/null
STUDENT_HOMEWORK="$(request GET "$API_BASE/student/homework" '' "$STUDENT_TOKEN")"
[[ "$(jq -r --arg id "$HOMEWORK_ID" '[.data[] | select(.id==$id and .learner_status=="PENDING")] | length' <<< "$STUDENT_HOMEWORK")" == "1" ]] || fail "Published Homework did not reach Student"
PARENT_HOMEWORK="$(request GET "$API_BASE/parent/children/$STUDENT_ID/homework" '' "$PARENT_TOKEN")"
[[ "$(jq -r --arg id "$HOMEWORK_ID" '[.data[] | select(.id==$id and .learner_status=="PENDING")] | length' <<< "$PARENT_HOMEWORK")" == "1" ]] || fail "Published Homework did not reach Parent"

SUBMISSION="$(request POST "$API_BASE/student/homework/$HOMEWORK_ID/submit" '{"answerText":"x = 3. I preserve equality by applying the same inverse operation to both sides."}' "$STUDENT_TOKEN")"
SUBMISSION_ID="$(json_get "$SUBMISSION" '.data.id')"
[[ "$(json_get "$SUBMISSION" '.data.status')" == "SUBMITTED" ]] || fail "Student Homework submission failed"

PARENT_SUBMITTED="$(request GET "$API_BASE/parent/children/$STUDENT_ID/homework?status=SUBMITTED" '' "$PARENT_TOKEN")"
[[ "$(jq -r --arg id "$HOMEWORK_ID" '[.data[] | select(.id==$id and .learner_status=="SUBMITTED")] | length' <<< "$PARENT_SUBMITTED")" == "1" ]] || fail "Parent did not see Student submission state"

SUBMISSIONS="$(request GET "$API_BASE/school/homework/$HOMEWORK_ID/submissions" '' "$TEACHER_TOKEN")"
[[ "$(jq -r --arg id "$SUBMISSION_ID" '[.data.students[] | select(.submission_id==$id)] | length' <<< "$SUBMISSIONS")" == "1" ]] || fail "Teacher did not receive Student submission"

FEEDBACK='Clear solution and correct equality reasoning.'
request PATCH "$API_BASE/school/homework/$HOMEWORK_ID/submissions/$SUBMISSION_ID/review" "$(jq -nc --arg feedback "$FEEDBACK" '{marksAwarded:9,feedback:$feedback,returnForRevision:false}')" "$TEACHER_TOKEN" >/dev/null
STUDENT_DETAIL="$(request GET "$API_BASE/student/homework/$HOMEWORK_ID" '' "$STUDENT_TOKEN")"
[[ "$(json_get "$STUDENT_DETAIL" '.data.submission_status')" == "REVIEWED" ]] || fail "Teacher review did not return to Student"
[[ "$(json_get "$STUDENT_DETAIL" '.data.marks_awarded | tonumber')" == "9" ]] || fail "Student reviewed marks mismatch"

PARENT_REVIEWED="$(request GET "$API_BASE/parent/children/$STUDENT_ID/homework?status=REVIEWED" '' "$PARENT_TOKEN")"
[[ "$(jq -r --arg id "$HOMEWORK_ID" '[.data[] | select(.id==$id and .learner_status=="REVIEWED" and (.marks_awarded|tonumber)==9)] | length' <<< "$PARENT_REVIEWED")" == "1" ]] || fail "Parent did not receive reviewed Homework state"
[[ "$(jq -r --arg id "$HOMEWORK_ID" '.data[] | select(.id==$id) | .feedback' <<< "$PARENT_REVIEWED")" == "$FEEDBACK" ]] || fail "Parent Homework feedback mismatch"
request POST "$API_BASE/school/homework/$HOMEWORK_ID/close" '{}' "$TEACHER_TOKEN" >/dev/null

log "Parent → School leave workflow"
LEAVE_DATE="$(date -u -d '3 days' +%F)"
LEAVE="$(request POST "$API_BASE/parent/absence/children/$STUDENT_ID/leave" "$(jq -nc --arg d "$LEAVE_DATE" '{startDate:$d,endDate:$d,reason:"Module 6 family appointment"}')" "$PARENT_TOKEN")"
LEAVE_ID="$(json_get "$LEAVE" '.data.id')"
[[ "$(json_get "$LEAVE" '.data.status')" == "PENDING" ]] || fail "Parent leave request was not created as PENDING"
SCHOOL_LEAVES="$(request GET "$API_BASE/school/absence/leave?status=PENDING" '' "$SCHOOL_TOKEN")"
[[ "$(jq -r --arg id "$LEAVE_ID" '[.data[] | select(.id==$id)] | length' <<< "$SCHOOL_LEAVES")" == "1" ]] || fail "School did not receive Parent leave request"
request PATCH "$API_BASE/school/absence/leave/$LEAVE_ID/review" '{"action":"APPROVE","note":"Approved by Module 6 cross-role certification."}' "$SCHOOL_TOKEN" >/dev/null
PARENT_LEAVES="$(request GET "$API_BASE/parent/absence/children/$STUDENT_ID/leave" '' "$PARENT_TOKEN")"
[[ "$(jq -r --arg id "$LEAVE_ID" '[.data[] | select(.id==$id and .status=="APPROVED")] | length' <<< "$PARENT_LEAVES")" == "1" ]] || fail "Approved leave did not propagate back to Parent"

log "School → Student + Parent calendar propagation"
EVENT_DATE="$(date -u -d '4 days' +%F)"
EVENT_PAYLOAD="$(jq -nc --arg d "$EVENT_DATE" --arg classId "$CLASS_ID" '{title:"Module 6 Integration Day",description:"Shared School event used for cross-role certification.",eventType:"ACTIVITY",startDate:$d,endDate:$d,isSchoolClosed:false,classIds:[$classId]}')"
EVENT="$(request POST "$API_BASE/school/absence/calendar" "$EVENT_PAYLOAD" "$SCHOOL_TOKEN")"
EVENT_ID="$(json_get "$EVENT" '.data.id')"
STUDENT_CALENDAR="$(request GET "$API_BASE/student/absence/calendar" '' "$STUDENT_TOKEN")"
[[ "$(jq -r --arg id "$EVENT_ID" '[.data[] | select(.id==$id)] | length' <<< "$STUDENT_CALENDAR")" == "1" ]] || fail "School calendar event did not reach Student"
PARENT_CALENDAR="$(request GET "$API_BASE/parent/absence/children/$STUDENT_ID/calendar" '' "$PARENT_TOKEN")"
[[ "$(jq -r --arg id "$EVENT_ID" '[.data[] | select(.id==$id)] | length' <<< "$PARENT_CALENDAR")" == "1" ]] || fail "School calendar event did not reach Parent"

log "Parent ↔ class-teacher communication contract"
TEACHER_INFO="$(request GET "$API_BASE/parent/children/$STUDENT_ID/teacher" '' "$PARENT_TOKEN")"
[[ -n "$(jq -r '.data.teacher_id // empty' <<< "$TEACHER_INFO")" ]] || fail "Parent cannot resolve the linked class teacher"
MESSAGE_BODY="Module 6 cross-role message: thank you for the homework feedback."
MESSAGE="$(request POST "$API_BASE/parent/children/$STUDENT_ID/messages" "$(jq -nc --arg body "$MESSAGE_BODY" '{body:$body}')" "$PARENT_TOKEN")"
MESSAGE_ID="$(json_get "$MESSAGE" '.data.id')"
MESSAGES="$(request GET "$API_BASE/parent/children/$STUDENT_ID/messages" '' "$PARENT_TOKEN")"
[[ "$(jq -r --arg id "$MESSAGE_ID" '[.data[] | select(.id==$id)] | length' <<< "$MESSAGES")" == "1" ]] || fail "Parent/Teacher message did not persist"

log "Super Admin platform visibility across all primary roles"
ANALYTICS="$(request GET "$API_BASE/admin/analytics" '' "$ADMIN_TOKEN")"
for role in SUPER_ADMIN SCHOOL_ADMIN TEACHER STUDENT PARENT; do
  [[ "$(jq -r --arg role "$role" '[.data.roleBreakdown[] | select(.role==$role and (.count|tonumber)>0)] | length' <<< "$ANALYTICS")" == "1" ]] || fail "Admin analytics is missing active role $role"
done

log "Cross-role database-backed journey passed"
printf 'Homework: %s\n' "$HOMEWORK_ID"
printf 'Submission: %s\n' "$SUBMISSION_ID"
printf 'Leave: %s\n' "$LEAVE_ID"
printf 'Calendar event: %s\n' "$EVENT_ID"
printf 'Message: %s\n' "$MESSAGE_ID"
printf '\nModule 6 Cross-Role Platform E2E passed.\n'
