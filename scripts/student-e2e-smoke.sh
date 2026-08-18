#!/usr/bin/env bash
set -Eeuo pipefail

API_BASE="${API_BASE:-http://127.0.0.1:5000/api/v1}"
CI_MOBILE="${CI_MOBILE:-9399999999}"
CI_EMAIL="${CI_EMAIL:-ci.student@vidyasetu.test}"
CI_USERNAME="${CI_USERNAME:-ci.student}"
CI_PASSWORD="${CI_PASSWORD:-Student12345}"
CI_RESET_PASSWORD="${CI_RESET_PASSWORD:-Student54321}"
PARENT_MOBILE="${PARENT_MOBILE:-9400000001}"
SCHOOL_ADMIN_MOBILE="${SCHOOL_ADMIN_MOBILE:-9100000001}"
SCHOOL_ID="${SCHOOL_ID:-10000000-0000-0000-0000-000000000001}"
CLASS_ID="${CLASS_ID:-20000000-0000-0000-0000-000000000001}"

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
  local mobile="$1" role="${2:-}" send otp payload
  send="$(api_post "$API_BASE/auth/send-otp" "{\"mobile\":\"$mobile\"}")"
  otp="$(json_get "$send" '.data.otp')"
  [[ "$otp" =~ ^[0-9]{6}$ ]] || fail "Development OTP was not returned for $mobile"
  if [[ -n "$role" ]]; then
    payload="{\"mobile\":\"$mobile\",\"otp\":\"$otp\",\"deviceInfo\":\"student-e2e-smoke\",\"role\":\"$role\"}"
  else
    payload="{\"mobile\":\"$mobile\",\"otp\":\"$otp\",\"deviceInfo\":\"student-e2e-smoke\"}"
  fi
  api_post "$API_BASE/auth/verify-otp" "$payload"
}

password_session() {
  local identifier="$1" password="$2"
  api_post "$API_BASE/auth/login" "$(jq -nc --arg i "$identifier" --arg p "$password" '{identifier:$i,password:$p,deviceInfo:"student-e2e-smoke"}')"
}

log "Validate seeded Student baseline"
AARAV_LOGIN="$(otp_session 9300000001 STUDENT)"
AARAV_TOKEN="$(json_get "$AARAV_LOGIN" '.data.accessToken')"
AARAV_DASH="$(bearer_get "$AARAV_TOKEN" "$API_BASE/student/dashboard")"
[[ "$(json_get "$AARAV_DASH" '.data.student.mobile')" == "9300000001" ]] || fail "Seeded Student identity mismatch"
[[ "$(json_get "$AARAV_DASH" '.data.student.schoolLinkStatus')" == "APPROVED" ]] || fail "Seeded Student lost approved School link"
[[ "$(json_get "$AARAV_DASH" '.data.student.classLabel')" == "8-A" ]] || fail "Seeded Student class mismatch"
(( $(json_get "$AARAV_DASH" '.data.subjectProgress | length') >= 6 )) || fail "Seeded dashboard does not expose six subjects"
json_get "$AARAV_DASH" '.data.academic' >/dev/null || fail "Academic dashboard block missing"
if jq -e '.data.student | has("xpTotal") or has("xpLevel") or has("streakCurrent")' <<< "$AARAV_DASH" >/dev/null; then
  fail "Student dashboard still exposes XP/streak fields"
fi
AARAV_REPORT="$(bearer_get "$AARAV_TOKEN" "$API_BASE/student/report-card")"
(( $(json_get "$AARAV_REPORT" '.data.results | length') >= 1 )) || fail "Seeded Student report card has no scored school result"

