#!/usr/bin/env bash
set -Eeuo pipefail

API_BASE="${API_BASE:-http://127.0.0.1:5000/api/v1}"
SCHOOL_ID="${SCHOOL_ID:-10000000-0000-0000-0000-000000000001}"
SCHOOL_ADMIN_MOBILE="${SCHOOL_ADMIN_MOBILE:-9100000001}"
EXISTING_PARENT_MOBILE="${EXISTING_PARENT_MOBILE:-9400000001}"
DIRECT_MOBILE="${DIRECT_MOBILE:-9398880001}"
BULK1_MOBILE="${BULK1_MOBILE:-9398880002}"
BULK2_MOBILE="${BULK2_MOBILE:-9398880003}"
PENDING_MOBILE="${PENDING_MOBILE:-9398880099}"
TEACHER_MOBILE="${TEACHER_MOBILE:-9298880001}"
SELF_PASSWORD="${SELF_PASSWORD:-SchoolStudent123}"

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
  [[ "$otp" =~ ^[0-9]{6}$ ]] || fail "Development OTP was not returned for $mobile"
  request POST "$API_BASE/auth/verify-otp" "$(jq -nc --arg m "$mobile" --arg o "$otp" --arg r "$role" '{mobile:$m,otp:$o,role:$r,deviceInfo:"school-e2e-smoke"}')"
}

password_session() {
  local identifier="$1" password="$2"
  request POST "$API_BASE/auth/login" "$(jq -nc --arg i "$identifier" --arg p "$password" '{identifier:$i,password:$p,deviceInfo:"school-e2e-smoke"}')"
}

bearer_get() {
  request GET "$2" '' "$1"
}

log "School Administrator authentication and current School profile"
ADMIN_LOGIN="$(otp_session "$SCHOOL_ADMIN_MOBILE" SCHOOL_ADMIN)"
ADMIN_TOKEN="$(json_get "$ADMIN_LOGIN" '.data.accessToken')"
[[ "$(json_get "$ADMIN_LOGIN" '.data.user.role')" == "SCHOOL_ADMIN" ]] || fail "School Admin OTP login returned wrong role"
PROFILE="$(bearer_get "$ADMIN_TOKEN" "$API_BASE/school/profile")"
[[ "$(json_get "$PROFILE" '.data.id')" == "$SCHOOL_ID" ]] || fail "School Admin session resolved wrong School"
[[ "$(json_get "$PROFILE" '.data.academic_year')" == "2026-27" ]] || fail "School academic year is not 2026-27"
PROFILE_UPDATE="$(request PATCH "$API_BASE/school/profile" '{"board":"CBSE","principalName":"Dr. Meera Saxena","affiliationNumber":"CI-CBSE-2026"}' "$ADMIN_TOKEN")"
[[ "$(json_get "$PROFILE_UPDATE" '.data.principal_name')" == "Dr. Meera Saxena" ]] || fail "School Profile update failed"

log "Dashboard baseline and existing official roster"
OVERVIEW_BEFORE="$(bearer_get "$ADMIN_TOKEN" "$API_BASE/school/overview")"
BASE_STUDENTS="$(json_get "$OVERVIEW_BEFORE" '.data.stats.total_students | tonumber')"
(( BASE_STUDENTS >= 10 )) || fail "Expected at least ten seeded Students at Saraswati Vidya Mandir"
[[ "$(json_get "$OVERVIEW_BEFORE" '.data.school.academic_year')" == "2026-27" ]] || fail "Dashboard is not using current academic year"

log "Class and section management"
CLASS_C="$(request POST "$API_BASE/school/classes" '{"className":"7","section":"C","roomNumber":"CI-7C"}' "$ADMIN_TOKEN")"
CLASS_C_ID="$(json_get "$CLASS_C" '.data.id')"
[[ "$(json_get "$CLASS_C" '.data.academic_year')" == "2026-27" ]] || fail "New class inherited wrong academic year"
CLASS_D="$(request POST "$API_BASE/school/classes" '{"className":"7","section":"D","roomNumber":"CI-7D"}' "$ADMIN_TOKEN")"
CLASS_D_ID="$(json_get "$CLASS_D" '.data.id')"
CLASS_C_EDIT="$(request PATCH "$API_BASE/school/classes/$CLASS_C_ID" '{"roomNumber":"CI-7C-101"}' "$ADMIN_TOKEN")"
[[ "$(json_get "$CLASS_C_EDIT" '.data.room_number')" == "CI-7C-101" ]] || fail "Class edit did not persist"

