#!/usr/bin/env bash
set -Eeuo pipefail

API_BASE="${API_BASE:-http://127.0.0.1:5000/api/v1}"
STUDENT_MOBILE="${STUDENT_MOBILE:-9300000001}"
DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-vidyasetu_db}"
DB_USER="${DB_USER:-postgres}"
export PGPASSWORD="${DB_PASSWORD:-postgres}"

fail(){ printf 'FAILED: %s\n' "$*" >&2; exit 1; }
log(){ printf '\n==> %s\n' "$*"; }
psqlq(){ psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -Atc "$1"; }

login(){
  local mobile="$1" role="$2"
  local send otp response
  send="$(curl -fsS -X POST "$API_BASE/auth/send-otp" -H 'Content-Type: application/json' -d "{\"mobile\":\"$mobile\",\"role\":\"$role\"}")"
  otp="$(jq -er '.data.otp' <<<"$send")"
  response="$(curl -fsS -X POST "$API_BASE/auth/verify-otp" -H 'Content-Type: application/json' -d "{\"mobile\":\"$mobile\",\"otp\":\"$otp\",\"role\":\"$role\"}")"
  jq -er '.data.accessToken' <<<"$response"
}

CONCEPT_CODE='C8-MATH-13-C04'
PRACTICE_SLUG='ci-concept-runtime-practice'
PRIVATE_MARKER='PRIVATE_AI_TEXT_MUST_NOT_BE_LOGGED_92831'

log "Prepare disposable grounded-tutor evidence"
CONCEPT_ID="$(psqlq "SELECT id FROM learning_concepts WHERE code='$CONCEPT_CODE' AND is_active=TRUE;")"
STUDENT_ID="$(psqlq "SELECT s.id FROM students s JOIN users u ON u.id=s.user_id WHERE u.mobile='$STUDENT_MOBILE' AND s.status='ACTIVE' LIMIT 1;")"
PRACTICE_ID="$(psqlq "SELECT id FROM learning_assessments WHERE public_slug='$PRACTICE_SLUG' AND review_status='PUBLISHED' LIMIT 1;")"
RESOURCE_ID="$(psqlq "SELECT lrc.resource_id FROM learning_resource_concepts lrc JOIN learning_resources lr ON lr.id=lrc.resource_id WHERE lrc.concept_id='$CONCEPT_ID' AND lr.review_status='PUBLISHED' ORDER BY lr.published_at DESC NULLS LAST LIMIT 1;")"

[[ -n "$CONCEPT_ID" ]] || fail "Canonical concept fixture missing"
[[ -n "$STUDENT_ID" ]] || fail "Student fixture missing"
[[ -n "$PRACTICE_ID" ]] || fail "Practice fixture missing"
[[ -n "$RESOURCE_ID" ]] || fail "Published mapped resource fixture missing"

psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 \
  -v student_id="$STUDENT_ID" -v concept_id="$CONCEPT_ID" -v resource_id="$RESOURCE_ID" <<'SQL'
DELETE FROM ai_tutor_events WHERE student_id=:'student_id'::uuid;
DELETE FROM doubts WHERE student_id=:'student_id'::uuid AND origin='AI_TUTOR';
DELETE FROM student_learning_answers
WHERE attempt_id IN (
  SELECT sla.id
  FROM student_learning_attempts sla
  JOIN learning_assessment_concepts lac ON lac.assessment_id=sla.assessment_id
  WHERE sla.student_id=:'student_id'::uuid
    AND lac.concept_id=:'concept_id'::uuid
);
DELETE FROM student_learning_attempts
WHERE student_id=:'student_id'::uuid
  AND assessment_id IN (
    SELECT assessment_id
    FROM learning_assessment_concepts
    WHERE concept_id=:'concept_id'::uuid
  );
DELETE FROM student_concept_progress
WHERE student_id=:'student_id'::uuid AND concept_id=:'concept_id'::uuid;
DELETE FROM student_learning_resource_progress
WHERE student_id=:'student_id'::uuid AND resource_id=:'resource_id'::uuid;
SQL

STUDENT_TOKEN="$(login "$STUDENT_MOBILE" STUDENT)"