log "Public Student registration with credentials, School request and Parent link"
REG_PAYLOAD="$(jq -nc --arg name 'CI Student' --arg username "$CI_USERNAME" --arg email "$CI_EMAIL" --arg mobile "$CI_MOBILE" --arg password "$CI_PASSWORD" --arg schoolId "$SCHOOL_ID" --arg classId "$CLASS_ID" --arg parentMobile "$PARENT_MOBILE" '{name:$name,username:$username,email:$email,mobile:$mobile,password:$password,language:"en",gradeLevel:"8",schoolId:$schoolId,classId:$classId,schoolNote:"CI enrollment verification",dateOfBirth:"2012-01-15",gender:"OTHER",parentName:"Rajesh Sharma",parentMobile:$parentMobile,parentRelation:"FATHER",deviceInfo:"student-e2e-smoke"}')"
REG="$(api_post "$API_BASE/auth/register/student" "$REG_PAYLOAD")"
NEW_TOKEN="$(json_get "$REG" '.data.accessToken')"
STUDENT_ID="$(json_get "$REG" '.data.student.id')"
STUDENT_CODE="$(json_get "$REG" '.data.student.studentCode')"
USERNAME="$(json_get "$REG" '.data.user.username')"
[[ "$USERNAME" == "$CI_USERNAME" ]] || fail "Requested username was not persisted"
[[ "$STUDENT_CODE" =~ ^VS[0-9]{2}-[0-9]{7}$ ]] || fail "Permanent Student ID format is invalid: $STUDENT_CODE"
[[ "$(json_get "$REG" '.data.student.schoolLinkStatus')" == "PENDING" ]] || fail "School request must start PENDING"
[[ "$(json_get "$REG" '.data.schoolRequest.status')" == "PENDING" ]] || fail "School enrollment request was not created"
[[ "$(json_get "$REG" '.data.parentLinkStatus')" == "APPROVED" ]] || fail "Existing Parent was not linked during registration"

PENDING_DASH="$(bearer_get "$NEW_TOKEN" "$API_BASE/student/dashboard")"
[[ "$(json_get "$PENDING_DASH" '.data.student.schoolLinkStatus')" == "PENDING" ]] || fail "Pending School state not visible on Student dashboard"
[[ "$(jq -r '.data.monthlyAttendance == null' <<< "$PENDING_DASH")" == "true" ]] || fail "Pending Student must not receive official attendance"
[[ "$(jq -r '.data.academic.classRank == null and .data.academic.schoolRank == null' <<< "$PENDING_DASH")" == "true" ]] || fail "Pending Student must not receive official School/Class rank"

log "Password authentication by username, email and permanent Student ID"
USER_LOGIN="$(password_session "$USERNAME" "$CI_PASSWORD")"
[[ "$(json_get "$USER_LOGIN" '.data.user.studentCode')" == "$STUDENT_CODE" ]] || fail "Username login returned wrong Student"
EMAIL_LOGIN="$(password_session "$CI_EMAIL" "$CI_PASSWORD")"
[[ "$(json_get "$EMAIL_LOGIN" '.data.user.studentCode')" == "$STUDENT_CODE" ]] || fail "Email login returned wrong Student"
CODE_LOGIN="$(password_session "$STUDENT_CODE" "$CI_PASSWORD")"
[[ "$(json_get "$CODE_LOGIN" '.data.user.username')" == "$USERNAME" ]] || fail "Student ID login returned wrong account"

log "OTP remains an alternate Student login"
OTP_LOGIN="$(otp_session "$CI_MOBILE" STUDENT)"
[[ "$(json_get "$OTP_LOGIN" '.data.user.studentCode')" == "$STUDENT_CODE" ]] || fail "OTP login returned wrong Student"

log "Password recovery by username and OTP"
FORGOT="$(api_post "$API_BASE/auth/forgot-password" "$(jq -nc --arg i "$USERNAME" '{identifier:$i}')")"
RECOVERY_OTP="$(json_get "$FORGOT" '.data.otp')"
[[ "$RECOVERY_OTP" =~ ^[0-9]{6}$ ]] || fail "Recovery OTP missing"
RESET="$(api_post "$API_BASE/auth/reset-password" "$(jq -nc --arg i "$USERNAME" --arg o "$RECOVERY_OTP" --arg p "$CI_RESET_PASSWORD" '{identifier:$i,otp:$o,newPassword:$p}')")"
[[ "$(json_get "$RESET" '.data.reset')" == "true" ]] || fail "Password reset did not complete"
RESET_LOGIN="$(password_session "$STUDENT_CODE" "$CI_RESET_PASSWORD")"
NEW_TOKEN="$(json_get "$RESET_LOGIN" '.data.accessToken')"
[[ "$(json_get "$RESET_LOGIN" '.data.user.username')" == "$USERNAME" ]] || fail "New-password login failed"