log "Direct Student admission with generated credentials and existing Parent link"
DIRECT_ADD="$(request POST "$API_BASE/school/students" "$(jq -nc --arg classId "$CLASS_C_ID" --arg mobile "$DIRECT_MOBILE" --arg parent "$EXISTING_PARENT_MOBILE" '{name:"Meera Joshi",mobile:$mobile,email:"meera.joshi@ci.vidyasetu.test",classId:$classId,rollNumber:"7C01",language:"en",parentName:"Rajesh Sharma",parentMobile:$parent,parentRelation:"FATHER"}')" "$ADMIN_TOKEN")"
DIRECT_CODE="$(json_get "$DIRECT_ADD" '.data.student_code')"
DIRECT_USERNAME="$(json_get "$DIRECT_ADD" '.data.username')"
DIRECT_PASSWORD="$(json_get "$DIRECT_ADD" '.data.temporaryPassword')"
[[ "$DIRECT_CODE" =~ ^VS[0-9]{2}-[0-9]{7}$ ]] || fail "School-created Student ID is invalid: $DIRECT_CODE"
[[ "$DIRECT_USERNAME" == "meera.joshi" ]] || fail "School-created username is not realistic"
[[ -n "$DIRECT_PASSWORD" ]] || fail "Temporary Student password was not generated"
DIRECT_LOGIN="$(password_session "$DIRECT_CODE" "$DIRECT_PASSWORD")"
DIRECT_TOKEN="$(json_get "$DIRECT_LOGIN" '.data.accessToken')"
[[ "$(json_get "$DIRECT_LOGIN" '.data.user.role')" == "STUDENT" ]] || fail "School-created Student cannot login"

log "Bulk Student admission"
BULK_PAYLOAD="$(jq -nc --arg classId "$CLASS_C_ID" --arg m1 "$BULK1_MOBILE" --arg m2 "$BULK2_MOBILE" '{students:[{name:"Kabir Malhotra",mobile:$m1,email:"kabir.malhotra@ci.vidyasetu.test",classId:$classId,rollNumber:"7C02",language:"en"},{name:"Ishita Rao",mobile:$m2,email:"ishita.rao@ci.vidyasetu.test",classId:$classId,rollNumber:"7C03",language:"en"}]}')"
BULK_ADD="$(request POST "$API_BASE/school/students/bulk" "$BULK_PAYLOAD" "$ADMIN_TOKEN")"
[[ "$(json_get "$BULK_ADD" '.data.created | length')" == "2" ]] || fail "Bulk Student admission did not create two Students"
BULK1_CODE="$(json_get "$BULK_ADD" '.data.created[0].student_code')"
BULK2_CODE="$(json_get "$BULK_ADD" '.data.created[1].student_code')"

log "Public Student self-registration remains pending until School approval"
SELF_REG="$(request POST "$API_BASE/auth/register/student" "$(jq -nc --arg mobile "$PENDING_MOBILE" --arg password "$SELF_PASSWORD" --arg schoolId "$SCHOOL_ID" --arg classId "$CLASS_C_ID" '{name:"Aditi Sen",username:"aditi.sen.ci",email:"aditi.sen@ci.vidyasetu.test",mobile:$mobile,password:$password,language:"en",gradeLevel:"7",schoolId:$schoolId,classId:$classId,schoolNote:"School Management E2E enrollment",dateOfBirth:"2013-04-12",gender:"FEMALE"}')")"
PENDING_CODE="$(json_get "$SELF_REG" '.data.student.studentCode')"
[[ "$(json_get "$SELF_REG" '.data.student.schoolLinkStatus')" == "PENDING" ]] || fail "Self-registration must remain pending"
ROSTER_PENDING="$(bearer_get "$ADMIN_TOKEN" "$API_BASE/school/students?search=Aditi%20Sen&limit=20")"
[[ "$(jq -r --arg code "$PENDING_CODE" '[.data[] | select(.student_code==$code)] | length' <<< "$ROSTER_PENDING")" == "0" ]] || fail "Pending Student leaked into official roster"
REQUESTS="$(bearer_get "$ADMIN_TOKEN" "$API_BASE/school/enrollment-requests?status=PENDING")"
REQUEST_ID="$(jq -er --arg code "$PENDING_CODE" '.data[] | select(.student_code==$code) | .id' <<< "$REQUESTS")"
APPROVED="$(request PATCH "$API_BASE/school/enrollment-requests/$REQUEST_ID" "$(jq -nc --arg classId "$CLASS_C_ID" '{action:"APPROVE",classId:$classId,rollNumber:"7C04",note:"Verified by School E2E"}')" "$ADMIN_TOKEN")"
[[ "$(json_get "$APPROVED" '.data.status')" == "APPROVED" ]] || fail "School enrollment approval failed"

