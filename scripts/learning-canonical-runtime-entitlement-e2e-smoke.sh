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

log "Validate entitlement schema"
[[ "$(psqlq "SELECT to_regclass('public.learning_entitlements') IS NOT NULL;")" == "t" ]] || fail "learning_entitlements missing"
[[ "$(psqlq "SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='learning_resources' AND column_name='access_requirement');")" == "t" ]] || fail "learning_resources.access_requirement missing"
[[ "$(psqlq "SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='learning_assessments' AND column_name='access_requirement');")" == "t" ]] || fail "learning_assessments.access_requirement missing"

STUDENT_USER_ID="$(psqlq "SELECT u.id FROM users u JOIN students s ON s.user_id=u.id WHERE u.mobile='$STUDENT_MOBILE' AND s.status='ACTIVE' LIMIT 1;")"
STUDENT_ID="$(psqlq "SELECT id FROM students WHERE user_id='$STUDENT_USER_ID' LIMIT 1;")"
SCHOOL_ID="$(psqlq "SELECT school_id FROM students WHERE id='$STUDENT_ID' LIMIT 1;")"
[[ -n "$STUDENT_USER_ID" && -n "$STUDENT_ID" && -n "$SCHOOL_ID" ]] || fail "Student fixture missing"

RESOURCE_ROW="$(psqlq "
SELECT lr.id||'|'||sub.id
FROM learning_resources lr
JOIN subjects sub ON sub.id=lr.subject_id
WHERE lr.review_status='PUBLISHED'
  AND lr.category='ACADEMIC'
  AND EXISTS (
    SELECT 1 FROM learning_resource_boards lrb
    JOIN education_boards eb ON eb.id=lrb.board_id
    WHERE lrb.resource_id=lr.id AND eb.code='COMMON'
  )
  AND (
    EXISTS (
      SELECT 1 FROM learning_resource_grades lrg
      JOIN education_grade_levels egl ON egl.id=lrg.grade_id
      WHERE lrg.resource_id=lr.id AND egl.code='CLASS_8'
    )
    OR (
      NOT EXISTS (SELECT 1 FROM learning_resource_grades lrg0 WHERE lrg0.resource_id=lr.id)
      AND (lr.class_min IS NULL OR lr.class_min <= 8)
      AND (lr.class_max IS NULL OR lr.class_max >= 8)
    )
  )
ORDER BY lr.is_featured_public DESC, lr.created_at
LIMIT 1;")"
[[ -n "$RESOURCE_ROW" ]] || fail "Published Class 8 academic resource fixture missing"
IFS='|' read -r RESOURCE_ID SUBJECT_ID <<<"$RESOURCE_ROW"

ASSESSMENT_ID="$(psqlq "
SELECT la.id
FROM learning_assessments la
WHERE la.review_status='PUBLISHED'
  AND (la.class_min IS NULL OR la.class_min <= 8)
  AND (la.class_max IS NULL OR la.class_max >= 8)
  AND EXISTS (
    SELECT 1 FROM learning_assessment_boards lab
    JOIN education_boards eb ON eb.id=lab.board_id
    WHERE lab.assessment_id=la.id AND eb.code='COMMON'
  )
ORDER BY la.is_featured_public DESC, la.created_at
LIMIT 1;")"
[[ -n "$ASSESSMENT_ID" ]] || fail "Published Class 8 assessment fixture missing"

log "Turn disposable published resource and assessment into subscriber content"
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 \
  -v resource_id="$RESOURCE_ID" -v assessment_id="$ASSESSMENT_ID" -v user_id="$STUDENT_USER_ID" -v school_id="$SCHOOL_ID" <<'SQL'
DELETE FROM learning_entitlements
WHERE (user_id=:'user_id'::uuid OR school_id=:'school_id'::uuid)
  AND entitlement_code IN ('LEARNING_SUBSCRIBER','LEARNING_SCHOOL_LICENSE');

UPDATE learning_resources
SET visibility='REGISTERED', access_requirement='SUBSCRIBER'
WHERE id=:'resource_id'::uuid;

UPDATE learning_assessments
SET visibility='REGISTERED', access_requirement='SUBSCRIBER'
WHERE id=:'assessment_id'::uuid;
SQL

log "Authenticate free learner"
STUDENT_TOKEN="$(login "$STUDENT_MOBILE" STUDENT)"
AUTH=(-H "Authorization: Bearer $STUDENT_TOKEN")