log "Parent integration"
PARENT_LOGIN="$(otp_session "$PARENT_MOBILE" PARENT)"
PARENT_TOKEN="$(json_get "$PARENT_LOGIN" '.data.accessToken')"
CHILDREN="$(bearer_get "$PARENT_TOKEN" "$API_BASE/parent/children")"
[[ "$(jq -r --arg code "$STUDENT_CODE" '[.data[] | select(.student_code == $code)] | length' <<< "$CHILDREN")" -eq 1 ]] || fail "Parent cannot see newly registered Student"

log "School integration: pending Student excluded from official roster"
SCHOOL_LOGIN="$(otp_session "$SCHOOL_ADMIN_MOBILE" SCHOOL_ADMIN)"
SCHOOL_TOKEN="$(json_get "$SCHOOL_LOGIN" '.data.accessToken')"
ROSTER_BEFORE="$(bearer_get "$SCHOOL_TOKEN" "$API_BASE/school/students?search=CI%20Student&limit=100")"
[[ "$(jq -r --arg code "$STUDENT_CODE" '[.data[] | select(.student_code == $code)] | length' <<< "$ROSTER_BEFORE")" -eq 0 ]] || fail "Pending Student leaked into official School roster"
REQUESTS="$(bearer_get "$SCHOOL_TOKEN" "$API_BASE/school/enrollment-requests?status=PENDING")"
REQUEST_ID="$(jq -er --arg code "$STUDENT_CODE" '.data[] | select(.student_code == $code) | .id' <<< "$REQUESTS")"
[[ -n "$REQUEST_ID" ]] || fail "School cannot see Student enrollment request"

log "School approves Student"
APPROVE="$(api_patch "$API_BASE/school/enrollment-requests/$REQUEST_ID" "$(jq -nc --arg classId "$CLASS_ID" '{action:"APPROVE",classId:$classId,rollNumber:"CI8A99",note:"Verified by CI"}')" "$SCHOOL_TOKEN")"
[[ "$(json_get "$APPROVE" '.data.status')" == "APPROVED" ]] || fail "Enrollment request did not become APPROVED"
[[ "$(json_get "$APPROVE" '.data.school_link_status')" == "APPROVED" ]] || fail "Student School link did not become APPROVED"
ROSTER_AFTER="$(bearer_get "$SCHOOL_TOKEN" "$API_BASE/school/students?search=CI%20Student&limit=100")"
[[ "$(jq -r --arg code "$STUDENT_CODE" '[.data[] | select(.student_code == $code and .roll_number == "CI8A99")] | length' <<< "$ROSTER_AFTER")" -eq 1 ]] || fail "Approved Student missing from official roster"
LINK="$(bearer_get "$NEW_TOKEN" "$API_BASE/student/school-link")"
[[ "$(json_get "$LINK" '.data.school_link_status')" == "APPROVED" ]] || fail "Student cannot see approved School link"
[[ "$(json_get "$LINK" '.data.parent_linked')" == "true" ]] || fail "Student School view lost Parent link"

log "Attendance integration after School approval"
TODAY="$(date +%F)"
MARK="$(api_post "$API_BASE/school/attendance" "$(jq -nc --arg classId "$CLASS_ID" --arg date "$TODAY" --arg studentId "$STUDENT_ID" '{classId:$classId,date:$date,records:[{studentId:$studentId,status:"PRESENT",remark:"Student E2E"}]}')" "$SCHOOL_TOKEN")"
[[ "$(json_get "$MARK" '.data.marked')" == "1" ]] || fail "School could not mark Student attendance"
CURRENT_YEAR="$(date +%Y)"
CURRENT_MONTH="$(date +%-m)"
ATT="$(bearer_get "$NEW_TOKEN" "$API_BASE/student/attendance/$CURRENT_YEAR/$CURRENT_MONTH")"
[[ "$(jq -r --arg date "$TODAY" '[.data.records[] | select(.date[0:10] == $date and .status == "PRESENT")] | length' <<< "$ATT")" -ge 1 ]] || fail "Student attendance record not visible"

