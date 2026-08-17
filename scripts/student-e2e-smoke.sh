#!/usr/bin/env bash
set -Eeuo pipefail

API_BASE="${API_BASE:-http://127.0.0.1:5000/api/v1}"
CI_MOBILE="${CI_MOBILE:-9399999999}"

log() { printf '\n==> %s\n' "$*"; }
fail() { printf '\nFAILED: %s\n' "$*" >&2; exit 1; }
json_get() { jq -er "$2" <<< "$1"; }

auth_token() {
  local mobile="$1" send otp login token
  send="$(curl -fsS -X POST "$API_BASE/auth/send-otp" -H 'Content-Type: application/json' -d "{\"mobile\":\"$mobile\"}")"
  otp="$(jq -er '.data.otp' <<< "$send")"
  [[ "$otp" =~ ^[0-9]{6}$ ]] || fail "No development OTP returned for $mobile"
  login="$(curl -fsS -X POST "$API_BASE/auth/verify-otp" -H 'Content-Type: application/json' -d "{\"mobile\":\"$mobile\",\"otp\":\"$otp\"}")"
  token="$(jq -er '.data.accessToken' <<< "$login")"
  printf '%s' "$token"
}

bearer_get() {
  local token="$1" url="$2"
  curl -fsS "$url" -H "Authorization: Bearer $token"
}

log "Authenticate seeded Class 8 Students"
AARAV_TOKEN="$(auth_token 9300000001)"
PRIYA_TOKEN="$(auth_token 9300000002)"

AARAV_STATUS="$(bearer_get "$AARAV_TOKEN" "$API_BASE/student/profile/status")"
[[ "$(json_get "$AARAV_STATUS" '.data.complete')" == "true" ]] || fail "Aarav profile is incomplete"
[[ "$(json_get "$AARAV_STATUS" '.data.profile.mobile')" == "9300000001" ]] || fail "Aarav identity mismatch"
[[ "$(json_get "$AARAV_STATUS" '.data.profile.className')" == "8" ]] || fail "Aarav is not Class 8"

log "Dashboard: identity, XP, attendance, ranks, streak, subjects, exams and XP activity"
AARAV_DASH="$(bearer_get "$AARAV_TOKEN" "$API_BASE/student/dashboard")"
[[ "$(json_get "$AARAV_DASH" '.data.student.mobile')" == "9300000001" ]] || fail "Dashboard identity mismatch"
[[ "$(json_get "$AARAV_DASH" '.data.student.schoolName')" == "Saraswati Vidya Mandir" ]] || fail "Dashboard school mismatch"
[[ "$(json_get "$AARAV_DASH" '.data.student.classLabel')" == "8-A" ]] || fail "Dashboard class/section mismatch"
(( $(json_get "$AARAV_DASH" '.data.student.xpTotal') > 0 )) || fail "Dashboard XP missing"
(( $(json_get "$AARAV_DASH" '.data.student.xpLevel') > 0 )) || fail "Dashboard level missing"
(( $(json_get "$AARAV_DASH" '.data.student.streakCurrent') > 0 )) || fail "Dashboard streak missing"
(( $(json_get "$AARAV_DASH" '.data.subjectProgress | length') >= 6 )) || fail "Dashboard does not expose six subjects"
(( $(json_get "$AARAV_DASH" '.data.upcomingExams | length') >= 1 )) || fail "Dashboard upcoming exams missing"
(( $(json_get "$AARAV_DASH" '.data.recentXP | length') >= 1 )) || fail "Dashboard recent XP missing"
json_get "$AARAV_DASH" '.data.ranking.classRank' >/dev/null || fail "Class rank missing"
json_get "$AARAV_DASH" '.data.ranking.schoolRank' >/dev/null || fail "School rank missing"

CURRENT_YEAR="$(date +%Y)"
CURRENT_MONTH="$(date +%-m)"
ATT="$(bearer_get "$AARAV_TOKEN" "$API_BASE/student/attendance/$CURRENT_YEAR/$CURRENT_MONTH")"
(( $(json_get "$ATT" '.data.records | length') >= 1 )) || fail "Attendance records missing"
(( $(json_get "$ATT" '.data.summary.working_days') >= 1 )) || fail "Attendance summary missing"

REPORT="$(bearer_get "$AARAV_TOKEN" "$API_BASE/student/report-card")"
(( $(json_get "$REPORT" '.data.results | length') >= 2 )) || fail "Report card scored school tests missing"