log "Create NEEDS_REVIEW learner evidence"
curl -fsS -X PATCH "$API_BASE/student/learning/resources/$RESOURCE_ID/progress" \
  -H "Authorization: Bearer $STUDENT_TOKEN" -H 'Content-Type: application/json' \
  -d '{"progressPct":35}' | jq -e '.data.progress_pct==35' >/dev/null || fail "Could not create partial resource progress"

PSTART="$(curl -fsS -X POST "$API_BASE/student/learning/assessments/$PRACTICE_ID/start" -H "Authorization: Bearer $STUDENT_TOKEN")"
PATTEMPT="$(jq -er '.data.id' <<<"$PSTART")"
FAIL_PAYLOAD="$(psqlq "SELECT jsonb_build_object('answers',jsonb_agg(jsonb_build_object('questionId',lq.id,'answer',jsonb_build_object('option',CASE WHEN lq.correct_answer->>'option'='A' THEN 'B' ELSE 'A' END)) ORDER BY laq.sort_order),'timeSpentSecs',42)::text FROM learning_assessment_questions laq JOIN learning_questions lq ON lq.id=laq.question_id WHERE laq.assessment_id='$PRACTICE_ID';")"
curl -fsS -X POST "$API_BASE/student/learning/attempts/$PATTEMPT/submit" \
  -H "Authorization: Bearer $STUDENT_TOKEN" -H 'Content-Type: application/json' \
  -d "$FAIL_PAYLOAD" | jq -e '.data.status=="GRADED" and .data.percentage<60' >/dev/null || fail "Practice fixture did not fail"

LEARNER_STATE="$(psqlq "SELECT state FROM student_concept_progress WHERE student_id='$STUDENT_ID' AND concept_id='$CONCEPT_ID' LIMIT 1;")"
[[ "$LEARNER_STATE" == "NEEDS_REVIEW" ]] || fail "Expected isolated concept state NEEDS_REVIEW, got: ${LEARNER_STATE:-missing}"

log "Grounded Tutor uses published VidyaSetu source and mastery context"
QUESTION="Explain this concept carefully $PRIVATE_MARKER"
CHAT="$(curl -fsS -X POST "$API_BASE/ai/chat" \
  -H "Authorization: Bearer $STUDENT_TOKEN" -H 'Content-Type: application/json' \
  -d "$(jq -nc --arg message "$QUESTION" --arg concept "$CONCEPT_CODE" '{message:$message,history:[],conceptCode:$concept}')")"
jq -e --arg code "$CONCEPT_CODE" '
  .data.grounded==true and
  .data.groundingStatus=="GROUNDED" and
  .data.concept.code==$code and
  .data.learnerState=="NEEDS_REVIEW" and
  (.data.sources|length)>0 and
  .data.sources[0].title!=null and
  .data.nextAction.actionType=="REVIEW_RESOURCE" and
  .data.escalationRecommended==true
' <<<"$CHAT" >/dev/null || fail "Grounded Tutor did not return reviewed source + remediation context"
AI_RESPONSE="$(jq -er '.data.response' <<<"$CHAT")"

log "Unmatched question is never falsely labelled as grounded"
GENERAL="$(curl -fsS -X POST "$API_BASE/ai/chat" \
  -H "Authorization: Bearer $STUDENT_TOKEN" -H 'Content-Type: application/json' \
  -d '{"message":"Explain zorbital quux flux with no matching school concept","history":[]}')"
jq -e '.data.grounded==false and .data.groundingStatus=="GENERAL" and .data.concept==null and (.data.sources|length)==0' <<<"$GENERAL" >/dev/null \
  || fail "Unmatched Tutor turn was incorrectly labelled grounded"

log "Tutor history is metadata-only"
HISTORY="$(curl -fsS "$API_BASE/ai/history" -H "Authorization: Bearer $STUDENT_TOKEN")"
jq -e '
  (.data|length)>=2 and
  any(.data[]; .eventType=="CHAT" and .grounded==true and .conceptCode!=null) and
  all(.data[]; (has("message")|not) and (has("question")|not) and (has("response")|not) and (has("answer")|not))