log "Student dashboard after approval"
APPROVED_DASH="$(bearer_get "$NEW_TOKEN" "$API_BASE/student/dashboard")"
[[ "$(json_get "$APPROVED_DASH" '.data.student.schoolLinkStatus')" == "APPROVED" ]] || fail "Approved status missing from dashboard"
[[ "$(json_get "$APPROVED_DASH" '.data.student.schoolName')" == "Saraswati Vidya Mandir" ]] || fail "Approved School name mismatch"
[[ "$(json_get "$APPROVED_DASH" '.data.monthlyAttendance.present_days')" -ge 1 ]] || fail "Dashboard attendance did not activate"
(( $(json_get "$APPROVED_DASH" '.data.subjectProgress | length') >= 6 )) || fail "Dashboard subject progress incomplete"

log "My Subjects: six subjects, chapters and lesson completion without XP"
SUBJECTS="$(curl -fsS "$API_BASE/content/subjects?class=8")"
for code in MATH SCI ENG HIN SST SAN; do
  [[ "$(jq -r --arg code "$code" '[.data[] | select(.code == $code)] | length' <<< "$SUBJECTS")" -ge 1 ]] || fail "Subject $code missing"
done
MATH_ID="$(jq -er '.data[] | select(.code == "MATH") | .id' <<< "$SUBJECTS")"
CHAPTERS="$(curl -fsS "$API_BASE/content/subjects/$MATH_ID/chapters?class=8")"
(( $(json_get "$CHAPTERS" '.data | length') >= 2 )) || fail "Math chapters missing"
RATIONAL_CHAPTER="$(jq -er '.data[] | select(.chapter_number == 1) | .id' <<< "$CHAPTERS")"
ITEMS="$(bearer_get "$NEW_TOKEN" "$API_BASE/content/chapters/$RATIONAL_CHAPTER/items?lang=hi")"
(( $(json_get "$ITEMS" '.data | length') >= 3 )) || fail "Published learning content missing"
LESSON="$(api_post "$API_BASE/content/items/70000000-0000-0000-0000-000000000001/complete" '{}' "$NEW_TOKEN")"
[[ "$(json_get "$LESSON" '.data.completed')" == "true" ]] || fail "Lesson completion failed"
[[ "$(json_get "$LESSON" '.data.progressPct')" == "100" ]] || fail "Lesson progress not persisted"
[[ "$(jq -r '.data | has("xpAwarded")' <<< "$LESSON")" == "false" ]] || fail "Lesson completion still exposes XP"

log "Quiz: server scoring and progress without XP"
QUIZ="$(bearer_get "$NEW_TOKEN" "$API_BASE/content/items/70000000-0000-0000-0000-000000000003/quiz")"
[[ "$(json_get "$QUIZ" '.data | length')" == "5" ]] || fail "Quiz should contain five questions"
QUIZ_PAYLOAD="$(jq -c '{answers: [.data[] | {questionId: .id, selectedOption: (if .sort_order == 1 then "B" elif .sort_order == 2 then "B" elif .sort_order == 3 then "C" elif .sort_order == 4 then "A" else "D" end)}]}' <<< "$QUIZ")"
QUIZ_RESULT="$(api_post "$API_BASE/content/items/70000000-0000-0000-0000-000000000003/quiz/submit" "$QUIZ_PAYLOAD" "$NEW_TOKEN")"
[[ "$(json_get "$QUIZ_RESULT" '.data.passed')" == "true" ]] || fail "Quiz did not pass"
[[ "$(json_get "$QUIZ_RESULT" '.data.score')" == "100" ]] || fail "Quiz server scoring is wrong"
[[ "$(jq -r '.data | has("xpAwarded")' <<< "$QUIZ_RESULT")" == "false" ]] || fail "Quiz submission still exposes XP"

log "AI Tutor"
AI="$(api_post "$API_BASE/ai/chat" '{"message":"Pythagoras theorem explain karo with an example","history":[]}' "$NEW_TOKEN")"
[[ -n "$(json_get "$AI" '.data.response')" ]] || fail "AI Tutor returned empty response"

