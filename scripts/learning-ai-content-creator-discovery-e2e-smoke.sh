#!/usr/bin/env bash
set -Eeuo pipefail

API_BASE="${API_BASE:-http://127.0.0.1:5000/api/v1}"
ADMIN_MOBILE="${ADMIN_MOBILE:-9000000000}"
DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-vidyasetu_db}"
DB_USER="${DB_USER:-postgres}"
export PGPASSWORD="${DB_PASSWORD:-postgres}"

fail(){ printf 'FAILED: %s\n' "$*" >&2; exit 1; }
log(){ printf '\n==> %s\n' "$*"; }
psqlq(){ psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -Atc "$1"; }

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

login(){
  local mobile="$1" role="$2" send otp response
  send="$(curl -fsS -X POST "$API_BASE/auth/send-otp" -H 'Content-Type: application/json' -d "{\"mobile\":\"$mobile\",\"role\":\"$role\"}")"
  otp="$(jq -er '.data.otp' <<<"$send")"
  response="$(curl -fsS -X POST "$API_BASE/auth/verify-otp" -H 'Content-Type: application/json' -d "{\"mobile\":\"$mobile\",\"otp\":\"$otp\",\"role\":\"$role\"}")"
  jq -er '.data.accessToken' <<<"$response"
}

expect_status(){
  local expected="$1" output_file="$2"; shift 2
  local actual
  actual="$(curl -sS -o "$output_file" -w '%{http_code}' "$@")"
  [[ "$actual" == "$expected" ]] || { cat "$output_file" >&2 || true; fail "Expected HTTP $expected, got $actual"; }
}

log "Validate migrations 045 + 046"
for table in learning_creator_jobs learning_creator_sources learning_creator_outputs learning_source_discovery_runs learning_source_discovery_candidates; do
  [[ "$(psqlq "SELECT to_regclass('public.$table') IS NOT NULL;")" == "t" ]] || fail "$table missing"
done
[[ "$(psqlq "SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='learning_creator_jobs' AND column_name='submitted_to_learning_at');")" == "t" ]] || fail "Creator Learning submission column missing"
[[ "$(psqlq "SELECT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='trg_learning_intake_item_governance');")" == "t" ]] || fail "OER governance trigger missing"

log "Creator discovery is SUPER_ADMIN only"
expect_status 401 "$TMP_DIR/unauth-discovery.json" "$API_BASE/admin/learning/creator/discovery/runs"
ADMIN_TOKEN="$(login "$ADMIN_MOBILE" SUPER_ADMIN)"
AUTH=(-H "Authorization: Bearer $ADMIN_TOKEN")
ADMIN_ID="$(psqlq "SELECT id FROM users WHERE mobile='$ADMIN_MOBILE' LIMIT 1;")"
[[ -n "$ADMIN_ID" ]] || fail "Admin DB fixture missing"

log "Discover governed VidyaSetu source locally"
DISCOVERY="$(curl -fsS -X POST "$API_BASE/admin/learning/creator/discovery/search" "${AUTH[@]}" -H 'Content-Type: application/json' -d '{"provider":"LOCAL","query":"Work Ethic","classNumber":8,"limit":10}')"
RUN_ID="$(jq -er '.data.runId' <<<"$DISCOVERY")"
RESOURCE_ID="$(jq -er '.data.candidates[0].resource_id' <<<"$DISCOVERY")"
CANDIDATE_ID="$(jq -er '.data.candidates[0].id' <<<"$DISCOVERY")"
jq -e '.data.provider=="LOCAL" and .data.count>=1 and .data.candidates[0].licence_verified==true' <<<"$DISCOVERY" >/dev/null || fail "Local governed discovery did not return verified candidate"
[[ "$(psqlq "SELECT status::text||'|'||result_count FROM learning_source_discovery_runs WHERE id='$RUN_ID';")" == COMPLETED\|* ]] || fail "Discovery audit run not completed"

STAGED_LOCAL="$(curl -fsS -X POST "$API_BASE/admin/learning/creator/discovery/candidates/$CANDIDATE_ID/stage" "${AUTH[@]}")"
jq -e --arg rid "$RESOURCE_ID" '.data.kind=="GOVERNED_RESOURCE" and .data.resourceId==$rid' <<<"$STAGED_LOCAL" >/dev/null || fail "Local discovery candidate did not stage as governed resource"