' <<<"$HISTORY" >/dev/null || fail "Tutor history exposed raw conversation text or omitted metadata"

if grep -Fq "$PRIVATE_MARKER" /tmp/vidyasetu-learning-api.log 2>/dev/null; then
  fail "Raw student Tutor question leaked into application logs"
fi

log "Explicit learner escalation creates a concept-linked Doubt Forum item"
ESCALATION="$(curl -fsS -X POST "$API_BASE/ai/escalate" \
  -H "Authorization: Bearer $STUDENT_TOKEN" -H 'Content-Type: application/json' \
  -d "$(jq -nc --arg question "$QUESTION" --arg answer "$AI_RESPONSE" --arg concept "$CONCEPT_CODE" '{question:$question,aiResponse:$answer,conceptCode:$concept}')")"
DOUBT_ID="$(jq -er '.data.id' <<<"$ESCALATION")"
jq -e --arg code "$CONCEPT_CODE" '.data.origin=="AI_TUTOR" and .data.status=="OPEN" and .data.concept.code==$code' <<<"$ESCALATION" >/dev/null \
  || fail "Tutor escalation did not create concept-linked open doubt"

DB_DOUBT="$(psqlq "SELECT origin||'|'||COALESCE(lc.code,'')||'|'||COALESCE(d.ai_context_snapshot->>'grounded','')||'|'||COALESCE(d.ai_escalation_reason,'') FROM doubts d LEFT JOIN learning_concepts lc ON lc.id=d.learning_concept_id WHERE d.id='$DOUBT_ID';")"
[[ "$DB_DOUBT" == "AI_TUTOR|$CONCEPT_CODE|true|STILL_CONFUSED_AFTER_AI" ]] || fail "Escalated doubt DB context invariant failed: $DB_DOUBT"

DETAIL="$(curl -fsS "$API_BASE/doubts/$DOUBT_ID" -H "Authorization: Bearer $STUDENT_TOKEN")"
jq -e --arg code "$CONCEPT_CODE" --arg marker "$PRIVATE_MARKER" '
  .data.origin=="AI_TUTOR" and .data.concept_code==$code and
  (.data.body|contains($marker)) and
  .data.ai_context_snapshot.grounded==true and
  (.data.ai_context_snapshot.sources|length)>0
' <<<"$DETAIL" >/dev/null || fail "Doubt detail did not expose approved escalation context"

log "Doubt AI answer reuses the same grounded Tutor engine"
AI_DOUBT="$(curl -fsS -X POST "$API_BASE/doubts/$DOUBT_ID/ai-answer" -H "Authorization: Bearer $STUDENT_TOKEN")"
jq -e --arg code "$CONCEPT_CODE" '
  .data.grounded==true and .data.groundingStatus=="GROUNDED" and
  .data.concept.code==$code and (.data.sources|length)>0 and .data.answerId!=null
' <<<"$AI_DOUBT" >/dev/null || fail "Grounded AI doubt answer failed"

DETAIL_AFTER="$(curl -fsS "$API_BASE/doubts/$DOUBT_ID" -H "Authorization: Bearer $STUDENT_TOKEN")"
jq -e --arg code "$CONCEPT_CODE" '
  any(.data.answers[]; .is_ai_answer==true and .ai_grounded==true and .ai_concept_code==$code and (.ai_sources|length)>0)
' <<<"$DETAIL_AFTER" >/dev/null || fail "Doubt answer did not persist grounding metadata"

EVENTS="$(psqlq "SELECT string_agg(event_type,',' ORDER BY created_at) FROM ai_tutor_events WHERE student_id='$STUDENT_ID';")"
[[ "$EVENTS" == *"CHAT"* && "$EVENTS" == *"ESCALATED"* && "$EVENTS" == *"DOUBT_AI_ANSWER"* ]] \
  || fail "Tutor event history missing expected lifecycle: $EVENTS"

if grep -Fq "$PRIVATE_MARKER" /tmp/vidyasetu-learning-api.log 2>/dev/null; then
  fail "Raw escalated academic question leaked into application logs"
fi

printf '\nGrounded AI Tutor + intelligent doubt resolution E2E smoke passed.\n'
