#!/usr/bin/env bash
set -Eeuo pipefail

API_BASE="${API_BASE:-http://127.0.0.1:5000/api/v1}"
SCHOOL_ADMIN_MOBILE="${SCHOOL_ADMIN_MOBILE:-9100000001}"
STUDENT_MOBILE="${HOMEWORK_STUDENT_MOBILE:-9398891001}"
TEACHER_MOBILE="${HOMEWORK_TEACHER_MOBILE:-9298891001}"

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
  local mobile="$1" role="$2" send otp
  send="$(request POST "$API_BASE/auth/send-otp" "$(jq -nc --arg m "$mobile" '{mobile:$m}')")"
  otp="$(json_get "$send" '.data.otp')"
  [[ "$otp" =~ ^[0-9]{6}$ ]] || fail "Development OTP missing for $mobile"
  request POST "$API_BASE/auth/verify-otp" "$(jq -nc --arg m "$mobile" --arg o "$otp" --arg r "$role" '{mobile:$m,otp:$o,role:$r,deviceInfo:"homework-e2e-smoke"}')"
}

password_session() {
  local identifier="$1" password="$2"
  request POST "$API_BASE/auth/login" "$(jq -nc --arg i "$identifier" --arg p "$password" '{identifier:$i,password:$p,deviceInfo:"homework-e2e-smoke"}')"
}

log "Authenticate School Administrator"
ADMIN_LOGIN="$(otp_session "$SCHOOL_ADMIN_MOBILE" SCHOOL_ADMIN)"
ADMIN_TOKEN="$(json_get "$ADMIN_LOGIN" '.data.accessToken')"
[[ "$(json_get "$ADMIN_LOGIN" '.data.user.role')" == "SCHOOL_ADMIN" ]] || fail "School Admin login returned wrong role"

log "Create isolated class, Student and Teacher for Homework E2E"
CLASS="$(request POST "$API_BASE/school/classes" '{"className":"8","section":"H","roomNumber":"HW-CI-8H"}' "$ADMIN_TOKEN")"
CLASS_ID="$(json_get "$CLASS" '.data.id')"

STUDENT="$(request POST "$API_BASE/school/students" "$(jq -nc --arg classId "$CLASS_ID" --arg mobile "$STUDENT_MOBILE" '{name:"Homework Learner",mobile:$mobile,email:"homework.learner@ci.vidyasetu.test",classId:$classId,rollNumber:"8H01",language:"en"}')" "$ADMIN_TOKEN")"
STUDENT_CODE="$(json_get "$STUDENT" '.data.student_code')"
STUDENT_PASSWORD="$(json_get "$STUDENT" '.data.temporaryPassword')"
STUDENT_LOGIN="$(password_session "$STUDENT_CODE" "$STUDENT_PASSWORD")"
STUDENT_TOKEN="$(json_get "$STUDENT_LOGIN" '.data.accessToken')"
[[ "$(json_get "$STUDENT_LOGIN" '.data.user.role')" == "STUDENT" ]] || fail "Homework Student login failed"

TEACHER="$(request POST "$API_BASE/school/teachers" "$(jq -nc --arg classId "$CLASS_ID" --arg mobile "$TEACHER_MOBILE" '{name:"Homework Teacher",mobile:$mobile,email:"homework.teacher@ci.vidyasetu.test",employeeId:"HW-CI-T-801",designation:"Mathematics Teacher",qualification:"M.Sc., B.Ed.",experienceYears:5,employmentType:"FULL_TIME",language:"en",assignments:[{classId:$classId,subjectCode:"MATH",isClassTeacher:true}]}')" "$ADMIN_TOKEN")"
TEACHER_USERNAME="$(json_get "$TEACHER" '.data.username')"
TEACHER_PASSWORD="$(json_get "$TEACHER" '.data.temporaryPassword')"
TEACHER_LOGIN="$(password_session "$TEACHER_USERNAME" "$TEACHER_PASSWORD")"
TEACHER_TOKEN="$(json_get "$TEACHER_LOGIN" '.data.accessToken')"
[[ "$(json_get "$TEACHER_LOGIN" '.data.user.role')" == "TEACHER" ]] || fail "Homework Teacher login failed"

log "Teacher target contract is restricted to assigned class + subject"
TARGETS="$(request GET "$API_BASE/school/homework/targets" '' "$TEACHER_TOKEN")"
[[ "$(jq -r --arg classId "$CLASS_ID" '[.data[] | select(.class_id==$classId and .subject_code=="MATH")] | length' <<< "$TARGETS")" == "1" ]] || fail "Assigned Homework target missing"
[[ "$(jq -r --arg classId "$CLASS_ID" '[.data[] | select(.class_id==$classId and .subject_code!="MATH")] | length' <<< "$TARGETS")" == "0" ]] || fail "Teacher target contract leaked unassigned subjects"

log "Create private Homework draft and verify it is invisible to Student"
DUE_AT="$(date -u -d '24 hours' +%Y-%m-%dT%H:%M:%SZ)"
HOMEWORK_PAYLOAD="$(jq -nc --arg classId "$CLASS_ID" --arg dueAt "$DUE_AT" '{classId:$classId,subjectCode:"MATH",title:"CI Homework — Linear Equations",description:"Solve the two linear-equation examples and explain each step.",instructions:"Show working clearly.",dueAt:$dueAt,maxMarks:10}')"
DRAFT="$(request POST "$API_BASE/school/homework" "$HOMEWORK_PAYLOAD" "$TEACHER_TOKEN")"
HOMEWORK_ID="$(json_get "$DRAFT" '.data.id')"
[[ "$(json_get "$DRAFT" '.data.status')" == "DRAFT" ]] || fail "Homework was not created as DRAFT"
STUDENT_BEFORE="$(request GET "$API_BASE/student/homework" '' "$STUDENT_TOKEN")"
[[ "$(jq -r --arg id "$HOMEWORK_ID" '[.data[] | select(.id==$id)] | length' <<< "$STUDENT_BEFORE")" == "0" ]] || fail "Draft Homework leaked to Student"