log "Official roster detail and Parent integration"
ROSTER="$(bearer_get "$ADMIN_TOKEN" "$API_BASE/school/students?classId=$CLASS_C_ID&limit=100")"
[[ "$(json_get "$ROSTER" '.data | length')" == "4" ]] || fail "Class 7-C should contain four approved Students"
DIRECT_STUDENT_ID="$(jq -er --arg code "$DIRECT_CODE" '.data[] | select(.student_code==$code) | .id' <<< "$ROSTER")"
[[ -n "$DIRECT_STUDENT_ID" ]] || fail "Direct Student missing from official roster"
DIRECT_DETAIL="$(bearer_get "$ADMIN_TOKEN" "$API_BASE/school/students/$DIRECT_STUDENT_ID")"
[[ "$(jq -r --arg mobile "$EXISTING_PARENT_MOBILE" '[.data.parents[] | select(.mobile==$mobile)] | length' <<< "$DIRECT_DETAIL")" -ge 1 ]] || fail "Existing Parent was not linked to direct Student"

log "Teacher provisioning, assignments and first-class Teacher login"
TEACHER_ADD="$(request POST "$API_BASE/school/teachers" "$(jq -nc --arg mobile "$TEACHER_MOBILE" --arg classId "$CLASS_C_ID" '{name:"Nisha Kapoor",mobile:$mobile,email:"nisha.kapoor@ci.vidyasetu.test",employeeId:"CI-T-701",designation:"Mathematics Teacher",qualification:"M.Sc., B.Ed.",experienceYears:6,employmentType:"FULL_TIME",language:"en",assignments:[{classId:$classId,subjectCode:"MATH",isClassTeacher:true}]}')" "$ADMIN_TOKEN")"
TEACHER_USERNAME="$(json_get "$TEACHER_ADD" '.data.username')"
TEACHER_PASSWORD="$(json_get "$TEACHER_ADD" '.data.temporaryPassword')"
[[ "$TEACHER_USERNAME" == "nisha.kapoor" ]] || fail "Teacher username is not realistic"
[[ -n "$TEACHER_PASSWORD" ]] || fail "Teacher temporary password missing"
TEACHER_LOGIN="$(password_session "$TEACHER_USERNAME" "$TEACHER_PASSWORD")"
TEACHER_TOKEN="$(json_get "$TEACHER_LOGIN" '.data.accessToken')"
[[ "$(json_get "$TEACHER_LOGIN" '.data.user.role')" == "TEACHER" ]] || fail "Teacher password login returned wrong role"
TEACHERS="$(bearer_get "$ADMIN_TOKEN" "$API_BASE/school/teachers")"
TEACHER_ID="$(jq -er --arg username "$TEACHER_USERNAME" '.data[] | select(.username==$username) | .id' <<< "$TEACHERS")"
[[ "$(jq -r --arg id "$CLASS_C_ID" --arg t "$TEACHER_USERNAME" '.data[] | select(.username==$t) | [.assignments[] | select(.classId==$id and .subjectCode=="MATH")] | length' <<< "$TEACHERS")" -ge 1 ]] || fail "Teacher assignment missing"

log "Teacher permissions: operational reads/attendance allowed; administration denied"
TEACHER_PROFILE="$(bearer_get "$TEACHER_TOKEN" "$API_BASE/school/profile")"
[[ "$(json_get "$TEACHER_PROFILE" '.data.id')" == "$SCHOOL_ID" ]] || fail "Teacher session did not resolve School context"
bearer_get "$TEACHER_TOKEN" "$API_BASE/school/students?classId=$CLASS_C_ID&limit=100" >/dev/null
expect_status 403 GET "$API_BASE/school/fees" '' "$TEACHER_TOKEN"
expect_status 403 GET "$API_BASE/school/enrollment-requests" '' "$TEACHER_TOKEN"
expect_status 403 POST "$API_BASE/school/classes" '{"className":"6","section":"Z"}' "$TEACHER_TOKEN"

