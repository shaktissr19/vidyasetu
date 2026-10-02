#!/usr/bin/env bash
# Disposable database only: creates test accounts and verifies real approval boundaries.
set -Eeuo pipefail
API_BASE="${API_BASE:-http://127.0.0.1:5000/api/v1}"
PASSWORD='Registration12345'
BODY=''
call() {
  local expected="$1" method="$2" path="$3" payload="${4:-}" token="${5:-}" raw code
  local args=(-sS -X "$method" "$API_BASE$path" -H 'Content-Type: application/json')
  [[ -z "$token" ]] || args+=(-H "Authorization: Bearer $token")
  [[ -z "$payload" ]] || args+=(-d "$payload")
  raw="$(curl "${args[@]}" -w $'\n%{http_code}')"
  code="${raw##*$'\n'}"; BODY="${raw%$'\n'*}"
  if [[ "$code" != "$expected" ]]; then
    printf 'FAILED: %s %s returned %s (expected %s)\n' "$method" "$path" "$code" "$expected" >&2
    jq -r '.error.message // .message // "Unexpected API response"' <<< "$BODY" >&2
    exit 1
  fi
}
otp_login() {
  call 200 POST /auth/send-otp "{\"mobile\":\"$1\",\"role\":\"$2\"}"
  local otp; otp="$(jq -er '.data.otp' <<< "$BODY")"
  call 200 POST /auth/verify-otp "{\"mobile\":\"$1\",\"otp\":\"$otp\",\"role\":\"$2\"}"
  jq -er '.data.accessToken' <<< "$BODY"
}
password_login() {
  call 200 POST /auth/login "{\"identifier\":\"$1\",\"password\":\"$PASSWORD\"}"
  jq -er '.data.accessToken' <<< "$BODY"
}

echo 'Verify public admin registration is rejected'
call 400 POST /auth/register '{"role":"SUPER_ADMIN","name":"Invalid Admin","mobile":"9297770010","password":"Registration12345"}'
call 201 POST /auth/register/student '{"name":"Registration Student","username":"registration.student","mobile":"9397770001","password":"Registration12345","language":"en","gradeLevel":"8"}'
STUDENT_TOKEN="$(jq -er '.data.accessToken' <<< "$BODY")"
STUDENT_CODE="$(jq -er '.data.student.studentCode' <<< "$BODY")"
STUDENT_ID="$(jq -er '.data.student.id' <<< "$BODY")"
call 409 POST /auth/register/student '{"name":"Duplicate Student","mobile":"9397770001","password":"Registration12345","language":"en","gradeLevel":"8"}'

echo 'Parent registration creates a request, never child access'
call 201 POST /auth/register "$(jq -nc --arg code "$STUDENT_CODE" '{role:"PARENT",name:"Registration Parent",username:"registration.parent",email:"registration.parent@vidyasetu.test",mobile:"9497770001",password:"Registration12345",studentCode:$code,parentRelation:"GUARDIAN"}')"
PARENT_TOKEN="$(jq -er '.data.accessToken' <<< "$BODY")"
REQUEST_ID="$(jq -er '.data.childRequest.id' <<< "$BODY")"
call 200 GET /parent/children '' "$PARENT_TOKEN"
test "$(jq '.data | length' <<< "$BODY")" = 0
call 200 GET /parent/link-requests '' "$PARENT_TOKEN"
test "$(jq -r '.data[0].student_name == null and .data[0].school_name == null' <<< "$BODY")" = true
call 404 PATCH "/parent/link-requests/$REQUEST_ID" '{"action":"APPROVE"}' "$PARENT_TOKEN"
call 403 GET /admin/users '' "$PARENT_TOKEN"
call 403 POST /admin/platform-admins '{"name":"Invalid Admin"}' "$PARENT_TOKEN"
call 200 PATCH "/student/parent-link-requests/$REQUEST_ID" '{"action":"APPROVE"}' "$STUDENT_TOKEN"
call 200 GET /parent/children '' "$PARENT_TOKEN"
test "$(jq -r --arg id "$STUDENT_ID" '[.data[] | select(.student_id == $id or .id == $id)] | length' <<< "$BODY")" = 1
call 409 PATCH "/student/parent-link-requests/$REQUEST_ID" '{"action":"APPROVE"}' "$STUDENT_TOKEN"

echo 'Student invitation also requires Parent confirmation'
call 201 POST /auth/register/student '{"name":"Inviting Student","username":"registration.inviting","mobile":"9397770002","password":"Registration12345","language":"en","gradeLevel":"7","parentMobile":"9497770001"}'
INVITE_ID="$(jq -er '.data.parentRequest.id' <<< "$BODY")"
test "$(jq -r '.data.parentLinkStatus' <<< "$BODY")" = AWAITING_PARENT
call 200 GET /parent/children '' "$PARENT_TOKEN"
test "$(jq '.data | length' <<< "$BODY")" = 1
call 200 PATCH "/parent/link-requests/$INVITE_ID" '{"action":"REJECT"}' "$PARENT_TOKEN"
call 200 GET /parent/children '' "$PARENT_TOKEN"
test "$(jq '.data | length' <<< "$BODY")" = 1

