#!/usr/bin/env bash
set -Eeuo pipefail

API_BASE="${API_BASE:-http://127.0.0.1:5000/api/v1}"
ADMIN_MOBILE="${ADMIN_MOBILE:-9000000000}"
STUDENT_MOBILE="${STUDENT_MOBILE:-9300000001}"
STAMP="$(date +%s)-$RANDOM"

fail(){ printf 'FAILED: %s\n' "$*" >&2; exit 1; }
log(){ printf '\n==> %s\n' "$*"; }

login(){
  local mobile="$1" role="$2" send otp response
  send="$(curl -fsS -X POST "$API_BASE/auth/send-otp" -H 'Content-Type: application/json' -d "{\"mobile\":\"$mobile\",\"role\":\"$role\"}")"
  otp="$(jq -er '.data.otp' <<<"$send")"
  response="$(curl -fsS -X POST "$API_BASE/auth/verify-otp" -H 'Content-Type: application/json' -d "{\"mobile\":\"$mobile\",\"otp\":\"$otp\",\"role\":\"$role\"}")"
  jq -er '.data.accessToken' <<<"$response"
}

advance_status(){
  local path="$1" status="$2" token="$3"
  curl -fsS -X PATCH "$API_BASE/$path" -H "Authorization: Bearer $token" -H 'Content-Type: application/json' -d "{\"status\":\"$status\"}"
}

set_gate(){
  local type="$1" id="$2" gate="$3" token="$4"
  curl -fsS -X PUT "$API_BASE/admin/learning/quality/$type/$id/$gate" \
    -H "Authorization: Bearer $token" -H 'Content-Type: application/json' \
    -d "{\"status\":\"PASS\",\"note\":\"CI verified $gate\"}" >/dev/null
}

pass_resource_gates(){
  local id="$1" token="$2"
  for gate in ACADEMIC_ACCURACY AGE_APPROPRIATENESS ENGLISH_QUALITY HINDI_QUALITY ACCESSIBILITY SAFETY COPYRIGHT_LICENSING TECHNICAL_READINESS; do
    set_gate RESOURCE "$id" "$gate" "$token"
  done
}

pass_question_gates(){
  local id="$1" token="$2"
  for gate in ACADEMIC_ACCURACY AGE_APPROPRIATENESS ENGLISH_QUALITY HINDI_QUALITY COPYRIGHT_LICENSING; do
    set_gate QUESTION "$id" "$gate" "$token"
  done
}

pass_assessment_gates(){
  local id="$1" token="$2"
  for gate in ACADEMIC_ACCURACY AGE_APPROPRIATENESS ENGLISH_QUALITY HINDI_QUALITY LEARNING_OUTCOME_ALIGNMENT PRACTICE_QUALITY ACCESSIBILITY TECHNICAL_READINESS; do
    set_gate ASSESSMENT "$id" "$gate" "$token"
  done
}

log "Authenticate Platform Admin and resolve canonical Class 8 concept"
ADMIN_TOKEN="$(login "$ADMIN_MOBILE" SUPER_ADMIN)"
CONCEPTS="$(curl -fsS "$API_BASE/admin/learning/concepts?class=8" -H "Authorization: Bearer $ADMIN_TOKEN")"
CONCEPT_ID="$(jq -er '.data[0].id' <<<"$CONCEPTS")"
CONCEPT_CODE="$(jq -er '.data[0].code' <<<"$CONCEPTS")"
[[ -n "$CONCEPT_ID" && -n "$CONCEPT_CODE" ]] || fail "Canonical Class 8 concept registry missing"

log "Quality coverage endpoint is operational"
COVERAGE="$(curl -fsS "$API_BASE/admin/learning/coverage?class=8" -H "Authorization: Bearer $ADMIN_TOKEN")"
jq -e '.success == true and .data.totalConcepts > 0 and (.data.concepts | length > 0)' <<<"$COVERAGE" >/dev/null || fail "Coverage dashboard API incomplete"

log "Legacy Admin content write surface is retired"
LEGACY_POST="$(curl -sS -o /tmp/legacy-content-post.json -w '%{http_code}' -X POST "$API_BASE/content/items" -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' -d '{}')"
[[ "$LEGACY_POST" == "404" || "$LEGACY_POST" == "405" ]] || fail "Legacy POST /content/items must not remain writable"
LEGACY_UPLOAD="$(curl -sS -o /tmp/legacy-upload.json -w '%{http_code}' "$API_BASE/content/upload-url?fileName=x.pdf&contentType=application/pdf&chapterId=$CONCEPT_ID&type=PDF" -H "Authorization: Bearer $ADMIN_TOKEN")"
[[ "$LEGACY_UPLOAD" == "404" || "$LEGACY_UPLOAD" == "405" ]] || fail "Legacy content upload-url must be retired"