log "Doubt Forum: create, AI answer, peer answer, upvote and resolve"
PRIYA_LOGIN="$(otp_session 9300000002 STUDENT)"
PRIYA_TOKEN="$(json_get "$PRIYA_LOGIN" '.data.accessToken')"
DOUBT="$(api_post "$API_BASE/doubts" '{"title":"How can I verify a linear equation answer?","body":"Please explain a quick substitution method step by step.","subjectCode":"MATH"}' "$NEW_TOKEN")"
DOUBT_ID="$(json_get "$DOUBT" '.data.id')"
AI_ANSWER="$(api_post "$API_BASE/doubts/$DOUBT_ID/ai-answer" '{}' "$NEW_TOKEN")"
[[ -n "$(json_get "$AI_ANSWER" '.data.answerId')" ]] || fail "Doubt AI assistance failed"
PEER_ANSWER="$(api_post "$API_BASE/doubts/$DOUBT_ID/answers" '{"body":"Put your x value back into the left side. If both sides become equal, your solution is verified."}' "$PRIYA_TOKEN")"
PEER_ANSWER_ID="$(json_get "$PEER_ANSWER" '.data.id')"
UPVOTE="$(api_post "$API_BASE/doubts/$DOUBT_ID/answers/$PEER_ANSWER_ID/upvote" '{}' "$NEW_TOKEN")"
[[ "$(json_get "$UPVOTE" '.data.upvoted')" == "true" ]] || fail "Doubt answer upvote failed"
RESOLVE="$(api_patch "$API_BASE/doubts/$DOUBT_ID/resolve" "$(jq -nc --arg id "$PEER_ANSWER_ID" '{bestAnswerId:$id}')" "$NEW_TOKEN")"
[[ "$(json_get "$RESOLVE" '.data.resolved')" == "true" ]] || fail "Doubt resolve failed"
DETAIL="$(bearer_get "$NEW_TOKEN" "$API_BASE/doubts/$DOUBT_ID")"
[[ "$(json_get "$DETAIL" '.data.status')" == "RESOLVED" ]] || fail "Resolved doubt status not persisted"
[[ "$(jq -r --arg aid "$PEER_ANSWER_ID" '[.data.answers[] | select(.id == $aid and .is_accepted == true)] | length' <<< "$DETAIL")" -eq 1 ]] || fail "Accepted answer not persisted"

log "Exams: availability, registration, timer, scoring and rank"
MY_EXAMS="$(bearer_get "$NEW_TOKEN" "$API_BASE/competition/mine/list")"
[[ "$(jq -r '[.data[] | select(.id == "b0000000-0000-0000-0000-000000000001" and .status == "LIVE")] | length' <<< "$MY_EXAMS")" -eq 1 ]] || fail "Live practice exam missing"
[[ "$(jq -r '[.data[] | select(.id == "b0000000-0000-0000-0000-000000000002" and .status == "REGISTRATION_OPEN")] | length' <<< "$MY_EXAMS")" -eq 1 ]] || fail "Upcoming Science exam missing"
REG_EXAM="$(api_post "$API_BASE/competition/b0000000-0000-0000-0000-000000000002/register" '{}' "$NEW_TOKEN")"
[[ "$(json_get "$REG_EXAM" '.data.registered')" == "true" ]] || fail "Exam registration failed"
START="$(api_post "$API_BASE/competition/b0000000-0000-0000-0000-000000000001/start" '{}' "$NEW_TOKEN")"
ATTEMPT_ID="$(json_get "$START" '.data.attemptId')"
[[ "$(json_get "$START" '.data.questions | length')" == "5" ]] || fail "Live exam question payload invalid"
[[ -n "$(json_get "$START" '.data.endsAt')" ]] || fail "Exam timer end missing"
EXAM_PAYLOAD='{"responses":[{"questionId":"b1000000-0000-0000-0000-000000000001","selectedOption":"A"},{"questionId":"b1000000-0000-0000-0000-000000000002","selectedOption":"C"},{"questionId":"b1000000-0000-0000-0000-000000000003","selectedOption":"C"},{"questionId":"b1000000-0000-0000-0000-000000000004","selectedOption":"B"},{"questionId":"b1000000-0000-0000-0000-000000000005","selectedOption":"B"}]}'
SUBMIT="$(api_post "$API_BASE/competition/attempts/$ATTEMPT_ID/submit" "$EXAM_PAYLOAD" "$NEW_TOKEN")"
[[ "$(json_get "$SUBMIT" '.data.correctCount')" == "5" ]] || fail "Exam server scoring failed"
[[ "$(json_get "$SUBMIT" '.data.score')" == "10" ]] || fail "Exam score should be 10/10"
json_get "$SUBMIT" '.data.rank_overall' >/dev/null || fail "Exam overall rank missing"
EXAM_BOARD="$(curl -fsS "$API_BASE/competition/b0000000-0000-0000-0000-000000000001/leaderboard")"
[[ "$(jq -r '[.data[] | select(.name == "CI Student")] | length' <<< "$EXAM_BOARD")" -eq 1 ]] || fail "Student missing from exam leaderboard"

