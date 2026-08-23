#!/usr/bin/env bash
set -Eeuo pipefail

API_BASE="${API_BASE:-http://127.0.0.1:5000/api/v1}"
ADMIN_MOBILE="${ADMIN_MOBILE:-9000000000}"
STUDENT_MOBILE="${STUDENT_MOBILE:-9300000001}"

fail(){ printf 'FAILED: %s\n' "$*" >&2; exit 1; }
log(){ printf '\n==> %s\n' "$*"; }

login(){
  local mobile="$1" role="$2"
  local send otp response
  send="$(curl -fsS -X POST "$API_BASE/auth/send-otp" -H 'Content-Type: application/json' -d "{\"mobile\":\"$mobile\",\"role\":\"$role\"}")"
  otp="$(jq -er '.data.otp' <<<"$send")"
  response="$(curl -fsS -X POST "$API_BASE/auth/verify-otp" -H 'Content-Type: application/json' -d "{\"mobile\":\"$mobile\",\"otp\":\"$otp\",\"role\":\"$role\"}")"
  jq -er '.data.accessToken' <<<"$response"
}

log "Public structured practice catalogue"
PUBLIC="$(curl -fsS "$API_BASE/public/learning/assessments?class=8&board=CBSE")"
jq -e '.success == true and (.data | any(.public_slug=="class-8-maths-quick-practice"))' <<<"$PUBLIC" >/dev/null || fail "Starter public practice assessment missing"
ASSESSMENT_ID="$(jq -er '.data[] | select(.public_slug=="class-8-maths-quick-practice") | .id' <<<"$PUBLIC")"
DETAIL="$(curl -fsS "$API_BASE/public/learning/assessments/class-8-maths-quick-practice")"
jq -e '.data.anonymousMode == true and (.data.questions | length == 4)' <<<"$DETAIL" >/dev/null || fail "Public practice preview incomplete"
jq -e '.data.questions | all(has("correct_answer")|not)' <<<"$DETAIL" >/dev/null || fail "Public API must not expose answer keys"

log "Authenticate Student and verify personalised board/class Learning Home"
STUDENT_TOKEN="$(login "$STUDENT_MOBILE" STUDENT)"
HOME="$(curl -fsS "$API_BASE/student/learning/home" -H "Authorization: Bearer $STUDENT_TOKEN")"
jq -e '.success == true and .data.learner.className == 8' <<<"$HOME" >/dev/null || fail "Student Learning Home class personalization missing"
jq -e '.data.assessments | any(.id=="'"$ASSESSMENT_ID"'")' <<<"$HOME" >/dev/null || fail "Student Learning Home missing applicable practice"

log "Student resource progress and bookmark"
RESOURCE_ID="$(curl -fsS "$API_BASE/public/learning/resources?class=8&limit=20" | jq -er '.data[0].id')"
curl -fsS -X PATCH "$API_BASE/student/learning/resources/$RESOURCE_ID/progress" -H "Authorization: Bearer $STUDENT_TOKEN" -H 'Content-Type: application/json' -d '{"progressPct":100}' | jq -e '.data.is_completed == true' >/dev/null || fail "Resource completion failed"
curl -fsS -X POST "$API_BASE/student/learning/resources/$RESOURCE_ID/bookmark" -H "Authorization: Bearer $STUDENT_TOKEN" | jq -e '.data.bookmarked == true' >/dev/null || fail "Bookmark failed"
HOME2="$(curl -fsS "$API_BASE/student/learning/home" -H "Authorization: Bearer $STUDENT_TOKEN")"
jq -e '.data.progress.completed >= 1 and (.data.bookmarks | length >= 1)' <<<"$HOME2" >/dev/null || fail "Learning progress/bookmark not reflected in home"