log "Create bilingual concept-mapped VidyaSetu Original article as DRAFT"
RESOURCE_TITLE="CI Concept Learning $STAMP"
RESOURCE_PAYLOAD="$(jq -n --arg title "$RESOURCE_TITLE" --arg cid "$CONCEPT_ID" '{
  title:$title,titleHi:"सीआई अवधारणा शिक्षण",summary:"Governed bilingual concept lesson for CI.",summaryHi:"सीआई के लिए नियंत्रित द्विभाषी अवधारणा पाठ।",
  bodyMarkdown:"## See\nObserve a familiar situation.\n\n## Understand\nExplain the concept accurately with an example.",
  bodyMarkdownHi:"## देखें\nएक परिचित स्थिति का अवलोकन करें।\n\n## समझें\nउदाहरण के साथ अवधारणा को सही ढंग से समझें।",
  resourceType:"ARTICLE",category:"ACADEMIC",visibility:"PUBLIC",reviewStatus:"DRAFT",language:"en",classMin:8,classMax:8,
  sourceCode:"VIDYASETU_ORIGINAL",licence:"VIDYASETU_ORIGINAL",isOfflineReady:true,isFeaturedPublic:false,boardCodes:["COMMON"],
  conceptMappings:[{conceptId:$cid,journeyStage:"UNDERSTAND",isPrimary:true,sortOrder:1}]
}')"
CREATED_RESOURCE="$(curl -fsS -X POST "$API_BASE/admin/learning/resources" -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' -d "$RESOURCE_PAYLOAD")"
RESOURCE_ID="$(jq -er '.data.id' <<<"$CREATED_RESOURCE")"

log "DRAFT resource is never visible in public catalogue"
ENCODED_TITLE="$(jq -rn --arg v "$RESOURCE_TITLE" '$v|@uri')"
PUBLIC_DRAFT="$(curl -fsS "$API_BASE/public/learning/resources?q=$ENCODED_TITLE&limit=20")"
jq -e --arg id "$RESOURCE_ID" '.data | all(.id != $id)' <<<"$PUBLIC_DRAFT" >/dev/null || fail "DRAFT content leaked publicly"

log "Review path cannot be skipped and approval is quality-gated"
BYPASS="$(curl -sS -o /tmp/resource-bypass.json -w '%{http_code}' -X PATCH "$API_BASE/admin/learning/resources/$RESOURCE_ID/status" -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' -d '{"status":"PUBLISHED"}')"
[[ "$BYPASS" == "400" ]] || fail "DRAFT -> PUBLISHED must be rejected"
advance_status "admin/learning/resources/$RESOURCE_ID/status" SUBMITTED "$ADMIN_TOKEN" | jq -e '.data.review_status=="SUBMITTED"' >/dev/null
advance_status "admin/learning/resources/$RESOURCE_ID/status" ACADEMIC_REVIEW "$ADMIN_TOKEN" | jq -e '.data.review_status=="ACADEMIC_REVIEW"' >/dev/null
PRE_GATE_APPROVE="$(curl -sS -o /tmp/resource-pre-gate.json -w '%{http_code}' -X PATCH "$API_BASE/admin/learning/resources/$RESOURCE_ID/status" -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' -d '{"status":"APPROVED"}')"
[[ "$PRE_GATE_APPROVE" == "400" ]] || fail "Resource approval must fail while human quality gates are pending"
READINESS="$(curl -fsS "$API_BASE/admin/learning/readiness/RESOURCE/$RESOURCE_ID" -H "Authorization: Bearer $ADMIN_TOKEN")"
jq -e '.data.readyForApproval == false and (.data.blockers | length > 0)' <<<"$READINESS" >/dev/null || fail "Resource readiness blockers not reported"

