#!/usr/bin/env bash
set -Eeuo pipefail

API_BASE="${API_BASE:-http://127.0.0.1:5000/api/v1}"
ADMIN_MOBILE="${ADMIN_MOBILE:-9000000000}"
STUDENT_MOBILE="${STUDENT_MOBILE:-9300000001}"
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
  local mobile="$1" role="$2"
  local send otp response
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

log "Validate migration 045 schema"
for table in learning_creator_jobs learning_creator_sources learning_creator_outputs; do
  [[ "$(psqlq "SELECT to_regclass('public.$table') IS NOT NULL;")" == "t" ]] || fail "$table missing"
done

log "Creator API is SUPER_ADMIN only"
expect_status 401 "$TMP_DIR/unauth.json" "$API_BASE/admin/learning/creator/options"
STUDENT_TOKEN="$(login "$STUDENT_MOBILE" STUDENT)"
expect_status 403 "$TMP_DIR/student-forbidden.json" "$API_BASE/admin/learning/creator/options" -H "Authorization: Bearer $STUDENT_TOKEN"

log "Authenticate SUPER_ADMIN and read creator options"
ADMIN_TOKEN="$(login "$ADMIN_MOBILE" SUPER_ADMIN)"
AUTH=(-H "Authorization: Bearer $ADMIN_TOKEN")
OPTIONS="$(curl -fsS "$API_BASE/admin/learning/creator/options" "${AUTH[@]}")"
jq -e '.data.provider.name=="mock" and .data.provider.configured==false' <<<"$OPTIONS" >/dev/null || fail "Test creator provider should be safe mock mode"
jq -e '.data.sources | any(.code=="VIDYASETU_ORIGINAL")' <<<"$OPTIONS" >/dev/null || fail "Source registry missing VIDYASETU_ORIGINAL"

SUFFIX="$(date +%s)-$$"

log "Reject non-commercial source for Subscriber content"
NONCOMMERCIAL_PAYLOAD="$(jq -nc --arg suffix "$SUFFIX" '{mode:"SOURCES",title:("Blocked subscriber OER " + $suffix),classNumber:8,boardCodes:["COMMON"],languageMode:"BILINGUAL",visibility:"REGISTERED",accessRequirement:"SUBSCRIBER",requestedPack:{lesson:true,revision:true,activities:true,questions:true,assessment:true,questionCount:5},sources:[{sourceRole:"GROUNDING",sourceCode:"NROER",title:"Non-commercial OER",sourceUrl:"https://nroer.gov.in/example",licence:"CC_BY_NC_SA",attributionText:"NROER CI attribution",excerpt:"A verified test excerpt supplied only inside disposable CI for source-governance validation."}]}')"
expect_status 400 "$TMP_DIR/noncommercial.json" -X POST "$API_BASE/admin/learning/creator/jobs" "${AUTH[@]}" -H 'Content-Type: application/json' -d "$NONCOMMERCIAL_PAYLOAD"

log "Reject link-only source as grounding evidence"
LINK_ONLY_PAYLOAD="$(jq -nc --arg suffix "$SUFFIX" '{mode:"SOURCES",title:("Blocked link only " + $suffix),classNumber:8,boardCodes:["COMMON"],languageMode:"ENGLISH",visibility:"REGISTERED",accessRequirement:"REGISTERED",requestedPack:{lesson:true,revision:true,activities:true,questions:true,assessment:false,questionCount:5},sources:[{sourceRole:"GROUNDING",sourceCode:"EXTERNAL_OFFICIAL",title:"Official link",sourceUrl:"https://example.org/official",licence:"EXTERNAL_LINK_ONLY",attributionText:"Official reference",excerpt:"Reference-only material must not be adapted by the creator."}]}')"
expect_status 400 "$TMP_DIR/link-only.json" -X POST "$API_BASE/admin/learning/creator/jobs" "${AUTH[@]}" -H 'Content-Type: application/json' -d "$LINK_ONLY_PAYLOAD"

