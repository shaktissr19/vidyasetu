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

log "Validate migration 044 schema"
[[ "$(psqlq "SELECT to_regclass('public.learning_entitlements') IS NOT NULL;")" == "t" ]] || fail "learning_entitlements missing"
[[ "$(psqlq "SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='learning_resources' AND column_name='access_requirement');")" == "t" ]] || fail "resource access_requirement missing"
[[ "$(psqlq "SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='learning_assessments' AND column_name='access_requirement');")" == "t" ]] || fail "assessment access_requirement missing"

QUESTION_ID="$(psqlq "SELECT id FROM learning_questions ORDER BY created_at LIMIT 1;")"
[[ -n "$QUESTION_ID" ]] || fail "Question fixture missing"

log "Authenticate SUPER_ADMIN"
ADMIN_TOKEN="$(login "$ADMIN_MOBILE" SUPER_ADMIN)"
AUTH=(-H "Authorization: Bearer $ADMIN_TOKEN")

SUFFIX="$(date +%s)-$$"
RESOURCE_TITLE="Entitlement Authoring Resource $SUFFIX"
ASSESSMENT_TITLE="Entitlement Authoring Assessment $SUFFIX"
IMPORT_KEY="VS-ENTITLEMENT-AUTHORING-$SUFFIX"

log "Create Public Free resource"
RESOURCE_RESPONSE="$(curl -fsS -X POST "$API_BASE/admin/learning/resources" "${AUTH[@]}" -H 'Content-Type: application/json' -d "$(jq -nc --arg title "$RESOURCE_TITLE" '{title:$title,bodyMarkdown:"Public free authoring validation body.",resourceType:"ARTICLE",category:"MOTIVATION",visibility:"PUBLIC",accessRequirement:"PUBLIC",sourceCode:"VIDYASETU_ORIGINAL",licence:"VIDYASETU_ORIGINAL",reviewStatus:"DRAFT",boardCodes:["COMMON"]}')")"
RESOURCE_ID="$(jq -er '.data.id' <<<"$RESOURCE_RESPONSE")"
[[ -n "$RESOURCE_ID" ]] || fail "Admin resource creation did not return id"
[[ "$(psqlq "SELECT visibility::text||'|'||access_requirement::text FROM learning_resources WHERE id='$RESOURCE_ID';")" == "PUBLIC|PUBLIC" ]] || fail "Public Free resource policy was not persisted"

log "Reject invalid PUBLIC + SUBSCRIBER resource policy"
expect_status 400 "$TMP_DIR/invalid-resource.json" -X POST "$API_BASE/admin/learning/resources" "${AUTH[@]}" -H 'Content-Type: application/json' -d "$(jq -nc --arg title "Invalid Resource $SUFFIX" '{title:$title,bodyMarkdown:"Invalid access pair.",resourceType:"ARTICLE",category:"MOTIVATION",visibility:"PUBLIC",accessRequirement:"SUBSCRIBER",sourceCode:"VIDYASETU_ORIGINAL",licence:"VIDYASETU_ORIGINAL",reviewStatus:"DRAFT",boardCodes:["COMMON"]}')"

log "Change resource atomically to Subscriber"
PATCHED_RESOURCE="$(curl -fsS -X PATCH "$API_BASE/admin/learning/resources/$RESOURCE_ID/access" "${AUTH[@]}" -H 'Content-Type: application/json' -d '{"visibility":"REGISTERED","accessRequirement":"SUBSCRIBER"}')"
jq -e '.data.visibility=="REGISTERED" and .data.access_requirement=="SUBSCRIBER"' <<<"$PATCHED_RESOURCE" >/dev/null || fail "Resource access PATCH response incorrect"
[[ "$(psqlq "SELECT visibility::text||'|'||access_requirement::text FROM learning_resources WHERE id='$RESOURCE_ID';")" == "REGISTERED|SUBSCRIBER" ]] || fail "Subscriber resource policy was not persisted"

RESOURCE_LIST="$(curl -fsS "$API_BASE/admin/learning/resources" "${AUTH[@]}")"
jq -e --arg id "$RESOURCE_ID" '.data[] | select(.id==$id) | .visibility=="REGISTERED" and .access_requirement=="SUBSCRIBER"' <<<"$RESOURCE_LIST" >/dev/null || fail "Admin resource list does not expose access requirement"

log "Create Subscriber assessment"
ASSESSMENT_RESPONSE="$(curl -fsS -X POST "$API_BASE/admin/learning/assessments" "${AUTH[@]}" -H 'Content-Type: application/json' -d "$(jq -nc --arg title "$ASSESSMENT_TITLE" --arg qid "$QUESTION_ID" '{title:$title,assessmentType:"PRACTICE",visibility:"REGISTERED",accessRequirement:"SUBSCRIBER",reviewStatus:"DRAFT",classMin:8,classMax:8,passingPct:40,boardCodes:["COMMON"],questionIds:[$qid],conceptIds:[] }')")"
ASSESSMENT_ID="$(jq -er '.data.id' <<<"$ASSESSMENT_RESPONSE")"
[[ "$(psqlq "SELECT visibility::text||'|'||access_requirement::text FROM learning_assessments WHERE id='$ASSESSMENT_ID';")" == "REGISTERED|SUBSCRIBER" ]] || fail "Subscriber assessment policy was not persisted"

