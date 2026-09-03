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

log "Prepare canonical concept runtime fixture"
CONCEPT_ID="$(psqlq "SELECT id FROM learning_concepts WHERE code='$CONCEPT_CODE' AND is_active=TRUE;")"
[[ -n "$CONCEPT_ID" ]] || fail "Canonical concept $CONCEPT_CODE is not synchronized"
STUDENT_ID="$(psqlq "SELECT s.id FROM students s JOIN users u ON u.id=s.user_id WHERE u.mobile='$STUDENT_MOBILE' AND s.status='ACTIVE' LIMIT 1;")"
[[ -n "$STUDENT_ID" ]] || fail "Student fixture missing"

PUBLIC_RESOURCES="$(curl -fsS "$API_BASE/public/learning/resources?class=8&limit=20")"
RESOURCE_ID="$(jq -er '.data[1].id // .data[0].id' <<<"$PUBLIC_RESOURCES")"
SOURCE_ASSESSMENT_ID="$(psqlq "SELECT id FROM learning_assessments WHERE public_slug='class-8-maths-quick-practice' AND review_status='PUBLISHED' LIMIT 1;")"
[[ -n "$SOURCE_ASSESSMENT_ID" ]] || fail "Starter Class 8 maths practice fixture missing"

psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 \
  -v student_id="$STUDENT_ID" -v concept_id="$CONCEPT_ID" -v resource_id="$RESOURCE_ID" -v source_assessment_id="$SOURCE_ASSESSMENT_ID" \
  -v practice_slug="$PRACTICE_SLUG" -v mastery_slug="$MASTERY_SLUG" <<'SQL'
DELETE FROM student_concept_progress WHERE student_id=:'student_id'::uuid AND concept_id=:'concept_id'::uuid;
DELETE FROM student_learning_resource_progress WHERE student_id=:'student_id'::uuid AND resource_id=:'resource_id'::uuid;

INSERT INTO learning_resource_concepts(resource_id,concept_id,is_primary,sort_order)
VALUES(:'resource_id'::uuid,:'concept_id'::uuid,TRUE,0)
ON CONFLICT (resource_id,concept_id) DO NOTHING;

INSERT INTO learning_question_concepts(question_id,concept_id,is_primary,sort_order)
SELECT laq.question_id,:'concept_id'::uuid,TRUE,0
FROM learning_assessment_questions laq
WHERE laq.assessment_id=:'source_assessment_id'::uuid
ON CONFLICT (question_id,concept_id) DO NOTHING;

DELETE FROM learning_assessments WHERE public_slug IN (:'practice_slug',:'mastery_slug');

WITH source AS (
  SELECT * FROM learning_assessments WHERE id=:'source_assessment_id'::uuid
)
INSERT INTO learning_assessments
  (public_slug,title,title_hi,summary,summary_hi,assessment_type,visibility,review_status,
   class_min,class_max,subject_id,time_limit_mins,passing_pct,max_attempts,shuffle_questions,
   is_featured_public,created_by,reviewed_by,published_at)
SELECT :'practice_slug','CI Concept Runtime Practice','सीआई कॉन्सेप्ट रनटाइम अभ्यास',
       'Disposable formative concept evidence','डिस्पोज़ेबल फॉर्मेटिव कॉन्सेप्ट एविडेंस',
       assessment_type,'REGISTERED','PUBLISHED',8,8,subject_id,5,60,NULL,FALSE,FALSE,
       created_by,reviewed_by,NOW()
FROM source;

WITH source AS (
  SELECT * FROM learning_assessments WHERE id=:'source_assessment_id'::uuid
)
INSERT INTO learning_assessments
  (public_slug,title,title_hi,summary,summary_hi,assessment_type,visibility,review_status,
   class_min,class_max,subject_id,time_limit_mins,passing_pct,max_attempts,shuffle_questions,
   is_featured_public,created_by,reviewed_by,published_at)
SELECT :'mastery_slug','CI Concept Runtime Mastery','सीआई कॉन्सेप्ट रनटाइम महारत',
       'Disposable mastery concept evidence','डिस्पोज़ेबल महारत कॉन्सेप्ट एविडेंस',
       assessment_type,'REGISTERED','PUBLISHED',8,8,subject_id,5,70,3,FALSE,FALSE,
       created_by,reviewed_by,NOW()