echo 'Repeated invitations before Parent signup remain claimable'
call 201 POST /auth/register/student '{"name":"Pre Parent Student","mobile":"9397770003","password":"Registration12345","language":"en","gradeLevel":"7","parentMobile":"9497770002"}'
PRE_PARENT_TOKEN="$(jq -er '.data.accessToken' <<< "$BODY")"
PRE_INVITE_ID="$(jq -er '.data.parentRequest.id' <<< "$BODY")"
call 201 POST /student/parent-link-requests '{"parentMobile":"9497770002"}' "$PRE_PARENT_TOKEN"
test "$(jq -r '.data.id' <<< "$BODY")" = "$PRE_INVITE_ID"
call 201 POST /auth/register '{"role":"PARENT","name":"Later Parent","mobile":"9497770002","password":"Registration12345"}'
LATER_PARENT_TOKEN="$(jq -er '.data.accessToken' <<< "$BODY")"
call 200 GET /parent/link-requests '' "$LATER_PARENT_TOKEN"
test "$(jq -r --arg id "$PRE_INVITE_ID" '[.data[] | select(.id==$id)] | length' <<< "$BODY")" = 1
call 200 PATCH "/parent/link-requests/$PRE_INVITE_ID" '{"action":"APPROVE"}' "$LATER_PARENT_TOKEN"
call 200 GET /parent/children '' "$LATER_PARENT_TOKEN"
test "$(jq '.data | length' <<< "$BODY")" = 1

echo 'School application is unusable until Platform Admin approval'
call 201 POST /auth/register '{"role":"SCHOOL_ADMIN","name":"School Representative","username":"registration.school","mobile":"9197770001","password":"Registration12345","schoolName":"Registration School","udiseCode":"REG7770001","state":"Uttar Pradesh"}'
SCHOOL_ID="$(jq -er '.data.school.id' <<< "$BODY")"
test "$(jq -r '.data.approvalStatus' <<< "$BODY")" = PENDING
test "$(jq -r '.data.accessToken == null' <<< "$BODY")" = true
call 403 POST /auth/login '{"identifier":"registration.school","password":"Registration12345"}'
ADMIN_TOKEN="$(otp_login 9000000000 SUPER_ADMIN)"
call 200 PATCH "/admin/schools/$SCHOOL_ID/status" '{"status":"ACTIVE"}' "$ADMIN_TOKEN"
SCHOOL_TOKEN="$(password_login registration.school)"

echo 'Teacher request requires the correct School approval'
call 201 POST /auth/register "$(jq -nc --arg school "$SCHOOL_ID" '{role:"TEACHER",name:"Registration Teacher",username:"registration.teacher",mobile:"9297770001",password:"Registration12345",schoolId:$school,qualification:"B.Ed",experienceYears:3}')"
TEACHER_REQUEST_ID="$(jq -er '.data.teacherRequest.id' <<< "$BODY")"
test "$(jq -r '.data.accessToken == null' <<< "$BODY")" = true
call 403 POST /auth/login '{"identifier":"registration.teacher","password":"Registration12345"}'
OTHER_SCHOOL_TOKEN="$(otp_login 9100000001 SCHOOL_ADMIN)"
call 404 PATCH "/school/teacher-registration-requests/$TEACHER_REQUEST_ID" '{"action":"APPROVE"}' "$OTHER_SCHOOL_TOKEN"
call 200 GET /school/teacher-registration-requests '' "$SCHOOL_TOKEN"
test "$(jq -r --arg id "$TEACHER_REQUEST_ID" '[.data[] | select(.id==$id)] | length' <<< "$BODY")" = 1
call 200 PATCH "/school/teacher-registration-requests/$TEACHER_REQUEST_ID" '{"action":"APPROVE"}' "$SCHOOL_TOKEN"
TEACHER_TOKEN="$(password_login registration.teacher)"
call 200 GET /school/profile '' "$TEACHER_TOKEN"
call 403 GET /school/teacher-registration-requests '' "$TEACHER_TOKEN"
call 409 PATCH "/school/teacher-registration-requests/$TEACHER_REQUEST_ID" '{"action":"APPROVE"}' "$SCHOOL_TOKEN"

echo 'School suspension revokes existing tokens immediately'
call 200 PATCH "/admin/schools/$SCHOOL_ID/status" '{"status":"SUSPENDED"}' "$ADMIN_TOKEN"
call 403 GET /school/teacher-registration-requests '' "$SCHOOL_TOKEN"
call 403 GET /school/profile '' "$TEACHER_TOKEN"
call 403 POST /auth/login '{"identifier":"registration.school","password":"Registration12345"}'
call 200 PATCH "/admin/schools/$SCHOOL_ID/status" '{"status":"ACTIVE"}' "$ADMIN_TOKEN"

echo 'Existing Platform Admin can create another audited admin'
call 401 POST /admin/platform-admins '{"name":"Invalid Admin"}'
call 201 POST /admin/platform-admins '{"name":"Registration Admin","username":"registration.admin","mobile":"9097770001","password":"Registration12345"}' "$ADMIN_TOKEN"
test "$(jq -r '.data.role' <<< "$BODY")" = SUPER_ADMIN
test "$(jq -r '.data.password_hash == null and .data.password == null' <<< "$BODY")" = true
call 409 POST /admin/platform-admins '{"name":"Duplicate Admin","username":"registration.admin","mobile":"9097770002","password":"Registration12345"}' "$ADMIN_TOKEN"
NEW_ADMIN_TOKEN="$(password_login registration.admin)"
call 200 GET /admin/users '' "$NEW_ADMIN_TOKEN"
echo 'Unified registration E2E passed: Student, Parent, School, Teacher and Platform Admin.'