log "Pass auditable resource gates, approve and publish"
pass_resource_gates "$RESOURCE_ID" "$ADMIN_TOKEN"
advance_status "admin/learning/resources/$RESOURCE_ID/status" APPROVED "$ADMIN_TOKEN" | jq -e '.data.review_status=="APPROVED"' >/dev/null || fail "Resource approval failed after quality gates"
advance_status "admin/learning/resources/$RESOURCE_ID/status" PUBLISHED "$ADMIN_TOKEN" | jq -e '.data.review_status=="PUBLISHED" and .data.published_at != null' >/dev/null || fail "Resource publication failed"

log "Advanced digital Library filters find the governed resource"
FILTERED="$(curl -fsS "$API_BASE/public/learning/resources?concept=$(jq -rn --arg v "$CONCEPT_CODE" '$v|@uri')&stage=UNDERSTAND&lang=hi&q=$ENCODED_TITLE&limit=20")"
jq -e --arg id "$RESOURCE_ID" '.data | any(.id == $id)' <<<"$FILTERED" >/dev/null || fail "Published resource missing from concept/stage/language/search catalogue"
FILTER_OPTIONS="$(curl -fsS "$API_BASE/public/learning/filter-options")"
jq -e --arg code "$CONCEPT_CODE" '.success == true and (.data.concepts | any(.code == $code)) and (.data.journeyStages | index("UNDERSTAND") != null)' <<<"$FILTER_OPTIONS" >/dev/null || fail "Public filter discovery missing canonical concept or learning stage"

log "Create ten governed bilingual concept questions for a real PRACTICE assessment"
QUESTION_IDS='[]'
for i in $(seq 1 10); do
  QCODE="CIQ-$STAMP-$i"
  QPAYLOAD="$(jq -n --arg code "$QCODE" --arg cid "$CONCEPT_ID" --arg n "$i" '{
    publicCode:$code,prompt:("CI concept application question " + $n),promptHi:("सीआई अवधारणा अनुप्रयोग प्रश्न " + $n),
    questionType:"MCQ_SINGLE",difficulty:"MEDIUM",cognitiveSkill:"APPLY",skillCode:"CI-APPLY",learningOutcomeCode:"CI-LO-1",
    explanation:"The correct option follows the concept evidence.",explanationHi:"सही विकल्प अवधारणा के प्रमाण के अनुसार है।",correctAnswer:{option:"B"},
    marks:1,negativeMarks:0,classMin:8,classMax:8,sourceCode:"VIDYASETU_ORIGINAL",licence:"VIDYASETU_ORIGINAL",visibility:"REGISTERED",reviewStatus:"DRAFT",
    boardCodes:["COMMON"],conceptIds:[$cid],options:[
      {key:"A",text:"Distractor A",textHi:"विकल्प ए"},{key:"B",text:"Correct concept application",textHi:"सही अवधारणा अनुप्रयोग"},
      {key:"C",text:"Distractor C",textHi:"विकल्प सी"},{key:"D",text:"Distractor D",textHi:"विकल्प डी"}
    ]
  }')"
  CREATED_Q="$(curl -fsS -X POST "$API_BASE/admin/learning/questions" -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' -d "$QPAYLOAD")"
  QID="$(jq -er '.data.id' <<<"$CREATED_Q")"
  if [[ "$i" == "1" ]]; then
    QBYPASS="$(curl -sS -o /tmp/question-bypass.json -w '%{http_code}' -X PATCH "$API_BASE/admin/learning/questions/$QID/status" -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' -d '{"status":"PUBLISHED"}')"
    [[ "$QBYPASS" == "400" ]] || fail "Question DRAFT -> PUBLISHED must be rejected"
  fi
  advance_status "admin/learning/questions/$QID/status" SUBMITTED "$ADMIN_TOKEN" >/dev/null
  advance_status "admin/learning/questions/$QID/status" ACADEMIC_REVIEW "$ADMIN_TOKEN" >/dev/null
  if [[ "$i" == "1" ]]; then
    QPRE="$(curl -sS -o /tmp/question-pre-gate.json -w '%{http_code}' -X PATCH "$API_BASE/admin/learning/questions/$QID/status" -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' -d '{"status":"APPROVED"}')"
    [[ "$QPRE" == "400" ]] || fail "Question approval must fail with pending quality gates"
  fi
  pass_question_gates "$QID" "$ADMIN_TOKEN"
  advance_status "admin/learning/questions/$QID/status" APPROVED "$ADMIN_TOKEN" >/dev/null
  advance_status "admin/learning/questions/$QID/status" PUBLISHED "$ADMIN_TOKEN" >/dev/null
  QUESTION_IDS="$(jq -c --arg id "$QID" '. + [$id]' <<<"$QUESTION_IDS")"