log "Attendance uses existing roster and Teacher operational permission"
TODAY="$(date +%F)"
ATT_ROSTER="$(bearer_get "$TEACHER_TOKEN" "$API_BASE/school/attendance/roster?classId=$CLASS_C_ID&date=$TODAY")"
[[ "$(json_get "$ATT_ROSTER" '.data | length')" == "4" ]] || fail "Attendance roster does not match approved class roster"
ATT_PAYLOAD="$(jq -c --arg classId "$CLASS_C_ID" --arg date "$TODAY" --arg absent "$DIRECT_CODE" '{classId:$classId,date:$date,records:[.data[]|{studentId:.id,status:(if .student_code==$absent then "ABSENT" else "PRESENT" end),remark:"School E2E"}]}' <<< "$ATT_ROSTER")"
MARK="$(request POST "$API_BASE/school/attendance" "$ATT_PAYLOAD" "$TEACHER_TOKEN")"
[[ "$(json_get "$MARK" '.data.marked')" == "4" ]] || fail "Teacher could not mark full class attendance"
ATT_ROSTER_AGAIN="$(bearer_get "$TEACHER_TOKEN" "$API_BASE/school/attendance/roster?classId=$CLASS_C_ID&date=$TODAY")"
[[ "$(jq -r --arg code "$DIRECT_CODE" '.data[] | select(.student_code==$code) | .attendance_status' <<< "$ATT_ROSTER_AGAIN")" == "ABSENT" ]] || fail "Existing attendance marks are not loaded back correctly"
ATT_SUMMARY="$(bearer_get "$ADMIN_TOKEN" "$API_BASE/school/attendance?date=$TODAY")"
[[ "$(jq -r --arg id "$CLASS_C_ID" '.data[] | select(.id==$id) | .absent' <<< "$ATT_SUMMARY")" == "1" ]] || fail "Attendance summary did not persist absence"

log "Fee structure, invoice generation, partial/full payments and receipts"
FEE_STRUCTURE="$(request PUT "$API_BASE/school/fees/structures" '{"className":"7","term":1,"feeHead":"Tuition Fee","amount":1000,"isOptional":false}' "$ADMIN_TOKEN")"
[[ "$(json_get "$FEE_STRUCTURE" '.data.amount | tonumber')" == "1000" ]] || fail "Fee structure amount mismatch"
GENERATED="$(request POST "$API_BASE/school/fees/generate" "$(jq -nc --arg classId "$CLASS_C_ID" '{classId:$classId,term:1}')" "$ADMIN_TOKEN")"
[[ "$(json_get "$GENERATED" '.data.students')" == "4" ]] || fail "Fee invoice generation did not target all four Students"
FEES="$(bearer_get "$ADMIN_TOKEN" "$API_BASE/school/fees")"
DIRECT_INVOICE_ID="$(jq -er --arg code "$DIRECT_CODE" '.data.invoices[] | select(.student_code==$code and .term==1) | .id' <<< "$FEES")"
PARTIAL="$(request POST "$API_BASE/school/fees/payment" "$(jq -nc --arg invoice "$DIRECT_INVOICE_ID" '{invoiceId:$invoice,amount:400,paymentMode:"UPI",transactionRef:"CI-UPI-400"}')" "$ADMIN_TOKEN")"
[[ "$(json_get "$PARTIAL" '.data.receiptNumber')" =~ ^VS-REC- ]] || fail "First fee receipt number missing"
FEES_AFTER_PARTIAL="$(bearer_get "$ADMIN_TOKEN" "$API_BASE/school/fees")"
[[ "$(jq -r --arg id "$DIRECT_INVOICE_ID" '.data.invoices[] | select(.id==$id) | .status' <<< "$FEES_AFTER_PARTIAL")" == "PARTIAL" ]] || fail "Invoice did not become PARTIAL"
[[ "$(jq -r --arg id "$DIRECT_INVOICE_ID" '.data.invoices[] | select(.id==$id) | (.outstanding|tonumber)' <<< "$FEES_AFTER_PARTIAL")" == "600" ]] || fail "Partial-payment outstanding balance is wrong"
FULL="$(request POST "$API_BASE/school/fees/payment" "$(jq -nc --arg invoice "$DIRECT_INVOICE_ID" '{invoiceId:$invoice,amount:600,paymentMode:"CASH",notes:"School E2E balance"}')" "$ADMIN_TOKEN")"
[[ "$(json_get "$FULL" '.data.receiptNumber')" =~ ^VS-REC- ]] || fail "Second fee receipt number missing"
FEES_AFTER_FULL="$(bearer_get "$ADMIN_TOKEN" "$API_BASE/school/fees")"
[[ "$(jq -r --arg id "$DIRECT_INVOICE_ID" '.data.invoices[] | select(.id==$id) | .status' <<< "$FEES_AFTER_FULL")" == "PAID" ]] || fail "Invoice did not become PAID"
PAYMENTS="$(bearer_get "$ADMIN_TOKEN" "$API_BASE/school/fees/payments?invoiceId=$DIRECT_INVOICE_ID")"
[[ "$(json_get "$PAYMENTS" '.data | length')" == "2" ]] || fail "Fee payment history should contain two receipts"

