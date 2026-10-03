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
  [[ "$actual" == "$expected" ]] || { cat "$output_file" >&2 || true; fail "Expected HTTP $expected, got $actual"; }
}

login(){
  local send verify otp
  send="$(curl -fsS -X POST "$API_BASE/auth/send-otp" -H 'Content-Type: application/json' -d "{\"mobile\":\"$1\",\"role\":\"$2\"}")"
  otp="$(jq -er '.data.otp' <<<"$send")"
  verify="$(curl -fsS -X POST "$API_BASE/auth/verify-otp" -H 'Content-Type: application/json' -d "{\"mobile\":\"$1\",\"otp\":\"$otp\",\"role\":\"$2\"}")"
  jq -er '.data.accessToken' <<<"$verify"
}

log "Validate Content Pipeline schema and admin boundary"
[[ "$(psqlq "SELECT to_regclass('public.learning_content_assets') IS NOT NULL AND to_regclass('public.learning_content_pipeline_events') IS NOT NULL;")" == "t" ]] || fail "Migration 051 tables missing"
[[ "$(psqlq "SELECT COUNT(*) FROM education_grade_levels WHERE code='UKG' AND is_active=TRUE;")" == "1" ]] || fail "UKG grade missing"
expect_status 401 "$TMP_DIR/unauth.json" "$API_BASE/admin/learning/pipeline/options"
ADMIN_TOKEN="$(login "$ADMIN_MOBILE" SUPER_ADMIN)"
AUTH=(-H "Authorization: Bearer $ADMIN_TOKEN")

log "Options expose modalities, sources and early-years grades"
OPTIONS="$(curl -fsS "$API_BASE/admin/learning/pipeline/options" "${AUTH[@]}")"
jq -e '.data.mediaKinds|index("VIDEO") and index("AUDIO") and index("IMAGE") and index("ARTICLE")' <<<"$OPTIONS" >/dev/null || fail "Pipeline media kinds incomplete"
jq -e '.data.grades|map(.code)|index("UKG")' <<<"$OPTIONS" >/dev/null || fail "Pipeline grade options missing UKG"
jq -e '.data.categories|map(.code)|index("ACADEMIC") and index("LIFE_SKILLS")' <<<"$OPTIONS" >/dev/null || fail "Pipeline learning categories incomplete"

UNIQUE="$(date +%s)-$RANDOM"
log "Stage original text for UKG without a remote download"
expect_status 201 "$TMP_DIR/original.json" -X POST "$API_BASE/admin/learning/pipeline/stage" "${AUTH[@]}" -H 'Content-Type: application/json' -d "$(jq -nc --arg title "CI original counting $UNIQUE" '{sourceCode:"VIDYASETU_ORIGINAL",title:$title,mediaKind:"ARTICLE",deliveryMode:"VIDYASETU_ORIGINAL",category:"ACADEMIC",gradeCodes:["UKG"],boardCodes:["COMMON"],subjectLabel:"Mathematics",topicLabel:"Counting",language:"en",visibility:"PUBLIC",accessRequirement:"PUBLIC",bodyMarkdown:"# Count objects\n\nCount the objects carefully."}')"
ORIGINAL="$(<"$TMP_DIR/original.json")"
ORIGINAL_INTAKE="$(jq -er '.data.intakeId' <<<"$ORIGINAL")"
ORIGINAL_ASSET="$(jq -er '.data.assetId' <<<"$ORIGINAL")"
jq -e '.data.rightsStatus=="VERIFIED" and .data.deliveryMode=="VIDYASETU_ORIGINAL"' <<<"$ORIGINAL" >/dev/null || fail "Original was not staged as verified VidyaSetu content"
[[ "$(psqlq "SELECT COUNT(*) FROM learning_content_assets WHERE id='$ORIGINAL_ASSET' AND rights_status='VERIFIED' AND storage_key IS NULL AND attribution_text='VidyaSetu Original';")" == "1" ]] || fail "Original asset rights metadata incorrect"

