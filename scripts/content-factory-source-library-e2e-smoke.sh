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
psqlq(){ psql -q -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -Atc "$1"; }

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

expect_status(){
  local expected="$1" output_file="$2"; shift 2
  local actual
  actual="$(curl -sS -o "$output_file" -w '%{http_code}' "$@")"
  [[ "$actual" == "$expected" ]] || {
    printf 'Response body:\n' >&2
    cat "$output_file" >&2 || true
    fail "Expected HTTP $expected, got $actual"
  }
}

login(){
  local mobile="$1" role="$2" send otp verify
  send="$(curl -fsS -X POST "$API_BASE/auth/send-otp" -H 'Content-Type: application/json' -d "{\"mobile\":\"$mobile\",\"role\":\"$role\"}")"
  otp="$(jq -er '.data.otp' <<<"$send")"
  verify="$(curl -fsS -X POST "$API_BASE/auth/verify-otp" -H 'Content-Type: application/json' -d "{\"mobile\":\"$mobile\",\"otp\":\"$otp\",\"role\":\"$role\"}")"
  jq -er '.data.accessToken' <<<"$verify"
}

log "Validate Content Factory handoff schema"
[[ "$(psqlq "SELECT to_regclass('public.learning_content_packs') IS NOT NULL;")" == "t" ]] || fail "Migration 048 pack schema missing"
[[ "$(psqlq "SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='learning_source_intake' AND column_name='licence_verified_at');")" == "t" ]] || fail "licence_verified_at missing"
[[ "$(psqlq "SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='learning_source_intake' AND column_name='imported_resource_id');")" == "t" ]] || fail "imported_resource_id missing"
[[ "$(psqlq "SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='learning_resources' AND column_name='chapter_label');")" == "t" ]] || fail "chapter_label missing"
[[ "$(psqlq "SELECT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='trg_learning_intake_item_governance');")" == "t" ]] || fail "governance trigger missing"

log "Factory endpoints remain SUPER_ADMIN only"
expect_status 401 "$TMP_DIR/unauth-options.json" "$API_BASE/admin/learning/factory/options"
expect_status 401 "$TMP_DIR/unauth-review.json" "$API_BASE/admin/learning/factory/source-review"
ADMIN_TOKEN="$(login "$ADMIN_MOBILE" SUPER_ADMIN)"
AUTH=(-H "Authorization: Bearer $ADMIN_TOKEN")

OPTIONS="$(curl -fsS "$API_BASE/admin/learning/factory/options" "${AUTH[@]}")"
SUBJECT_ID="$(jq -er '.data.subjects[] | select(.code=="SCI" or (.name|ascii_downcase)=="science") | .id' <<<"$OPTIONS" | head -n1)"
[[ -n "$SUBJECT_ID" ]] || fail "Science subject fixture missing"
jq -e '.data.workflow.handoff|contains("Content Library")' <<<"$OPTIONS" >/dev/null || fail "Factory workflow does not expose Content Library handoff"

log "Stage an external source; it must enter review, not Learning Library"
UNIQUE="$(date +%s)-$RANDOM"
SOURCE_URL="https://example.com/vidyasetu-ci/$UNIQUE"
STAGED="$(curl -fsS -X POST "$API_BASE/admin/learning/factory/external-web-source" "${AUTH[@]}" -H 'Content-Type: application/json' -d "$(jq -nc --arg url "$SOURCE_URL" '{title:"CI governed external source",sourceUrl:$url,licenceCandidate:"EXTERNAL_LINK_ONLY",attributionText:"Example Education · CI reference",classNumber:8,subject:"Science",boardCode:"COMMON"}')")"
INTAKE_ID="$(jq -er '.data.intakeId' <<<"$STAGED")"
jq -e '.data.kind=="OER_INTAKE" and .data.sourceCode=="EXTERNAL_WEB"' <<<"$STAGED" >/dev/null || fail "External source was not staged to OER Intake"
[[ "$(psqlq "SELECT status::text FROM learning_source_intake WHERE id='$INTAKE_ID';")" == "DISCOVERED" ]] || fail "New source should begin DISCOVERED"
[[ -z "$(psqlq "SELECT COALESCE(imported_resource_id::text,'') FROM learning_source_intake WHERE id='$INTAKE_ID';")" ]] || fail "Source was imported before review"