FROM source;

INSERT INTO learning_assessment_boards(assessment_id,board_id)
SELECT target.id,lab.board_id
FROM learning_assessments target
CROSS JOIN learning_assessment_boards lab
WHERE target.public_slug IN (:'practice_slug',:'mastery_slug')
  AND lab.assessment_id=:'source_assessment_id'::uuid
ON CONFLICT DO NOTHING;

INSERT INTO learning_assessment_questions(assessment_id,question_id,sort_order,marks_override)
SELECT target.id,laq.question_id,laq.sort_order,laq.marks_override
FROM learning_assessments target
CROSS JOIN learning_assessment_questions laq
WHERE target.public_slug IN (:'practice_slug',:'mastery_slug')
  AND laq.assessment_id=:'source_assessment_id'::uuid
ON CONFLICT DO NOTHING;

INSERT INTO learning_assessment_concepts(assessment_id,concept_id,is_primary,sort_order,evidence_role)
SELECT id,:'concept_id'::uuid,TRUE,0,
       CASE WHEN public_slug=:'mastery_slug' THEN 'MASTERY' ELSE 'PRACTICE' END
FROM learning_assessments
WHERE public_slug IN (:'practice_slug',:'mastery_slug')
ON CONFLICT (assessment_id,concept_id) DO UPDATE SET evidence_role=EXCLUDED.evidence_role;
SQL

PRACTICE_ID="$(psqlq "SELECT id FROM learning_assessments WHERE public_slug='$PRACTICE_SLUG';")"
MASTERY_ID="$(psqlq "SELECT id FROM learning_assessments WHERE public_slug='$MASTERY_SLUG';")"
[[ -n "$PRACTICE_ID" && -n "$MASTERY_ID" ]] || fail "Concept assessments were not created"
[[ "$(psqlq "SELECT evidence_role FROM learning_assessment_concepts WHERE assessment_id='$PRACTICE_ID' AND concept_id='$CONCEPT_ID';")" == "PRACTICE" ]] || fail "Practice evidence role incorrect"
[[ "$(psqlq "SELECT evidence_role FROM learning_assessment_concepts WHERE assessment_id='$MASTERY_ID' AND concept_id='$CONCEPT_ID';")" == "MASTERY" ]] || fail "Mastery evidence role incorrect"

log "Authenticate learner"
STUDENT_TOKEN="$(login "$STUDENT_MOBILE" STUDENT)"

concept_json(){
  curl -fsS "$API_BASE/student/learning/home" -H "Authorization: Bearer $STUDENT_TOKEN" \
    | jq -cer --arg code "$CONCEPT_CODE" '.data.conceptMastery[] | select(.code==$code)'
}

log "Resource activity moves concept to LEARNING"
curl -fsS -X PATCH "$API_BASE/student/learning/resources/$RESOURCE_ID/progress" \
  -H "Authorization: Bearer $STUDENT_TOKEN" -H 'Content-Type: application/json' \
  -d '{"progressPct":50}' | jq -e '.data.progress_pct==50' >/dev/null || fail "Resource progress bridge write failed"
LEARNING="$(concept_json)"
jq -e '.state=="LEARNING" and .resourceCompletionPct==50 and .exposurePct>0' <<<"$LEARNING" >/dev/null || fail "Concept did not enter LEARNING from resource activity"

log "Failed formative practice moves concept to NEEDS_REVIEW"
PSTART="$(curl -fsS -X POST "$API_BASE/student/learning/assessments/$PRACTICE_ID/start" -H "Authorization: Bearer $STUDENT_TOKEN")"
PATTEMPT="$(jq -er '.data.id' <<<"$PSTART")"
PDETAIL="$(curl -fsS "$API_BASE/student/learning/assessments/$PRACTICE_ID" -H "Authorization: Bearer $STUDENT_TOKEN")"
PFAIL_PAYLOAD="$(jq -c '{answers:[.data.questions[]|{questionId:.id,answer:{option:"A"}}],timeSpentSecs:45}' <<<"$PDETAIL")"
PRESULT="$(curl -fsS -X POST "$API_BASE/student/learning/attempts/$PATTEMPT/submit" -H "Authorization: Bearer $STUDENT_TOKEN" -H 'Content-Type: application/json' -d "$PFAIL_PAYLOAD")"
jq -e '.data.status=="GRADED" and .data.percentage<60' <<<"$PRESULT" >/dev/null || fail "Practice fixture did not produce a below-pass score"
REVIEW="$(concept_json)"
jq -e '.state=="NEEDS_REVIEW" and .needsReview==true and .practiceAttempts==1 and .practiceBestPct<60' <<<"$REVIEW" >/dev/null || fail "Failed practice did not produce NEEDS_REVIEW"