log "Report Card and academic dashboard contract"
REPORT="$(bearer_get "$NEW_TOKEN" "$API_BASE/student/report-card")"
[[ "$(json_get "$REPORT" '.data.student.student_code')" == "$STUDENT_CODE" ]] || fail "Report Card Student identity missing"
FINAL_DASH="$(bearer_get "$NEW_TOKEN" "$API_BASE/student/dashboard")"
if jq -e '.data.student | has("xpTotal") or has("xpLevel") or has("streakCurrent")' <<< "$FINAL_DASH" >/dev/null; then
  fail "XP/streak fields reappeared in final Student dashboard"
fi

log "Offline Mode: register, list and remove"
OFFLINE_REG="$(api_post "$API_BASE/content/items/70000000-0000-0000-0000-000000000001/download" '{}' "$NEW_TOKEN")"
[[ -n "$(json_get "$OFFLINE_REG" '.data.url')" ]] || fail "Offline download did not return content URL"
OFFLINE_LIST="$(bearer_get "$NEW_TOKEN" "$API_BASE/student/offline-downloads")"
[[ "$(jq -r '[.data.items[] | select(.content_item_id == "70000000-0000-0000-0000-000000000001")] | length' <<< "$OFFLINE_LIST")" -eq 1 ]] || fail "Offline download was not persisted"
REMOVE="$(curl -fsS -X DELETE "$API_BASE/student/offline-downloads/70000000-0000-0000-0000-000000000001" -H "Authorization: Bearer $NEW_TOKEN")"
[[ "$(json_get "$REMOVE" '.data.removed')" == "true" ]] || fail "Offline removal failed"

log "Profile and Security"
ME="$(bearer_get "$NEW_TOKEN" "$API_BASE/auth/me")"
[[ "$(json_get "$ME" '.data.student_code')" == "$STUDENT_CODE" ]] || fail "Profile Student ID mismatch"
PROFILE="$(api_patch "$API_BASE/auth/profile" '{"language":"hi"}' "$NEW_TOKEN")"
[[ "$(json_get "$PROFILE" '.data.language')" == "hi" ]] || fail "Profile update failed"
CHANGE="$(api_post "$API_BASE/auth/set-password" "$(jq -nc --arg current "$CI_RESET_PASSWORD" --arg next 'Student67890' '{currentPassword:$current,newPassword:$next}')" "$NEW_TOKEN")"
[[ "$(json_get "$CHANGE" '.data.changed')" == "true" ]] || fail "Authenticated password change failed"
FINAL_LOGIN="$(password_session "$STUDENT_CODE" 'Student67890')"
[[ "$(json_get "$FINAL_LOGIN" '.data.user.studentCode')" == "$STUDENT_CODE" ]] || fail "Login after password change failed"

log "Student E2E API smoke passed"
printf '%s\n' 'Validated: registration, username/email/Student-ID/password login, OTP/recovery, School pending→approval, Parent link, dashboard, subjects, quiz, AI Tutor, doubts, exams, attendance, report card, offline mode and profile/security — without Student XP rewards.'