log "Governance must block approval before explicit licence verification"
expect_status 400 "$TMP_DIR/unverified-approval.json" -X PATCH "$API_BASE/admin/learning/intake/$INTAKE_ID/status" "${AUTH[@]}" -H 'Content-Type: application/json' -d '{"status":"APPROVED","note":"Must be blocked before verification"}'
[[ "$(psqlq "SELECT status::text FROM learning_source_intake WHERE id='$INTAKE_ID';")" == "DISCOVERED" ]] || fail "Unverified source status changed unexpectedly"
[[ -z "$(psqlq "SELECT COALESCE(licence_verified_at::text,'') FROM learning_source_intake WHERE id='$INTAKE_ID';")" ]] || fail "Discovery metadata incorrectly counted as explicit verification"

log "Platform Admin explicitly verifies licence and attribution evidence"
VERIFIED="$(curl -fsS -X PATCH "$API_BASE/admin/learning/creator/discovery/intake/$INTAKE_ID/evidence" "${AUTH[@]}" -H 'Content-Type: application/json' -d '{"licenceCandidate":"EXTERNAL_LINK_ONLY","attributionText":"Example Education · CI reference","reviewerNote":"CI verified link-only rights and attribution."}')"
jq -e '.data.licence_candidate=="EXTERNAL_LINK_ONLY" and (.data.licence_verified_at|length)>0' <<<"$VERIFIED" >/dev/null || fail "Explicit licence verification was not recorded"
[[ -n "$(psqlq "SELECT COALESCE(licence_verified_at::text,'') FROM learning_source_intake WHERE id='$INTAKE_ID';")" ]] || fail "Verification timestamp missing in DB"

log "Move verified item through source review to APPROVED"
for status in LICENCE_REVIEW CONTENT_REVIEW APPROVED; do
  RESPONSE="$(curl -fsS -X PATCH "$API_BASE/admin/learning/intake/$INTAKE_ID/status" "${AUTH[@]}" -H 'Content-Type: application/json' -d "{\"status\":\"$status\",\"note\":\"CI $status\"}")"
  jq -e --arg status "$status" '.data.status==$status' <<<"$RESPONSE" >/dev/null || fail "Could not move source to $status"
done

REVIEW="$(curl -fsS "$API_BASE/admin/learning/factory/source-review" "${AUTH[@]}")"
jq -e --arg id "$INTAKE_ID" '[.data[] | select(.id==$id and .status=="APPROVED" and .evidence_ready==true)] | length==1' <<<"$REVIEW" >/dev/null || fail "Approved source not ready in source-review queue"

log "Approved source becomes canonical DRAFT Learning resource only by explicit handoff"
PAYLOAD="$(jq -nc --arg sid "$SUBJECT_ID" '{classNumber:8,boardCode:"COMMON",subjectId:$sid,subjectName:"Science",chapter:"Force and Pressure",topic:"Pressure in daily life",language:"en",visibility:"CLASS_ONLY",accessRequirement:"REGISTERED"}')"
IMPORTED="$(curl -fsS -X POST "$API_BASE/admin/learning/factory/intake/$INTAKE_ID/add-to-library" "${AUTH[@]}" -H 'Content-Type: application/json' -d "$PAYLOAD")"
RESOURCE_ID="$(jq -er '.data.id' <<<"$IMPORTED")"
jq -e '.data.alreadyImported==false and .data.review_status=="DRAFT" and .data.visibility=="CLASS_ONLY" and .data.access_requirement=="REGISTERED"' <<<"$IMPORTED" >/dev/null || fail "Source-to-library response incorrect"