log "Timetable save and Teacher conflict protection"
TIMETABLE_BODY="$(jq -nc --arg teacher "$TEACHER_ID" '{periods:[{day:"MON",periodNumber:1,startTime:"08:00",endTime:"08:40",subjectCode:"MATH",teacherId:$teacher,roomNumber:"CI-7C-101",isBreak:false},{day:"MON",periodNumber:2,startTime:"08:40",endTime:"09:00",isBreak:true,breakLabel:"Recess"}]}')"
TT_SAVE="$(request PUT "$API_BASE/school/timetable/$CLASS_C_ID" "$TIMETABLE_BODY" "$ADMIN_TOKEN")"
[[ "$(json_get "$TT_SAVE" '.data | length')" == "2" ]] || fail "Saved timetable response is not the committed timetable"
[[ "$(jq -r '.data[] | select(.period_number==1) | .teacher_name' <<< "$TT_SAVE")" == "Nisha Kapoor" ]] || fail "Timetable Teacher did not resolve"
CONFLICT_BODY="$(jq -nc --arg teacher "$TEACHER_ID" '{periods:[{day:"MON",periodNumber:1,startTime:"08:00",endTime:"08:40",subjectCode:"MATH",teacherId:$teacher,isBreak:false}]}')"
expect_status 409 PUT "$API_BASE/school/timetable/$CLASS_D_ID" "$CONFLICT_BODY" "$ADMIN_TOKEN"
expect_status 409 DELETE "$API_BASE/school/classes/$CLASS_C_ID" '' "$ADMIN_TOKEN"
expect_status 200 DELETE "$API_BASE/school/classes/$CLASS_D_ID" '' "$ADMIN_TOKEN"

log "School Exam creation, Student participation, server scoring and School Results"
START_TIME="$(date -u -d '1 minute ago' +%Y-%m-%dT%H:%M:%SZ)"
END_TIME="$(date -u -d '60 minutes' +%Y-%m-%dT%H:%M:%SZ)"
EXAM_PAYLOAD="$(jq -nc --arg start "$START_TIME" --arg examEnd "$END_TIME" '{title:"CI Class 7 Mathematics Test",description:"School Management E2E",classNames:["7"],subjectCodes:["MATH"],status:"LIVE",startTime:$start,endTime:$examEnd,durationMins:30,marksPerQuestion:2,negativeMarks:0,instructions:"Answer both questions",questions:[{questionText:"What is 12 + 8?",optionA:"20",optionB:"18",optionC:"22",optionD:"16",correctOption:"A",subjectCode:"MATH",difficulty:"EASY"},{questionText:"What is 9 × 6?",optionA:"45",optionB:"54",optionC:"56",optionD:"63",correctOption:"B",subjectCode:"MATH",difficulty:"EASY"}]}')"
EXAM="$(request POST "$API_BASE/school/exams" "$EXAM_PAYLOAD" "$ADMIN_TOKEN")"
EXAM_ID="$(json_get "$EXAM" '.data.id')"
[[ "$(json_get "$EXAM" '.data.questions | length')" == "2" ]] || fail "School Exam questions were not persisted"
REGISTER="$(request POST "$API_BASE/competition/$EXAM_ID/register" '{}' "$DIRECT_TOKEN")"
[[ "$(json_get "$REGISTER" '.data.registered')" == "true" ]] || fail "School-created Student could not register for School exam"
ATTEMPT="$(request POST "$API_BASE/competition/$EXAM_ID/start" '{}' "$DIRECT_TOKEN")"
ATTEMPT_ID="$(json_get "$ATTEMPT" '.data.attemptId')"
Q1="$(json_get "$ATTEMPT" '.data.questions[0].id')"
Q2="$(json_get "$ATTEMPT" '.data.questions[1].id')"
SUBMIT="$(request POST "$API_BASE/competition/attempts/$ATTEMPT_ID/submit" "$(jq -nc --arg q1 "$Q1" --arg q2 "$Q2" '{responses:[{questionId:$q1,selectedOption:"A"},{questionId:$q2,selectedOption:"B"}]}')" "$DIRECT_TOKEN")"
[[ "$(json_get "$SUBMIT" '.data.correctCount')" == "2" ]] || fail "School Exam server scoring is wrong"
[[ "$(json_get "$SUBMIT" '.data.score | tonumber')" == "4" ]] || fail "School Exam score is wrong"
RESULTS="$(bearer_get "$ADMIN_TOKEN" "$API_BASE/school/results")"
[[ "$(jq -r --arg id "$EXAM_ID" '[.data[] | select(.exam_id==$id)] | length' <<< "$RESULTS")" -ge 1 ]] || fail "School Results summary did not receive scored exam"
RESULT_DETAIL="$(bearer_get "$ADMIN_TOKEN" "$API_BASE/school/results/$EXAM_ID")"
[[ "$(jq -r --arg code "$DIRECT_CODE" '[.data.students[] | select(.student_code==$code and (.percentage|tonumber)==100)] | length' <<< "$RESULT_DETAIL")" == "1" ]] || fail "Student-level School Result is missing or incorrect"

