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
MASTERY_SLUG='ci-concept-runtime-mastery'

log "Reset disposable adaptive-learning evidence"
CONCEPT_ID="$(psqlq "SELECT id FROM learning_concepts WHERE code='$CONCEPT_CODE' AND is_active=TRUE;")"
STUDENT_ID="$(psqlq "SELECT s.id FROM students s JOIN users u ON u.id=s.user_id WHERE u.mobile='$STUDENT_MOBILE' AND s.status='ACTIVE' LIMIT 1;")"
PRACTICE_ID="$(psqlq "SELECT id FROM learning_assessments WHERE public_slug='$PRACTICE_SLUG' AND review_status='PUBLISHED' LIMIT 1;")"
MASTERY_ID="$(psqlq "SELECT id FROM learning_assessments WHERE public_slug='$MASTERY_SLUG' AND review_status='PUBLISHED' LIMIT 1;")"
RESOURCE_ID="$(psqlq "SELECT lrc.resource_id FROM learning_resource_concepts lrc JOIN learning_resources lr ON lr.id=lrc.resource_id WHERE lrc.concept_id='$CONCEPT_ID' AND lr.review_status='PUBLISHED' ORDER BY lr.published_at DESC NULLS LAST LIMIT 1;")"

[[ -n "$CONCEPT_ID" ]] || fail "Canonical concept fixture missing"
[[ -n "$STUDENT_ID" ]] || fail "Student fixture missing"
[[ -n "$PRACTICE_ID" && -n "$MASTERY_ID" ]] || fail "Mastery runtime E2E fixture assessments missing"
[[ -n "$RESOURCE_ID" ]] || fail "Mapped resource fixture missing"

psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 \
  -v student_id="$STUDENT_ID" -v concept_id="$CONCEPT_ID" -v resource_id="$RESOURCE_ID" \
  -v practice_id="$PRACTICE_ID" -v mastery_id="$MASTERY_ID" <<'SQL'
DELETE FROM student_learning_answers
WHERE attempt_id IN (
  SELECT id FROM student_learning_attempts
  WHERE student_id=:'student_id'::uuid
    AND assessment_id IN (:'practice_id'::uuid,:'mastery_id'::uuid)
);
DELETE FROM student_learning_attempts
WHERE student_id=:'student_id'::uuid
  AND assessment_id IN (:'practice_id'::uuid,:'mastery_id'::uuid);
DELETE FROM student_concept_progress
WHERE student_id=:'student_id'::uuid AND concept_id=:'concept_id'::uuid;
DELETE FROM student_learning_resource_progress
WHERE student_id=:'student_id'::uuid AND resource_id=:'resource_id'::uuid;
SQL

STUDENT_TOKEN="$(login "$STUDENT_MOBILE" STUDENT)"

plan(){ curl -fsS "$API_BASE/student/learning/adaptive-plan" -H "Authorization: Bearer $STUDENT_TOKEN"; }
home(){ curl -fsS "$API_BASE/student/learning/home" -H "Authorization: Bearer $STUDENT_TOKEN"; }

log "Partial learning produces CONTINUE_RESOURCE"
curl -fsS -X PATCH "$API_BASE/student/learning/resources/$RESOURCE_ID/progress" \
  -H "Authorization: Bearer $STUDENT_TOKEN" -H 'Content-Type: application/json' \
  -d '{"progressPct":40}' | jq -e '.data.progress_pct==40' >/dev/null || fail "Could not create partial learning evidence"
PLAN_LEARNING="$(plan)"
jq -e --arg code "$CONCEPT_CODE" --arg resource "$RESOURCE_ID" '
  .data.summary.learning >= 1 and
  any(.data.actions[]; .conceptCode==$code and .actionType=="CONTINUE_RESOURCE" and .urgency=="FOCUS" and .target.kind=="RESOURCE" and .target.id==$resource)
' <<<"$PLAN_LEARNING" >/dev/null || fail "Adaptive plan did not continue the partially learned concept"