DB_RESOURCE="$(psqlq "SELECT review_status::text||'|'||visibility::text||'|'||access_requirement::text||'|'||class_min||'|'||class_max||'|'||COALESCE(chapter_label,'')||'|'||COALESCE(topic_label,'') FROM learning_resources WHERE id='$RESOURCE_ID';")"
[[ "$DB_RESOURCE" == "DRAFT|CLASS_ONLY|REGISTERED|8|8|Force and Pressure|Pressure in daily life" ]] || fail "Canonical Learning resource fields incorrect: $DB_RESOURCE"
[[ "$(psqlq "SELECT status::text||'|'||imported_resource_id::text FROM learning_source_intake WHERE id='$INTAKE_ID';")" == "IMPORTED|$RESOURCE_ID" ]] || fail "Source intake audit handoff incorrect"
[[ "$(psqlq "SELECT COUNT(*) FROM learning_resource_boards lrb JOIN education_boards eb ON eb.id=lrb.board_id WHERE lrb.resource_id='$RESOURCE_ID' AND eb.code='COMMON';")" == "1" ]] || fail "COMMON board mapping missing"
[[ "$(psqlq "SELECT COUNT(*) FROM learning_resource_grades lrg JOIN education_grade_levels egl ON egl.id=lrg.grade_id WHERE lrg.resource_id='$RESOURCE_ID' AND egl.code='CLASS_8';")" == "1" ]] || fail "Class 8 grade mapping missing"
[[ "$(psqlq "SELECT COUNT(*) FROM learning_resources WHERE id='$RESOURCE_ID' AND review_status='PUBLISHED';")" == "0" ]] || fail "Handoff auto-published content"

log "Handoff is idempotent and cannot duplicate canonical resource"
SECOND="$(curl -fsS -X POST "$API_BASE/admin/learning/factory/intake/$INTAKE_ID/add-to-library" "${AUTH[@]}" -H 'Content-Type: application/json' -d "$PAYLOAD")"
jq -e --arg rid "$RESOURCE_ID" '.data.alreadyImported==true and .data.id==$rid' <<<"$SECOND" >/dev/null || fail "Repeated handoff was not idempotent"
[[ "$(psqlq "SELECT COUNT(*) FROM learning_resources WHERE id='$RESOURCE_ID';")" == "1" ]] || fail "Duplicate resource created"

log "Queue badges reflect review-to-library progress"
COUNTS="$(curl -fsS "$API_BASE/admin/learning/factory/queue-counts" "${AUTH[@]}")"
jq -e '.data.contentLibraryPending>=1 and .data.sourceImportedPendingReview>=1' <<<"$COUNTS" >/dev/null || fail "Queue counts did not include imported DRAFT"

log "Access policy validation rejects unsafe Public/Private mismatch"
SOURCE_URL_2="https://example.com/vidyasetu-ci/$UNIQUE-public-policy"
STAGED_2="$(curl -fsS -X POST "$API_BASE/admin/learning/factory/external-web-source" "${AUTH[@]}" -H 'Content-Type: application/json' -d "$(jq -nc --arg url "$SOURCE_URL_2" '{title:"CI policy source",sourceUrl:$url,licenceCandidate:"EXTERNAL_LINK_ONLY",attributionText:"Example Education · CI policy",classNumber:8,subject:"Science",boardCode:"COMMON"}')")"
INTAKE_ID_2="$(jq -er '.data.intakeId' <<<"$STAGED_2")"
curl -fsS -X PATCH "$API_BASE/admin/learning/creator/discovery/intake/$INTAKE_ID_2/evidence" "${AUTH[@]}" -H 'Content-Type: application/json' -d '{"licenceCandidate":"EXTERNAL_LINK_ONLY","attributionText":"Example Education · CI policy","reviewerNote":"CI verified."}' >/dev/null
curl -fsS -X PATCH "$API_BASE/admin/learning/intake/$INTAKE_ID_2/status" "${AUTH[@]}" -H 'Content-Type: application/json' -d '{"status":"APPROVED"}' >/dev/null
BAD_PAYLOAD="$(jq -nc --arg sid "$SUBJECT_ID" '{classNumber:8,boardCode:"COMMON",subjectId:$sid,subjectName:"Science",language:"en",visibility:"PUBLIC",accessRequirement:"REGISTERED"}')"
expect_status 400 "$TMP_DIR/bad-access.json" -X POST "$API_BASE/admin/learning/factory/intake/$INTAKE_ID_2/add-to-library" "${AUTH[@]}" -H 'Content-Type: application/json' -d "$BAD_PAYLOAD"
[[ -z "$(psqlq "SELECT COALESCE(imported_resource_id::text,'') FROM learning_source_intake WHERE id='$INTAKE_ID_2';")" ]] || fail "Invalid access policy created a resource"

printf '\nCONTENT FACTORY SOURCE -> REVIEW -> CONTENT LIBRARY E2E PASSED\n'