CLASS_BOARD="$(bearer_get "$AARAV_TOKEN" "$API_BASE/student/leaderboard?scope=class")"
SCHOOL_BOARD="$(bearer_get "$AARAV_TOKEN" "$API_BASE/student/leaderboard?scope=school")"
(( $(json_get "$CLASS_BOARD" '.data | length') >= 1 )) || fail "Class leaderboard empty"
(( $(json_get "$SCHOOL_BOARD" '.data | length') >= 1 )) || fail "School leaderboard empty"
[[ "$(jq -r '[.data[] | select(.is_me == true)] | length' <<< "$CLASS_BOARD")" -ge 1 ]] || fail "Current Student is not highlighted in class leaderboard"

log "Create a brand-new Student and complete real school/class enrollment"
NEW_TOKEN="$(auth_token "$CI_MOBILE")"
BEFORE="$(bearer_get "$NEW_TOKEN" "$API_BASE/student/profile/status")"
[[ "$(json_get "$BEFORE" '.data.complete')" == "false" ]] || fail "New Student unexpectedly already has a profile"

OPTIONS="$(bearer_get "$NEW_TOKEN" "$API_BASE/student/profile/setup-options")"
SCHOOL_ID="$(jq -er '.data.schools[] | select(.name == "Saraswati Vidya Mandir") | .id' <<< "$OPTIONS")"
CLASS_ID="$(jq -er --arg sid "$SCHOOL_ID" '.data.schools[] | select(.id == $sid) | .classes[] | select(.className == "8" and .section == "A") | .id' <<< "$OPTIONS")"

COMPLETE="$(curl -fsS -X POST "$API_BASE/student/profile/complete" \
  -H "Authorization: Bearer $NEW_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"name\":\"CI Student\",\"language\":\"hi\",\"schoolId\":\"$SCHOOL_ID\",\"classId\":\"$CLASS_ID\",\"dateOfBirth\":\"2012-01-15\",\"gender\":\"OTHER\"}")"
[[ "$(json_get "$COMPLETE" '.data.student.mobile')" == "$CI_MOBILE" ]] || fail "Student profile mobile mismatch"
[[ "$(json_get "$COMPLETE" '.data.student.classLabel')" == "8-A" ]] || fail "Student profile class mismatch"

AFTER="$(bearer_get "$NEW_TOKEN" "$API_BASE/student/profile/status")"
[[ "$(json_get "$AFTER" '.data.complete')" == "true" ]] || fail "Student profile did not persist"

log "My Subjects: six subjects -> chapters -> items -> lesson completion -> XP"
SUBJECTS="$(curl -fsS "$API_BASE/content/subjects?class=8")"
for code in MATH SCI ENG HIN SST SAN; do
  [[ "$(jq -r --arg code "$code" '[.data[] | select(.code == $code)] | length' <<< "$SUBJECTS")" -ge 1 ]] || fail "Subject $code missing"
done
MATH_ID="$(jq -er '.data[] | select(.code == "MATH") | .id' <<< "$SUBJECTS")"
CHAPTERS="$(curl -fsS "$API_BASE/content/subjects/$MATH_ID/chapters?class=8")"
(( $(json_get "$CHAPTERS" '.data | length') >= 2 )) || fail "Math chapters missing"
RATIONAL_CHAPTER="$(jq -er '.data[] | select(.chapter_number == 1) | .id' <<< "$CHAPTERS")"
ITEMS="$(bearer_get "$NEW_TOKEN" "$API_BASE/content/chapters/$RATIONAL_CHAPTER/items?lang=hi")"
(( $(json_get "$ITEMS" '.data | length') >= 3 )) || fail "Rational Numbers content items missing"

NEW_DASH_BEFORE="$(bearer_get "$NEW_TOKEN" "$API_BASE/student/dashboard")"
XP_BEFORE="$(json_get "$NEW_DASH_BEFORE" '.data.student.xpTotal')"
LESSON="$(curl -fsS -X POST "$API_BASE/content/items/70000000-0000-0000-0000-000000000001/complete" -H "Authorization: Bearer $NEW_TOKEN")"
[[ "$(json_get "$LESSON" '.data.alreadyCompleted')" == "false" ]] || fail "Lesson was unexpectedly already completed"
(( $(json_get "$LESSON" '.data.xpAwarded') > 0 )) || fail "Lesson completion did not report awarded XP"
NEW_DASH_AFTER_LESSON="$(bearer_get "$NEW_TOKEN" "$API_BASE/student/dashboard")"
XP_AFTER_LESSON="$(json_get "$NEW_DASH_AFTER_LESSON" '.data.student.xpTotal')"
(( XP_AFTER_LESSON > XP_BEFORE )) || fail "Lesson completion did not award XP"