log "Failed practice produces high-priority remediation"
PSTART="$(curl -fsS -X POST "$API_BASE/student/learning/assessments/$PRACTICE_ID/start" -H "Authorization: Bearer $STUDENT_TOKEN")"
PATTEMPT="$(jq -er '.data.id' <<<"$PSTART")"
FAIL_PAYLOAD="$(psqlq "SELECT jsonb_build_object('answers',jsonb_agg(jsonb_build_object('questionId',lq.id,'answer',jsonb_build_object('option',CASE WHEN lq.correct_answer->>'option'='A' THEN 'B' ELSE 'A' END)) ORDER BY laq.sort_order),'timeSpentSecs',45)::text FROM learning_assessment_questions laq JOIN learning_questions lq ON lq.id=laq.question_id WHERE laq.assessment_id='$PRACTICE_ID';")"
PFAIL="$(curl -fsS -X POST "$API_BASE/student/learning/attempts/$PATTEMPT/submit" -H "Authorization: Bearer $STUDENT_TOKEN" -H 'Content-Type: application/json' -d "$FAIL_PAYLOAD")"
jq -e '.data.status=="GRADED" and .data.percentage<60' <<<"$PFAIL" >/dev/null || fail "Practice fixture did not fail as expected"
PLAN_REVIEW="$(plan)"
jq -e --arg code "$CONCEPT_CODE" '
  .data.summary.needsReview >= 1 and
  any(.data.actions[]; .conceptCode==$code and .actionType=="REVIEW_RESOURCE" and .urgency=="HIGH" and .state=="NEEDS_REVIEW")
' <<<"$PLAN_REVIEW" >/dev/null || fail "Adaptive plan did not prioritise remediation after failed practice"

log "Passed practice advances recommendation to MASTERY_CHECK"
PSTART2="$(curl -fsS -X POST "$API_BASE/student/learning/assessments/$PRACTICE_ID/start" -H "Authorization: Bearer $STUDENT_TOKEN")"
PATTEMPT2="$(jq -er '.data.id' <<<"$PSTART2")"
PASS_PRACTICE_PAYLOAD="$(psqlq "SELECT jsonb_build_object('answers',jsonb_agg(jsonb_build_object('questionId',lq.id,'answer',lq.correct_answer) ORDER BY laq.sort_order),'timeSpentSecs',55)::text FROM learning_assessment_questions laq JOIN learning_questions lq ON lq.id=laq.question_id WHERE laq.assessment_id='$PRACTICE_ID';")"
PPASS="$(curl -fsS -X POST "$API_BASE/student/learning/attempts/$PATTEMPT2/submit" -H "Authorization: Bearer $STUDENT_TOKEN" -H 'Content-Type: application/json' -d "$PASS_PRACTICE_PAYLOAD")"
jq -e '.data.status=="GRADED" and .data.percentage>=60' <<<"$PPASS" >/dev/null || fail "Practice fixture did not pass"
PLAN_PRACTISING="$(plan)"
jq -e --arg code "$CONCEPT_CODE" --arg mastery "$MASTERY_ID" '
  .data.summary.practising >= 1 and
  any(.data.actions[]; .conceptCode==$code and .actionType=="MASTERY_CHECK" and .state=="PRACTISING" and .target.id==$mastery and .target.evidenceRole=="MASTERY")
' <<<"$PLAN_PRACTISING" >/dev/null || fail "Adaptive plan did not advance passed practice to mastery check"

log "Passed mastery removes remediation and advances learner"
MSTART="$(curl -fsS -X POST "$API_BASE/student/learning/assessments/$MASTERY_ID/start" -H "Authorization: Bearer $STUDENT_TOKEN")"
MATTEMPT="$(jq -er '.data.id' <<<"$MSTART")"
PASS_MASTERY_PAYLOAD="$(psqlq "SELECT jsonb_build_object('answers',jsonb_agg(jsonb_build_object('questionId',lq.id,'answer',lq.correct_answer) ORDER BY laq.sort_order),'timeSpentSecs',60)::text FROM learning_assessment_questions laq JOIN learning_questions lq ON lq.id=laq.question_id WHERE laq.assessment_id='$MASTERY_ID';")"
MPASS="$(curl -fsS -X POST "$API_BASE/student/learning/attempts/$MATTEMPT/submit" -H "Authorization: Bearer $STUDENT_TOKEN" -H 'Content-Type: application/json' -d "$PASS_MASTERY_PAYLOAD")"
jq -e '.data.status=="GRADED" and .data.percentage>=70' <<<"$MPASS" >/dev/null || fail "Mastery fixture did not pass"
PLAN_MASTERED="$(plan)"
jq -e --arg code "$CONCEPT_CODE" '
  .data.summary.mastered >= 1 and
  ([.data.actions[] | select(.conceptCode==$code)] | length)==0
' <<<"$PLAN_MASTERED" >/dev/null || fail "Mastered concept remained in adaptive remediation actions"

HOME="$(home)"
jq -e --arg code "$CONCEPT_CODE" '
  (.data.adaptivePlan.summary.mastered >= 1) and
  any(.data.conceptMastery[]; .code==$code and .state=="MASTERED")
' <<<"$HOME" >/dev/null || fail "Learning Home did not embed adaptive plan and mastered concept state"

printf '\nAdaptive learning & remediation E2E smoke passed.\n'