done
[[ "$(jq 'length' <<<"$QUESTION_IDS")" -eq 10 ]] || fail "Expected ten governed questions"

log "Create, quality-review and publish a concept-mapped 10-question PRACTICE assessment"
ASSESS_SLUG="ci-concept-practice-$STAMP"
ASSESS_PAYLOAD="$(jq -n --arg slug "$ASSESS_SLUG" --arg cid "$CONCEPT_ID" --argjson qids "$QUESTION_IDS" '{
  publicSlug:$slug,title:"CI Concept Practice",titleHi:"सीआई अवधारणा अभ्यास",summary:"Ten-question governed concept practice.",assessmentType:"PRACTICE",
  visibility:"PUBLIC",reviewStatus:"DRAFT",classMin:8,classMax:8,timeLimitMins:10,passingPct:40,shuffleQuestions:true,isFeaturedPublic:false,
  boardCodes:["COMMON"],conceptIds:[$cid],questionIds:$qids
}')"
CREATED_ASSESS="$(curl -fsS -X POST "$API_BASE/admin/learning/assessments" -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' -d "$ASSESS_PAYLOAD")"
ASSESS_ID="$(jq -er '.data.id' <<<"$CREATED_ASSESS")"
ABYPASS="$(curl -sS -o /tmp/assessment-bypass.json -w '%{http_code}' -X PATCH "$API_BASE/admin/learning/assessments/$ASSESS_ID/status" -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' -d '{"status":"PUBLISHED"}')"
[[ "$ABYPASS" == "400" ]] || fail "Assessment DRAFT -> PUBLISHED must be rejected"
advance_status "admin/learning/assessments/$ASSESS_ID/status" SUBMITTED "$ADMIN_TOKEN" >/dev/null
advance_status "admin/learning/assessments/$ASSESS_ID/status" ACADEMIC_REVIEW "$ADMIN_TOKEN" >/dev/null
APRE="$(curl -sS -o /tmp/assessment-pre-gate.json -w '%{http_code}' -X PATCH "$API_BASE/admin/learning/assessments/$ASSESS_ID/status" -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' -d '{"status":"APPROVED"}')"
[[ "$APRE" == "400" ]] || fail "Assessment approval must fail with pending quality gates"
pass_assessment_gates "$ASSESS_ID" "$ADMIN_TOKEN"
advance_status "admin/learning/assessments/$ASSESS_ID/status" APPROVED "$ADMIN_TOKEN" | jq -e '.data.review_status=="APPROVED"' >/dev/null || fail "Assessment approval failed"
advance_status "admin/learning/assessments/$ASSESS_ID/status" PUBLISHED "$ADMIN_TOKEN" | jq -e '.data.review_status=="PUBLISHED"' >/dev/null || fail "Assessment publication failed"
PUBLIC_ASSESS="$(curl -fsS "$API_BASE/public/learning/assessments/$ASSESS_SLUG")"
jq -e '.data.questions | length == 10' <<<"$PUBLIC_ASSESS" >/dev/null || fail "Published assessment must expose ten student-safe questions"
jq -e '.data.questions | all(has("correct_answer")|not)' <<<"$PUBLIC_ASSESS" >/dev/null || fail "Public assessment must never expose answer keys"

log "Student personalised Learning Home remains healthy"
STUDENT_TOKEN="$(login "$STUDENT_MOBILE" STUDENT)"
HOME="$(curl -fsS "$API_BASE/student/learning/home" -H "Authorization: Bearer $STUDENT_TOKEN")"
jq -e '.success == true and .data.learner.className == 8' <<<"$HOME" >/dev/null || fail "Student Learning Home regression"

log "NROER spoofed source remains rejected"
SPOOF="$(curl -sS -o /tmp/nroer-spoof.json -w '%{http_code}' -X POST "$API_BASE/admin/learning/intake" -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' -d '{"sourceCode":"NROER","title":"Spoofed source","sourceUrl":"https://example.com/?source=https://nroer.gov.in/resource","licenceCandidate":"CC_BY_SA","attributionText":"Fake"}')"
[[ "$SPOOF" == "400" ]] || fail "Spoofed NROER hostname must be rejected"

printf '\nLearning & Content Platform 2.0 governed E2E smoke passed.\n'