log "Stage governed Create-from-Sources job"
VALID_PAYLOAD="$(jq -nc --arg suffix "$SUFFIX" '{mode:"SOURCES",title:("Creator governed lesson " + $suffix),instructions:"Create a clear age-appropriate bilingual lesson pack for Class 8 learners.",classNumber:8,boardCodes:["COMMON"],languageMode:"BILINGUAL",visibility:"REGISTERED",accessRequirement:"REGISTERED",requestedPack:{lesson:true,revision:true,activities:true,questions:true,assessment:true,questionCount:5},sources:[{sourceRole:"GROUNDING",sourceCode:"VIDYASETU_ORIGINAL",title:"Governed CI source",sourceUrl:"https://vidyasetu.sbs/ci-content-creator-source",licence:"VIDYASETU_ORIGINAL",excerpt:"This controlled original VidyaSetu CI excerpt proves licence governance, provenance, citation integrity and human-review boundaries."}]}')"
CREATED="$(curl -fsS -X POST "$API_BASE/admin/learning/creator/jobs" "${AUTH[@]}" -H 'Content-Type: application/json' -d "$VALID_PAYLOAD")"
JOB_ID="$(jq -er '.data.id' <<<"$CREATED")"
jq -e '.data.status=="READY_TO_GENERATE"' <<<"$CREATED" >/dev/null || fail "Creator job was not staged correctly"
[[ "$(psqlq "SELECT status::text FROM learning_creator_jobs WHERE id='$JOB_ID';")" == "READY_TO_GENERATE" ]] || fail "Creator job status not persisted"
[[ "$(psqlq "SELECT COUNT(*) FROM learning_creator_sources WHERE job_id='$JOB_ID' AND verified_for_use=TRUE AND allow_adaptation=TRUE;")" -eq 1 ]] || fail "Governed source snapshot missing"

log "Generate in safe mock mode and require validation block"
GENERATED="$(curl -fsS -X POST "$API_BASE/admin/learning/creator/jobs/$JOB_ID/generate" "${AUTH[@]}")"
jq -e '.data.status=="VALIDATION_FAILED" and .data.provider=="mock"' <<<"$GENERATED" >/dev/null || fail "Mock generation must stop at VALIDATION_FAILED"
JOB_DETAIL="$(curl -fsS "$API_BASE/admin/learning/creator/jobs/$JOB_ID" "${AUTH[@]}")"
jq -e '.data.generated_pack.questions|length==5' <<<"$JOB_DETAIL" >/dev/null || fail "Generated mock pack question count incorrect"
jq -e '.data.validation_report.passed==false and (.data.validation_report.checks | any(.code=="PROVIDER" and .passed==false))' <<<"$JOB_DETAIL" >/dev/null || fail "Mock provider blocker missing"
jq -e '.data.sources|length==1 and .[0].verified_for_use==true' <<<"$JOB_DETAIL" >/dev/null || fail "Creator provenance not returned"

log "Human approval and materialisation cannot bypass failed validation"
expect_status 400 "$TMP_DIR/approve-blocked.json" -X POST "$API_BASE/admin/learning/creator/jobs/$JOB_ID/review" "${AUTH[@]}" -H 'Content-Type: application/json' -d '{"decision":"APPROVE","note":"Mock output must not pass human approval."}'
expect_status 400 "$TMP_DIR/materialise-blocked.json" -X POST "$API_BASE/admin/learning/creator/jobs/$JOB_ID/materialise" "${AUTH[@]}"
[[ "$(psqlq "SELECT COUNT(*) FROM learning_creator_outputs WHERE job_id='$JOB_ID';")" -eq 0 ]] || fail "Creator produced canonical outputs before approval"
[[ "$(psqlq "SELECT COUNT(*) FROM learning_resources WHERE created_at >= (SELECT created_at FROM learning_creator_jobs WHERE id='$JOB_ID') AND created_by=(SELECT created_by FROM learning_creator_jobs WHERE id='$JOB_ID') AND title LIKE 'Creator governed lesson%';")" -eq 0 ]] || fail "Creator auto-published/materialised a lesson"

log "Admin may explicitly reject generated draft"
REJECTED="$(curl -fsS -X POST "$API_BASE/admin/learning/creator/jobs/$JOB_ID/review" "${AUTH[@]}" -H 'Content-Type: application/json' -d '{"decision":"REJECT","note":"CI confirms explicit human decision path."}')"
jq -e '.data.status=="REJECTED"' <<<"$REJECTED" >/dev/null || fail "Explicit human rejection failed"

printf '\nHybrid AI Content Creator E2E smoke passed. AI output cannot auto-publish.\n'