log "Announcements target Parent accounts and remain readable to Teachers"
ANN="$(request POST "$API_BASE/school/announcements" '{"title":"CI Parent Meeting","body":"Parent meeting for Class 7 will be held this Saturday at 10 AM.","audience":"PARENTS","targetClass":"7","sendWhatsapp":false,"isPinned":true}' "$ADMIN_TOKEN")"
ANN_ID="$(json_get "$ANN" '.data.id')"
[[ -n "$ANN_ID" ]] || fail "Announcement was not created"
sleep 1
ANN_LIST="$(bearer_get "$TEACHER_TOKEN" "$API_BASE/school/announcements")"
[[ "$(jq -r --arg id "$ANN_ID" '[.data[] | select(.id==$id and .audience=="PARENTS")] | length' <<< "$ANN_LIST")" == "1" ]] || fail "Teacher cannot read School announcement"

log "Dashboard reflects School operations"
OVERVIEW_AFTER="$(bearer_get "$ADMIN_TOKEN" "$API_BASE/school/overview")"
AFTER_STUDENTS="$(json_get "$OVERVIEW_AFTER" '.data.stats.total_students | tonumber')"
(( AFTER_STUDENTS >= BASE_STUDENTS + 4 )) || fail "Dashboard Student count did not reflect admissions and approval"
(( $(json_get "$OVERVIEW_AFTER" '.data.stats.total_teachers | tonumber') >= 1 )) || fail "Dashboard Teacher count missing"
[[ "$(json_get "$OVERVIEW_AFTER" '.data.onboarding.checks.classes')" == "true" ]] || fail "Setup readiness classes check failed"
[[ "$(json_get "$OVERVIEW_AFTER" '.data.onboarding.checks.teachers')" == "true" ]] || fail "Setup readiness Teacher check failed"
[[ "$(json_get "$OVERVIEW_AFTER" '.data.onboarding.checks.students')" == "true" ]] || fail "Setup readiness Student check failed"
[[ "$(json_get "$OVERVIEW_AFTER" '.data.onboarding.checks.fees')" == "true" ]] || fail "Setup readiness Fee check failed"

log "Teacher deactivation takes effect immediately for existing JWT"
DEACTIVATE="$(request DELETE "$API_BASE/school/teachers/$TEACHER_ID" '' "$ADMIN_TOKEN")"
[[ "$(json_get "$DEACTIVATE" '.data.status')" == "INACTIVE" ]] || fail "Teacher deactivation failed"
expect_status 403 GET "$API_BASE/school/profile" '' "$TEACHER_TOKEN"

printf '\nSchool Management E2E passed.\n'
printf 'School: %s\n' "$SCHOOL_ID"
printf 'Created class: 7-C (%s)\n' "$CLASS_C_ID"
printf 'Direct Student: %s (%s)\n' "$DIRECT_CODE" "$DIRECT_USERNAME"
printf 'Approved self-registration: %s\n' "$PENDING_CODE"
printf 'Teacher: %s\n' "$TEACHER_USERNAME"
printf 'Exam: %s\n' "$EXAM_ID"