log "Publish Homework and verify Student assignment + in-app notification"
PUBLISHED="$(request POST "$API_BASE/school/homework/$HOMEWORK_ID/publish" '{}' "$TEACHER_TOKEN")"
[[ "$(json_get "$PUBLISHED" '.data.status')" == "PUBLISHED" ]] || fail "Homework publication failed"
STUDENT_LIST="$(request GET "$API_BASE/student/homework" '' "$STUDENT_TOKEN")"
[[ "$(jq -r --arg id "$HOMEWORK_ID" '[.data[] | select(.id==$id and .learner_status=="PENDING")] | length' <<< "$STUDENT_LIST")" == "1" ]] || fail "Published Homework not visible to Student"
NOTIFICATIONS="$(request GET "$API_BASE/student/notifications" '' "$STUDENT_TOKEN")"
ASSIGN_NOTIFICATION_ID="$(jq -er --arg id "$HOMEWORK_ID" '.data[] | select(.type=="HOMEWORK_ASSIGNED" and .reference_type=="HOMEWORK" and .reference_id==$id) | .id' <<< "$NOTIFICATIONS")"
request PATCH "$API_BASE/student/notifications/$ASSIGN_NOTIFICATION_ID/read" '{}' "$STUDENT_TOKEN" >/dev/null
NOTIFICATIONS_READ="$(request GET "$API_BASE/student/notifications" '' "$STUDENT_TOKEN")"
[[ "$(jq -r --arg id "$ASSIGN_NOTIFICATION_ID" '.data[] | select(.id==$id) | .is_read' <<< "$NOTIFICATIONS_READ")" == "true" ]] || fail "Homework notification read state did not persist"

log "Student submits Homework and Teacher receives exact class submission"
SUBMISSION="$(request POST "$API_BASE/student/homework/$HOMEWORK_ID/submit" '{"answerText":"2x + 4 = 10, so 2x = 6 and x = 3. I subtract 4 from both sides, then divide both sides by 2."}' "$STUDENT_TOKEN")"
SUBMISSION_ID="$(json_get "$SUBMISSION" '.data.id')"
[[ "$(json_get "$SUBMISSION" '.data.status')" == "SUBMITTED" ]] || fail "Student Homework submission failed"
SUBMISSIONS="$(request GET "$API_BASE/school/homework/$HOMEWORK_ID/submissions" '' "$TEACHER_TOKEN")"
[[ "$(jq -r --arg id "$SUBMISSION_ID" '[.data.students[] | select(.submission_id==$id and .submission_status=="SUBMITTED")] | length' <<< "$SUBMISSIONS")" == "1" ]] || fail "Teacher cannot see Student Homework submission"

log "Teacher reviews Homework and Student receives feedback"
REVIEW="$(request PATCH "$API_BASE/school/homework/$HOMEWORK_ID/submissions/$SUBMISSION_ID/review" '{"marksAwarded":9,"feedback":"Correct method. Add one more sentence explaining why equal operations preserve equality.","returnForRevision":false}' "$TEACHER_TOKEN")"
[[ "$(json_get "$REVIEW" '.data.status')" == "REVIEWED" ]] || fail "Homework review state was not saved"
DETAIL="$(request GET "$API_BASE/student/homework/$HOMEWORK_ID" '' "$STUDENT_TOKEN")"
[[ "$(json_get "$DETAIL" '.data.submission_status')" == "REVIEWED" ]] || fail "Student cannot see reviewed Homework state"
[[ "$(json_get "$DETAIL" '.data.marks_awarded | tonumber')" == "9" ]] || fail "Student Homework marks mismatch"
[[ "$(json_get "$DETAIL" '.data.feedback')" == "Correct method. Add one more sentence explaining why equal operations preserve equality." ]] || fail "Student Homework feedback mismatch"
FEEDBACK_NOTIFICATIONS="$(request GET "$API_BASE/student/notifications" '' "$STUDENT_TOKEN")"
[[ "$(jq -r --arg id "$HOMEWORK_ID" '[.data[] | select(.type=="HOMEWORK_FEEDBACK" and .reference_type=="HOMEWORK" and .reference_id==$id)] | length' <<< "$FEEDBACK_NOTIFICATIONS")" -ge 1 ]] || fail "Homework feedback notification missing"

log "Close Homework and enforce submission lock"
CLOSED="$(request POST "$API_BASE/school/homework/$HOMEWORK_ID/close" '{}' "$TEACHER_TOKEN")"
[[ "$(json_get "$CLOSED" '.data.status')" == "CLOSED" ]] || fail "Homework close failed"
expect_status 409 POST "$API_BASE/student/homework/$HOMEWORK_ID/submit" '{"answerText":"Attempt after close"}' "$STUDENT_TOKEN"

printf '\nHomework & Student Notifications E2E passed.\n'
printf 'Homework: %s\n' "$HOMEWORK_ID"
printf 'Student: %s\n' "$STUDENT_CODE"
printf 'Teacher: %s\n' "$TEACHER_USERNAME"