log "Quiz: render questions -> submit -> server-side scoring -> progress/XP"
QUIZ="$(bearer_get "$NEW_TOKEN" "$API_BASE/content/items/70000000-0000-0000-0000-000000000003/quiz")"
[[ "$(json_get "$QUIZ" '.data | length')" == "5" ]] || fail "Quiz should contain five questions"
QUIZ_PAYLOAD="$(jq -c '{answers: [.data[] | {questionId: .id, selectedOption: (if .sort_order == 1 then "B" elif .sort_order == 2 then "B" elif .sort_order == 3 then "C" elif .sort_order == 4 then "A" else "D" end)}]}' <<< "$QUIZ")"
QUIZ_RESULT="$(curl -fsS -X POST "$API_BASE/content/items/70000000-0000-0000-0000-000000000003/quiz/submit" \
  -H "Authorization: Bearer $NEW_TOKEN" -H 'Content-Type: application/json' -d "$QUIZ_PAYLOAD")"
[[ "$(json_get "$QUIZ_RESULT" '.data.passed')" == "true" ]] || fail "Quiz did not pass"
[[ "$(json_get "$QUIZ_RESULT" '.data.score')" == "100" ]] || fail "Quiz server scoring is wrong"
(( $(json_get "$QUIZ_RESULT" '.data.xpAwarded') > 0 )) || fail "Quiz did not award first-pass XP"

log "AI Tutor: real authenticated /ai/chat request/response"
AI="$(curl -fsS -X POST "$API_BASE/ai/chat" -H "Authorization: Bearer $NEW_TOKEN" -H 'Content-Type: application/json' \
  -d '{"message":"Pythagoras theorem explain karo with an example","history":[]}')"
[[ -n "$(json_get "$AI" '.data.response')" ]] || fail "AI Tutor returned an empty response"

log "Doubt Forum: create -> AI answer -> peer answer -> upvote -> resolve"
DOUBT="$(curl -fsS -X POST "$API_BASE/doubts" -H "Authorization: Bearer $NEW_TOKEN" -H 'Content-Type: application/json' \
  -d '{"title":"How can I verify a linear equation answer?","body":"Please explain a quick substitution method step by step.","subjectCode":"MATH"}')"
DOUBT_ID="$(json_get "$DOUBT" '.data.id')"
AI_ANSWER="$(curl -fsS -X POST "$API_BASE/doubts/$DOUBT_ID/ai-answer" -H "Authorization: Bearer $NEW_TOKEN")"
AI_ANSWER_ID="$(json_get "$AI_ANSWER" '.data.answerId')"
[[ -n "$AI_ANSWER_ID" ]] || fail "Doubt AI assistance failed"

PEER_ANSWER="$(curl -fsS -X POST "$API_BASE/doubts/$DOUBT_ID/answers" -H "Authorization: Bearer $PRIYA_TOKEN" -H 'Content-Type: application/json' \
  -d '{"body":"Put your x value back into the left side. If both sides become equal, your solution is verified."}')"
PEER_ANSWER_ID="$(json_get "$PEER_ANSWER" '.data.id')"
UPVOTE="$(curl -fsS -X POST "$API_BASE/doubts/$DOUBT_ID/answers/$PEER_ANSWER_ID/upvote" -H "Authorization: Bearer $NEW_TOKEN")"
[[ "$(json_get "$UPVOTE" '.data.upvoted')" == "true" ]] || fail "Doubt answer upvote failed"
RESOLVE="$(curl -fsS -X PATCH "$API_BASE/doubts/$DOUBT_ID/resolve" -H "Authorization: Bearer $NEW_TOKEN" -H 'Content-Type: application/json' \
  -d "{\"bestAnswerId\":\"$PEER_ANSWER_ID\"}")"
[[ "$(json_get "$RESOLVE" '.data.resolved')" == "true" ]] || fail "Doubt resolve failed"
DETAIL="$(bearer_get "$NEW_TOKEN" "$API_BASE/doubts/$DOUBT_ID")"
[[ "$(json_get "$DETAIL" '.data.status')" == "RESOLVED" ]] || fail "Resolved doubt status was not persisted"
[[ "$(jq -r --arg aid "$PEER_ANSWER_ID" '[.data.answers[] | select(.id == $aid and .is_accepted == true)] | length' <<< "$DETAIL")" -eq 1 ]] || fail "Accepted answer was not persisted"