log "Stage synthetic DIKSHA discovery candidate and enforce item-level review"
DIKSHA_RUN_ID="$(psqlq "INSERT INTO learning_source_discovery_runs(provider,query_text,class_number,subject,status,result_count,created_by,completed_at) VALUES('DIKSHA','CI governed DIKSHA candidate',8,'Science','COMPLETED',1,'$ADMIN_ID',NOW()) RETURNING id;")"
DIKSHA_CANDIDATE_ID="$(psqlq "INSERT INTO learning_source_discovery_candidates(run_id,provider,source_code,source_item_id,title,source_url,licence_candidate,licence_raw,attribution_text,grade_levels,subjects,languages,can_adapt,can_use_commercially,licence_verified,metadata) VALUES('$DIKSHA_RUN_ID','DIKSHA','DIKSHA','do_ci_creator_discovery','CI DIKSHA governed candidate','https://diksha.gov.in/resources/play/content/do_ci_creator_discovery','OTHER','Metadata licence requires verification',NULL,ARRAY['Class 8'],ARRAY['Science'],ARRAY['English'],FALSE,FALSE,FALSE,'{}'::jsonb) RETURNING id;")"
DIKSHA_STAGE="$(curl -fsS -X POST "$API_BASE/admin/learning/creator/discovery/candidates/$DIKSHA_CANDIDATE_ID/stage" "${AUTH[@]}")"
INTAKE_ID="$(jq -er '.data.intakeId' <<<"$DIKSHA_STAGE")"
jq -e '.data.kind=="OER_INTAKE"' <<<"$DIKSHA_STAGE" >/dev/null || fail "DIKSHA candidate did not enter OER Intake"

log "Database governance blocks DIKSHA approval without verified licence/attribution"
expect_status 400 "$TMP_DIR/diksha-approval-blocked.json" -X PATCH "$API_BASE/admin/learning/intake/$INTAKE_ID/status" "${AUTH[@]}" -H 'Content-Type: application/json' -d '{"status":"APPROVED"}'
[[ "$(psqlq "SELECT status::text FROM learning_source_intake WHERE id='$INTAKE_ID';")" != "APPROVED" ]] || fail "Unverified DIKSHA intake was approved"

log "Admin records verified item-level licence and attribution"
EVIDENCE="$(curl -fsS -X PATCH "$API_BASE/admin/learning/creator/discovery/intake/$INTAKE_ID/evidence" "${AUTH[@]}" -H 'Content-Type: application/json' -d '{"licenceCandidate":"CC_BY","attributionText":"CI verified author · CI learning item · DIKSHA · CC BY","reviewerNote":"CI item-level licence evidence verified."}')"
jq -e '.data.licence_candidate=="CC_BY" and (.data.attribution_text|length)>0' <<<"$EVIDENCE" >/dev/null || fail "DIKSHA evidence update failed"
APPROVED_INTAKE="$(curl -fsS -X PATCH "$API_BASE/admin/learning/intake/$INTAKE_ID/status" "${AUTH[@]}" -H 'Content-Type: application/json' -d '{"status":"APPROVED","note":"CI governed approval"}')"
jq -e '.data.status=="APPROVED"' <<<"$APPROVED_INTAKE" >/dev/null || fail "Verified DIKSHA intake approval failed"