log "Student practice attempt scoring and explanation feedback"
START="$(curl -fsS -X POST "$API_BASE/student/learning/assessments/$ASSESSMENT_ID/start" -H "Authorization: Bearer $STUDENT_TOKEN")"
ATTEMPT_ID="$(jq -er '.data.id' <<<"$START")"
ASSESS="$(curl -fsS "$API_BASE/student/learning/assessments/$ASSESSMENT_ID" -H "Authorization: Bearer $STUDENT_TOKEN")"
Q1="$(jq -er '.data.questions[0].id' <<<"$ASSESS")"
Q2="$(jq -er '.data.questions[1].id' <<<"$ASSESS")"
Q3="$(jq -er '.data.questions[2].id' <<<"$ASSESS")"
Q4="$(jq -er '.data.questions[3].id' <<<"$ASSESS")"
PAYLOAD="$(jq -n --arg q1 "$Q1" --arg q2 "$Q2" --arg q3 "$Q3" --arg q4 "$Q4" '{answers:[{questionId:$q1,answer:{option:"B"}},{questionId:$q2,answer:{option:"C"}},{questionId:$q3,answer:{option:"D"}},{questionId:$q4,answer:{option:"C"}}],timeSpentSecs:90}')"
RESULT="$(curl -fsS -X POST "$API_BASE/student/learning/attempts/$ATTEMPT_ID/submit" -H "Authorization: Bearer $STUDENT_TOKEN" -H 'Content-Type: application/json' -d "$PAYLOAD")"
jq -e '.data.status=="GRADED" and .data.percentage==100 and .data.correct_count==4 and (.data.feedback | length==4)' <<<"$RESULT" >/dev/null || fail "Student practice grading is incorrect"

log "Authenticate Platform Admin and create original question"
ADMIN_TOKEN="$(login "$ADMIN_MOBILE" SUPER_ADMIN)"
QCODE="CIQ-$(date +%s)-$RANDOM"
QUESTION_PAYLOAD="$(jq -n --arg code "$QCODE" '{publicCode:$code,prompt:"What habit makes a study plan more useful?",questionType:"MCQ_SINGLE",difficulty:"EASY",explanation:"A realistic plan that is reviewed and adjusted is more useful than an impossible schedule.",correctAnswer:{option:"B"},marks:1,classMin:6,classMax:10,sourceCode:"VIDYASETU_ORIGINAL",licence:"VIDYASETU_ORIGINAL",visibility:"REGISTERED",reviewStatus:"PUBLISHED",boardCodes:["COMMON"],options:[{key:"A",text:"Never changing it"},{key:"B",text:"Reviewing and adjusting it regularly"},{key:"C",text:"Adding every possible task"},{key:"D",text:"Skipping breaks"}]}')"
CREATED_Q="$(curl -fsS -X POST "$API_BASE/admin/learning/questions" -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' -d "$QUESTION_PAYLOAD")"
NEW_QID="$(jq -er '.data.id' <<<"$CREATED_Q")"

log "Create assessment from question bank"
ASLUG="ci-practice-$(date +%s)-$RANDOM"
ASSESS_PAYLOAD="$(jq -n --arg slug "$ASLUG" --arg qid "$NEW_QID" '{publicSlug:$slug,title:"CI Study Skills Practice",summary:"Disposable Phase 2 assessment",assessmentType:"PRACTICE",visibility:"PUBLIC",reviewStatus:"PUBLISHED",classMin:6,classMax:10,timeLimitMins:5,passingPct:40,boardCodes:["COMMON"],questionIds:[$qid]}')"
curl -fsS -X POST "$API_BASE/admin/learning/assessments" -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' -d "$ASSESS_PAYLOAD" | jq -e '.success==true and .data.id != null' >/dev/null || fail "Admin assessment creation failed"
curl -fsS "$API_BASE/public/learning/assessments/$ASLUG" | jq -e '.data.questions | length==1' >/dev/null || fail "New published assessment not publicly visible"

log "Governed NROER intake rejects invalid domain"
BAD_CODE="$(curl -sS -o /tmp/bad-intake.json -w '%{http_code}' -X POST "$API_BASE/admin/learning/intake" -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' -d '{"sourceCode":"NROER","title":"Bad source","sourceUrl":"https://example.com/resource","licenceCandidate":"CC_BY_SA","attributionText":"Test"}')"
[[ "$BAD_CODE" == "400" ]] || fail "Invalid NROER domain must be rejected"

log "Governed NROER intake approval requires attribution"
INTAKE="$(curl -fsS -X POST "$API_BASE/admin/learning/intake" -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' -d '{"sourceCode":"NROER","title":"CI NROER candidate","sourceUrl":"https://nroer.gov.in/ci-test-'"$RANDOM"'","licenceCandidate":"CC_BY_SA","classHint":"8","boardHint":"COMMON","subjectHint":"Science"}')"
INTAKE_ID="$(jq -er '.data.id' <<<"$INTAKE")"
APPROVE_CODE="$(curl -sS -o /tmp/intake-approve.json -w '%{http_code}' -X PATCH "$API_BASE/admin/learning/intake/$INTAKE_ID/status" -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' -d '{"status":"APPROVED"}')"
[[ "$APPROVE_CODE" == "400" ]] || fail "NROER approval without attribution must fail"

printf '\nLearning Platform Phase 2 E2E smoke passed.\n'