log "Exams: availability -> registration -> live start -> timer payload -> submit -> score -> rank"
MY_EXAMS="$(bearer_get "$NEW_TOKEN" "$API_BASE/competition/mine/list")"
[[ "$(jq -r '[.data[] | select(.id == "b0000000-0000-0000-0000-000000000001" and .status == "LIVE")] | length' <<< "$MY_EXAMS")" -eq 1 ]] || fail "Live practice exam missing"
[[ "$(jq -r '[.data[] | select(.id == "b0000000-0000-0000-0000-000000000002" and .status == "REGISTRATION_OPEN")] | length' <<< "$MY_EXAMS")" -eq 1 ]] || fail "Upcoming Science exam missing"

REG="$(curl -fsS -X POST "$API_BASE/competition/b0000000-0000-0000-0000-000000000002/register" -H "Authorization: Bearer $NEW_TOKEN")"
[[ "$(json_get "$REG" '.data.registered')" == "true" ]] || fail "Exam registration failed"

START="$(curl -fsS -X POST "$API_BASE/competition/b0000000-0000-0000-0000-000000000001/start" -H "Authorization: Bearer $NEW_TOKEN")"
ATTEMPT_ID="$(json_get "$START" '.data.attemptId')"
[[ "$(json_get "$START" '.data.questions | length')" == "5" ]] || fail "Live exam question rendering payload invalid"
[[ -n "$(json_get "$START" '.data.endsAt')" ]] || fail "Exam timer end is missing"

EXAM_PAYLOAD='{"responses":[
  {"questionId":"b1000000-0000-0000-0000-000000000001","selectedOption":"A"},
  {"questionId":"b1000000-0000-0000-0000-000000000002","selectedOption":"C"},
  {"questionId":"b1000000-0000-0000-0000-000000000003","selectedOption":"C"},
  {"questionId":"b1000000-0000-0000-0000-000000000004","selectedOption":"B"},
  {"questionId":"b1000000-0000-0000-0000-000000000005","selectedOption":"B"}
]}'
SUBMIT="$(curl -fsS -X POST "$API_BASE/competition/attempts/$ATTEMPT_ID/submit" \
  -H "Authorization: Bearer $NEW_TOKEN" -H 'Content-Type: application/json' -d "$EXAM_PAYLOAD")"
[[ "$(json_get "$SUBMIT" '.data.correctCount')" == "5" ]] || fail "Exam server scoring failed"
[[ "$(json_get "$SUBMIT" '.data.score')" == "10" ]] || fail "Exam score should be 10/10"
json_get "$SUBMIT" '.data.rank_overall' >/dev/null || fail "Exam overall rank missing"

EXAM_BOARD="$(curl -fsS "$API_BASE/competition/b0000000-0000-0000-0000-000000000001/leaderboard")"
[[ "$(jq -r '[.data[] | select(.name == "CI Student")] | length' <<< "$EXAM_BOARD")" -eq 1 ]] || fail "Student missing from exam leaderboard"

log "Badges & XP: catalogue, earned state, ledger-backed dashboard XP"
BADGES="$(bearer_get "$NEW_TOKEN" "$API_BASE/student/badges")"
(( $(json_get "$BADGES" '.data | length') >= 10 )) || fail "Badge catalogue incomplete"
[[ "$(jq -r '[.data[] | select(.earned == true)] | length' <<< "$BADGES")" -ge 1 ]] || fail "Student did not earn any badge after learning/exam activity"
FINAL_DASH="$(bearer_get "$NEW_TOKEN" "$API_BASE/student/dashboard")"
(( $(json_get "$FINAL_DASH" '.data.student.xpTotal') > XP_AFTER_LESSON )) || fail "XP did not update after quiz/exam/doubt activity"

log "Offline Mode: register -> list -> remove"
OFFLINE_REG="$(curl -fsS -X POST "$API_BASE/content/items/70000000-0000-0000-0000-000000000001/download" -H "Authorization: Bearer $NEW_TOKEN")"
[[ -n "$(json_get "$OFFLINE_REG" '.data.url')" ]] || fail "Offline download did not return content URL"
OFFLINE_LIST="$(bearer_get "$NEW_TOKEN" "$API_BASE/student/offline-downloads")"
[[ "$(jq -r '[.data.items[] | select(.content_item_id == "70000000-0000-0000-0000-000000000001")] | length' <<< "$OFFLINE_LIST")" -eq 1 ]] || fail "Offline download was not persisted"
REMOVE="$(curl -fsS -X DELETE "$API_BASE/student/offline-downloads/70000000-0000-0000-0000-000000000001" -H "Authorization: Bearer $NEW_TOKEN")"
[[ "$(json_get "$REMOVE" '.data.removed')" == "true" ]] || fail "Offline removal failed"

log "Student E2E API smoke passed"
printf 'Validated: profile, dashboard, subjects, quiz, AI, doubts, exams, attendance, XP/badges, leaderboards, report card, offline registry.\n'