create_and_submit(){
  local destination="$1" visibility="$2" access="$3" suffix="$4"
  local payload created job_id generated reviewed materialised submission resource_id assessment_id
  payload="$(jq -nc --arg title "Creator $destination Learning $suffix" --arg rid "$RESOURCE_ID" --arg visibility "$visibility" --arg access "$access" '{mode:"SOURCES",title:$title,classNumber:8,boardCodes:["COMMON"],languageMode:"BILINGUAL",visibility:$visibility,accessRequirement:$access,requestedPack:{lesson:true,revision:true,activities:true,questions:true,assessment:true,questionCount:5},sources:[{sourceRole:"GROUNDING",resourceId:$rid}]}')"
  created="$(curl -fsS -X POST "$API_BASE/admin/learning/creator/jobs" "${AUTH[@]}" -H 'Content-Type: application/json' -d "$payload")"
  job_id="$(jq -er '.data.id' <<<"$created")"
  generated="$(curl -fsS -X POST "$API_BASE/admin/learning/creator/jobs/$job_id/generate" "${AUTH[@]}")"
  jq -e '.data.status=="VALIDATION_FAILED" and .data.provider=="mock"' <<<"$generated" >/dev/null || fail "$destination fixture did not prove mock-provider safety boundary"

  # The mock provider is deliberately blocked from approval. After proving that
  # boundary above, promote only this disposable CI row so downstream canonical
  # materialisation/submission can be tested without external AI network calls.
  psqlq "UPDATE learning_creator_jobs SET status='READY_FOR_REVIEW',validation_report=jsonb_set(COALESCE(validation_report,'{}'::jsonb),'{passed}','true'::jsonb,TRUE) WHERE id='$job_id';" >/dev/null
  reviewed="$(curl -fsS -X POST "$API_BASE/admin/learning/creator/jobs/$job_id/review" "${AUTH[@]}" -H 'Content-Type: application/json' -d '{"decision":"APPROVE","note":"Disposable CI downstream handoff fixture after provider boundary proof."}')"
  jq -e '.data.status=="APPROVED"' <<<"$reviewed" >/dev/null || fail "$destination creator approval fixture failed"

  materialised="$(curl -fsS -X POST "$API_BASE/admin/learning/creator/jobs/$job_id/materialise" "${AUTH[@]}")"
  resource_id="$(jq -er '.data.resourceId' <<<"$materialised")"
  assessment_id="$(jq -er '.data.assessmentId' <<<"$materialised")"
  [[ "$(psqlq "SELECT review_status::text FROM learning_resources WHERE id='$resource_id';")" == "DRAFT" ]] || fail "$destination resource was not materialised as DRAFT"
  [[ "$(psqlq "SELECT review_status::text FROM learning_assessments WHERE id='$assessment_id';")" == "DRAFT" ]] || fail "$destination assessment was not materialised as DRAFT"

  submission="$(curl -fsS -X POST "$API_BASE/admin/learning/creator/jobs/$job_id/submit-learning" "${AUTH[@]}")"
  if [[ "$destination" == "Public" ]]; then
    jq -e '.data.target=="PUBLIC_LEARNING" and .data.reviewStatus=="SUBMITTED" and .data.visibility=="PUBLIC" and .data.accessRequirement=="PUBLIC"' <<<"$submission" >/dev/null || fail "Public Learning submission response incorrect"
  else
    jq -e '.data.target=="PRIVATE_LEARNING" and .data.reviewStatus=="SUBMITTED" and .data.visibility!="PUBLIC" and .data.accessRequirement!="PUBLIC"' <<<"$submission" >/dev/null || fail "Private Learning submission response incorrect"
  fi
  [[ "$(psqlq "SELECT review_status::text FROM learning_resources WHERE id='$resource_id';")" == "SUBMITTED" ]] || fail "$destination resource did not enter canonical SUBMITTED review"
  [[ "$(psqlq "SELECT COUNT(*) FROM learning_questions q JOIN learning_creator_outputs o ON o.question_id=q.id WHERE o.job_id='$job_id' AND q.review_status='SUBMITTED';")" -eq 5 ]] || fail "$destination questions did not enter canonical SUBMITTED review"
  [[ "$(psqlq "SELECT review_status::text FROM learning_assessments WHERE id='$assessment_id';")" == "SUBMITTED" ]] || fail "$destination assessment did not enter canonical SUBMITTED review"
  [[ "$(psqlq "SELECT submitted_to_learning_at IS NOT NULL FROM learning_creator_jobs WHERE id='$job_id';")" == "t" ]] || fail "$destination Creator submission audit timestamp missing"
  [[ "$(psqlq "SELECT COUNT(*) FROM learning_resources WHERE id='$resource_id' AND review_status='PUBLISHED';")" -eq 0 ]] || fail "$destination Creator submission bypassed Learning publication review"

  expect_status 400 "$TMP_DIR/duplicate-$destination.json" -X POST "$API_BASE/admin/learning/creator/jobs/$job_id/submit-learning" "${AUTH[@]}"
}

SUFFIX="$(date +%s)-$$"
log "Create, materialise and submit PRIVATE Learning pack"
create_and_submit "Private" "REGISTERED" "REGISTERED" "$SUFFIX"

log "Create, materialise and submit PUBLIC Learning pack"
create_and_submit "Public" "PUBLIC" "PUBLIC" "$SUFFIX"

log "Validate Creator/Learning audit invariants"
[[ "$(psqlq "SELECT COUNT(*) FROM learning_creator_jobs WHERE submitted_to_learning_at IS NOT NULL AND status='MATERIALISED';")" -ge 2 ]] || fail "Creator submission audit rows missing"
[[ "$(psqlq "SELECT COUNT(*) FROM learning_resources lr JOIN learning_creator_outputs o ON o.resource_id=lr.id JOIN learning_creator_jobs j ON j.id=o.job_id WHERE j.submitted_to_learning_at IS NOT NULL AND lr.review_status='PUBLISHED';")" -eq 0 ]] || fail "Creator handoff auto-published Learning resources"

printf '\nAI Content Creator source discovery + Private/Public Learning submission E2E passed.\n'