curl -fsS -X POST "$API_BASE/admin/learning/pipeline/intake/$ORIGINAL_INTAKE/approve" "${AUTH[@]}" -H 'Content-Type: application/json' -d '{}' >/dev/null
ORIGINAL_RESOURCE="$(curl -fsS -X POST "$API_BASE/admin/learning/pipeline/intake/$ORIGINAL_INTAKE/materialise" "${AUTH[@]}" -H 'Content-Type: application/json' -d '{}' | jq -er '.data.resourceId')"
[[ "$(psqlq "SELECT review_status::text||'|'||visibility::text||'|'||access_requirement::text FROM learning_resources WHERE id='$ORIGINAL_RESOURCE';")" == "DRAFT|PUBLIC|PUBLIC" ]] || fail "Original resource did not remain an unpublished public draft"
[[ "$(psqlq "SELECT COUNT(*) FROM learning_resource_grades lrg JOIN education_grade_levels egl ON egl.id=lrg.grade_id WHERE lrg.resource_id='$ORIGINAL_RESOURCE' AND egl.code='UKG';")" == "1" ]] || fail "UKG mapping missing"

log "Stage and materialise an external pictorial link only after evidence"
expect_status 201 "$TMP_DIR/external.json" -X POST "$API_BASE/admin/learning/pipeline/stage" "${AUTH[@]}" -H 'Content-Type: application/json' -d "$(jq -nc --arg title "CI CBSE pictorial reference $UNIQUE" '{sourceCode:"CBSE",title:$title,mediaKind:"IMAGE",deliveryMode:"EXTERNAL_LINK",category:"LIFE_SKILLS",sourceUrl:"https://cbseacademic.nic.in",gradeCodes:["UKG"],boardCodes:["CBSE"],subjectLabel:"Foundational learning",visibility:"PUBLIC",accessRequirement:"PUBLIC",licenceCandidate:"EXTERNAL_LINK_ONLY"}')"
EXTERNAL="$(<"$TMP_DIR/external.json")"
EXTERNAL_INTAKE="$(jq -er '.data.intakeId' <<<"$EXTERNAL")"
[[ "$(jq -r '.data.rightsStatus' <<<"$EXTERNAL")" == "PENDING_REVIEW" ]] || fail "External item bypassed rights review"
curl -fsS -X PATCH "$API_BASE/admin/learning/pipeline/intake/$EXTERNAL_INTAKE/rights" "${AUTH[@]}" -H 'Content-Type: application/json' -d '{"licenceCandidate":"EXTERNAL_LINK_ONLY","attributionText":"CBSE official reference; link-only","rightsEvidenceUrl":"https://cbseacademic.nic.in"}' >/dev/null
curl -fsS -X POST "$API_BASE/admin/learning/pipeline/intake/$EXTERNAL_INTAKE/approve" "${AUTH[@]}" -H 'Content-Type: application/json' -d '{}' >/dev/null
EXTERNAL_RESOURCE="$(curl -fsS -X POST "$API_BASE/admin/learning/pipeline/intake/$EXTERNAL_INTAKE/materialise" "${AUTH[@]}" -H 'Content-Type: application/json' -d '{}' | jq -er '.data.resourceId')"
[[ "$(psqlq "SELECT resource_type::text||'|'||category::text||'|'||delivery_mode::text||'|'||COALESCE(external_url,'') FROM learning_resources WHERE id='$EXTERNAL_RESOURCE';")" == "IMAGE|LIFE_SKILLS|EXTERNAL_LINK|https://cbseacademic.nic.in/" ]] || fail "External image link/category handoff incorrect"
[[ "$(psqlq "SELECT COUNT(*) FROM learning_content_pipeline_events WHERE intake_id='$EXTERNAL_INTAKE' AND event_code IN ('STAGED','RIGHTS_VERIFIED','MATERIALISED');")" == "3" ]] || fail "Pipeline audit events incomplete"

printf '\nCONTENT PIPELINE UKG + ORIGINAL + EXTERNAL IMAGE E2E PASSED\n'