FREE_CATALOGUE="$(curl -fsS "$API_BASE/student/learning/catalogue" "${AUTH[@]}")"
jq -e '.data.access.tier=="REGISTERED" and .data.access.subscriberAccess==false' <<<"$FREE_CATALOGUE" >/dev/null || fail "Free learner access tier incorrect"
jq -e --arg sid "$SUBJECT_ID" '.data.subjects | any(.id==$sid)' <<<"$FREE_CATALOGUE" >/dev/null || fail "Canonical subject missing from catalogue"

FREE_SUBJECT="$(curl -fsS "$API_BASE/student/learning/catalogue/subjects/$SUBJECT_ID" "${AUTH[@]}")"
jq -e --arg rid "$RESOURCE_ID" '.data.resources[] | select(.id==$rid) | .is_accessible==false and .access_requirement=="SUBSCRIBER" and (.lock_reason|length>0)' <<<"$FREE_SUBJECT" >/dev/null || fail "Subscriber resource was not locked for free learner"

FREE_RESOURCE_STATUS="$(curl -sS -o /tmp/vidyasetu-free-resource.json -w '%{http_code}' "$API_BASE/student/learning/resources/$RESOURCE_ID" "${AUTH[@]}")"
[[ "$FREE_RESOURCE_STATUS" == "403" ]] || { cat /tmp/vidyasetu-free-resource.json; fail "Free learner resource read should be 403, got $FREE_RESOURCE_STATUS"; }

FREE_PROGRESS_STATUS="$(curl -sS -o /tmp/vidyasetu-free-progress.json -w '%{http_code}' -X PATCH "$API_BASE/student/learning/resources/$RESOURCE_ID/progress" "${AUTH[@]}" -H 'Content-Type: application/json' -d '{"progressPct":50}')"
[[ "$FREE_PROGRESS_STATUS" == "403" ]] || { cat /tmp/vidyasetu-free-progress.json; fail "Free learner progress write should be 403, got $FREE_PROGRESS_STATUS"; }

FREE_ASSESSMENTS="$(curl -fsS "$API_BASE/student/learning/assessments" "${AUTH[@]}")"
jq -e --arg aid "$ASSESSMENT_ID" '([.data[].id] | index($aid)) == null' <<<"$FREE_ASSESSMENTS" >/dev/null || fail "Locked subscriber assessment leaked into assessment list"

FREE_ASSESSMENT_STATUS="$(curl -sS -o /tmp/vidyasetu-free-assessment.json -w '%{http_code}' "$API_BASE/student/learning/assessments/$ASSESSMENT_ID" "${AUTH[@]}")"
[[ "$FREE_ASSESSMENT_STATUS" == "403" ]] || { cat /tmp/vidyasetu-free-assessment.json; fail "Free learner assessment read should be 403, got $FREE_ASSESSMENT_STATUS"; }

FREE_START_STATUS="$(curl -sS -o /tmp/vidyasetu-free-assessment-start.json -w '%{http_code}' -X POST "$API_BASE/student/learning/assessments/$ASSESSMENT_ID/start" "${AUTH[@]}")"
[[ "$FREE_START_STATUS" == "403" ]] || { cat /tmp/vidyasetu-free-assessment-start.json; fail "Free learner assessment start should be 403, got $FREE_START_STATUS"; }

FREE_HOME="$(curl -fsS "$API_BASE/student/learning/home" "${AUTH[@]}")"
jq -e '.data.access.tier=="REGISTERED"' <<<"$FREE_HOME" >/dev/null || fail "Learning Home access summary missing"
jq -e --arg rid "$RESOURCE_ID" '([.data.recommendedResources[].id] | index($rid)) == null' <<<"$FREE_HOME" >/dev/null || fail "Locked subscriber resource leaked into Learning Home"
jq -e --arg aid "$ASSESSMENT_ID" '([.data.assessments[].id] | index($aid)) == null' <<<"$FREE_HOME" >/dev/null || fail "Locked subscriber assessment leaked into Learning Home"

log "Grant individual subscriber entitlement"
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 \
  -v user_id="$STUDENT_USER_ID" <<'SQL'
INSERT INTO learning_entitlements(entitlement_code,user_id,status,source,source_reference)
VALUES('LEARNING_SUBSCRIBER',:'user_id'::uuid,'ACTIVE','CI','canonical-runtime-e2e');
SQL