log "Passing mastery evidence moves concept to MASTERED"
MSTART="$(curl -fsS -X POST "$API_BASE/student/learning/assessments/$MASTERY_ID/start" -H "Authorization: Bearer $STUDENT_TOKEN")"
MATTEMPT="$(jq -er '.data.id' <<<"$MSTART")"
MDETAIL="$(curl -fsS "$API_BASE/student/learning/assessments/$MASTERY_ID" -H "Authorization: Bearer $STUDENT_TOKEN")"
MQ1="$(jq -er '.data.questions[0].id' <<<"$MDETAIL")"
MQ2="$(jq -er '.data.questions[1].id' <<<"$MDETAIL")"
MQ3="$(jq -er '.data.questions[2].id' <<<"$MDETAIL")"
MQ4="$(jq -er '.data.questions[3].id' <<<"$MDETAIL")"
MPASS_PAYLOAD="$(jq -n --arg q1 "$MQ1" --arg q2 "$MQ2" --arg q3 "$MQ3" --arg q4 "$MQ4" '{answers:[{questionId:$q1,answer:{option:"B"}},{questionId:$q2,answer:{option:"C"}},{questionId:$q3,answer:{option:"D"}},{questionId:$q4,answer:{option:"C"}}],timeSpentSecs:60}')"
MRESULT="$(curl -fsS -X POST "$API_BASE/student/learning/attempts/$MATTEMPT/submit" -H "Authorization: Bearer $STUDENT_TOKEN" -H 'Content-Type: application/json' -d "$MPASS_PAYLOAD")"
jq -e '.data.status=="GRADED" and .data.percentage==100' <<<"$MRESULT" >/dev/null || fail "Mastery fixture was not graded at 100%"
MASTERED="$(concept_json)"
jq -e '.state=="MASTERED" and .needsReview==false and .masteryPct==100 and .practiceAttempts==1 and .masteryAttempts==1' <<<"$MASTERED" >/dev/null || fail "Passing mastery did not produce MASTERED"

log "Later failed practice cannot demote established mastery"
PSTART2="$(curl -fsS -X POST "$API_BASE/student/learning/assessments/$PRACTICE_ID/start" -H "Authorization: Bearer $STUDENT_TOKEN")"
PATTEMPT2="$(jq -er '.data.id' <<<"$PSTART2")"
curl -fsS -X POST "$API_BASE/student/learning/attempts/$PATTEMPT2/submit" \
  -H "Authorization: Bearer $STUDENT_TOKEN" -H 'Content-Type: application/json' -d "$PFAIL_PAYLOAD" \
  | jq -e '.data.status=="GRADED"' >/dev/null || fail "Second practice submission failed"
STILL_MASTERED="$(concept_json)"
jq -e '.state=="MASTERED" and .needsReview==false and .practiceAttempts==2 and .masteryAttempts==1 and .masteryPct==100' <<<"$STILL_MASTERED" >/dev/null || fail "Later practice incorrectly demoted MASTERED state"

DB_STATE="$(psqlq "SELECT state||'|'||practice_attempts||'|'||mastery_attempts||'|'||COALESCE(mastery_pct::text,'')||'|'||needs_review FROM student_concept_progress WHERE student_id='$STUDENT_ID' AND concept_id='$CONCEPT_ID';")"
[[ "$DB_STATE" == "MASTERED|2|1|100.00|f" ]] || fail "Persisted concept state mismatch: $DB_STATE"

printf '\nStudent concept mastery runtime E2E smoke passed.\n'