log "Reject invalid PUBLIC + SUBSCRIBER assessment policy"
expect_status 400 "$TMP_DIR/invalid-assessment.json" -X POST "$API_BASE/admin/learning/assessments" "${AUTH[@]}" -H 'Content-Type: application/json' -d "$(jq -nc --arg title "Invalid Assessment $SUFFIX" --arg qid "$QUESTION_ID" '{title:$title,assessmentType:"PRACTICE",visibility:"PUBLIC",accessRequirement:"SUBSCRIBER",reviewStatus:"DRAFT",questionIds:[$qid]}')"

log "Change assessment atomically to Public Free"
PATCHED_ASSESSMENT="$(curl -fsS -X PATCH "$API_BASE/admin/learning/assessments/$ASSESSMENT_ID/access" "${AUTH[@]}" -H 'Content-Type: application/json' -d '{"visibility":"PUBLIC","accessRequirement":"PUBLIC"}')"
jq -e '.data.visibility=="PUBLIC" and .data.access_requirement=="PUBLIC"' <<<"$PATCHED_ASSESSMENT" >/dev/null || fail "Assessment access PATCH response incorrect"
[[ "$(psqlq "SELECT visibility::text||'|'||access_requirement::text FROM learning_assessments WHERE id='$ASSESSMENT_ID';")" == "PUBLIC|PUBLIC" ]] || fail "Public Free assessment policy was not persisted"

ASSESSMENT_LIST="$(curl -fsS "$API_BASE/admin/learning/assessments" "${AUTH[@]}")"
jq -e --arg id "$ASSESSMENT_ID" '.data[] | select(.id==$id) | .visibility=="PUBLIC" and .access_requirement=="PUBLIC"' <<<"$ASSESSMENT_LIST" >/dev/null || fail "Admin assessment list does not expose access requirement"

log "Validate entitlement-aware Global Learning importer"
cat > "$TMP_DIR/import.json" <<JSON
{
  "rows": [
    {
      "record_type": "RESOURCE",
      "import_key": "$IMPORT_KEY",
      "grade_codes": "CLASS_8",
      "board_codes": "COMMON",
      "title": "Importer Public Free $SUFFIX",
      "body_markdown": "Importer access requirement validation.",
      "resource_type": "ARTICLE",
      "category": "MOTIVATION",
      "visibility": "PUBLIC",
      "access_requirement": "PUBLIC",
      "review_status": "DRAFT",
      "source_code": "VIDYASETU_ORIGINAL",
      "licence": "VIDYASETU_ORIGINAL"
    }
  ]
}
JSON

STAGED="$(curl -fsS -X POST "$API_BASE/admin/learning/imports/stage" "${AUTH[@]}" -F "file=@$TMP_DIR/import.json;type=application/json")"
BATCH_ID="$(jq -er '.data.id' <<<"$STAGED")"
jq -e '.data.error_rows==0 and .data.valid_rows==1 and .data.rows[0].normalized_payload.accessRequirement=="PUBLIC"' <<<"$STAGED" >/dev/null || fail "Importer did not normalize Public Free access"

COMMITTED="$(curl -fsS -X POST "$API_BASE/admin/learning/imports/$BATCH_ID/commit" "${AUTH[@]}")"
jq -e '.data.status=="COMPLETED" and .data.imported_rows==1' <<<"$COMMITTED" >/dev/null || fail "Importer commit failed"
[[ "$(psqlq "SELECT visibility::text||'|'||access_requirement::text FROM learning_resources WHERE import_key='$IMPORT_KEY';")" == "PUBLIC|PUBLIC" ]] || fail "Importer did not persist Public Free policy"

log "Reject invalid access pair during import staging"
cat > "$TMP_DIR/invalid-import.json" <<JSON
{
  "rows": [
    {
      "record_type": "RESOURCE",
      "import_key": "${IMPORT_KEY}-INVALID",
      "grade_codes": "CLASS_8",
      "board_codes": "COMMON",
      "title": "Importer Invalid Access $SUFFIX",
      "body_markdown": "Invalid access requirement validation.",
      "resource_type": "ARTICLE",
      "category": "MOTIVATION",
      "visibility": "PUBLIC",
      "access_requirement": "SUBSCRIBER",
      "review_status": "DRAFT",
      "source_code": "VIDYASETU_ORIGINAL",
      "licence": "VIDYASETU_ORIGINAL"
    }
  ]
}
JSON

INVALID_STAGED="$(curl -fsS -X POST "$API_BASE/admin/learning/imports/stage" "${AUTH[@]}" -F "file=@$TMP_DIR/invalid-import.json;type=application/json")"
jq -e '.data.error_rows==1 and .data.rows[0].validation_status=="INVALID" and (.data.rows[0].errors | any(contains("PUBLIC visibility must use PUBLIC access requirement")))' <<<"$INVALID_STAGED" >/dev/null || fail "Importer accepted invalid PUBLIC + SUBSCRIBER pair"

log "Validate database invariants"
[[ "$(psqlq "SELECT COUNT(*) FROM learning_resources WHERE (visibility='PUBLIC' AND access_requirement<>'PUBLIC') OR (access_requirement='PUBLIC' AND visibility<>'PUBLIC');")" -eq 0 ]] || fail "Resource visibility/access invariant broken"
[[ "$(psqlq "SELECT COUNT(*) FROM learning_assessments WHERE (visibility='PUBLIC' AND access_requirement<>'PUBLIC') OR (access_requirement='PUBLIC' AND visibility<>'PUBLIC');")" -eq 0 ]] || fail "Assessment visibility/access invariant broken"

printf '\nAdmin Learning entitlement authoring E2E smoke passed.\n'