SUB_CATALOGUE="$(curl -fsS "$API_BASE/student/learning/catalogue" "${AUTH[@]}")"
jq -e '.data.access.tier=="SUBSCRIBER" and .data.access.individualSubscriber==true and .data.access.subscriberAccess==true' <<<"$SUB_CATALOGUE" >/dev/null || fail "Individual subscriber entitlement not resolved"

SUB_SUBJECT="$(curl -fsS "$API_BASE/student/learning/catalogue/subjects/$SUBJECT_ID" "${AUTH[@]}")"
jq -e --arg rid "$RESOURCE_ID" '.data.resources[] | select(.id==$rid) | .is_accessible==true and .lock_reason==null' <<<"$SUB_SUBJECT" >/dev/null || fail "Subscriber resource did not unlock"

curl -fsS "$API_BASE/student/learning/resources/$RESOURCE_ID" "${AUTH[@]}" | jq -e '.data.access_requirement=="SUBSCRIBER" and .data.access.subscriberAccess==true' >/dev/null || fail "Subscriber resource read failed"
curl -fsS -X PATCH "$API_BASE/student/learning/resources/$RESOURCE_ID/progress" "${AUTH[@]}" -H 'Content-Type: application/json' -d '{"progressPct":50}' | jq -e '.data.progress_pct==50' >/dev/null || fail "Subscriber resource progress failed"

SUB_ASSESSMENTS="$(curl -fsS "$API_BASE/student/learning/assessments" "${AUTH[@]}")"
jq -e --arg aid "$ASSESSMENT_ID" '([.data[].id] | index($aid)) != null' <<<"$SUB_ASSESSMENTS" >/dev/null || fail "Subscriber assessment did not unlock in assessment list"
curl -fsS "$API_BASE/student/learning/assessments/$ASSESSMENT_ID" "${AUTH[@]}" | jq -e --arg aid "$ASSESSMENT_ID" '.data.id==$aid and (.data.questions|length)>0' >/dev/null || fail "Subscriber assessment direct read failed"
curl -fsS -X POST "$API_BASE/student/learning/assessments/$ASSESSMENT_ID/start" "${AUTH[@]}" | jq -e --arg aid "$ASSESSMENT_ID" '.data.assessment_id==$aid and .data.status=="IN_PROGRESS"' >/dev/null || fail "Subscriber assessment start failed"

log "Replace individual subscription with school Learning licence"
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 \
  -v user_id="$STUDENT_USER_ID" -v school_id="$SCHOOL_ID" <<'SQL'
UPDATE learning_entitlements
SET status='REVOKED', updated_at=NOW()
WHERE user_id=:'user_id'::uuid AND entitlement_code='LEARNING_SUBSCRIBER' AND status='ACTIVE';

INSERT INTO learning_entitlements(entitlement_code,school_id,status,source,source_reference)
VALUES('LEARNING_SCHOOL_LICENSE',:'school_id'::uuid,'ACTIVE','CI','canonical-runtime-e2e-school');
SQL

SCHOOL_CATALOGUE="$(curl -fsS "$API_BASE/student/learning/catalogue" "${AUTH[@]}")"
jq -e '.data.access.tier=="SCHOOL_LICENSED" and .data.access.schoolLicensed==true and .data.access.subscriberAccess==true' <<<"$SCHOOL_CATALOGUE" >/dev/null || fail "School Learning licence not resolved"
curl -fsS "$API_BASE/student/learning/resources/$RESOURCE_ID" "${AUTH[@]}" | jq -e '.data.access.tier=="SCHOOL_LICENSED"' >/dev/null || fail "School licensed learner could not read subscriber resource"
curl -fsS "$API_BASE/student/learning/assessments/$ASSESSMENT_ID" "${AUTH[@]}" | jq -e --arg aid "$ASSESSMENT_ID" '.data.id==$aid' >/dev/null || fail "School licensed learner could not read subscriber assessment"

log "Validate persistence"
[[ "$(psqlq "SELECT progress_pct::int FROM student_learning_resource_progress WHERE student_id='$STUDENT_ID' AND resource_id='$RESOURCE_ID';")" -eq 50 ]] || fail "Canonical resource progress not persisted"

printf '\nCanonical Learning runtime + entitlement E2E smoke passed.\n'
