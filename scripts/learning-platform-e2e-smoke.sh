#!/usr/bin/env bash
set -Eeuo pipefail

API_BASE="${API_BASE:-http://127.0.0.1:5000/api/v1}"
ADMIN_MOBILE="${ADMIN_MOBILE:-9000000000}"

fail() { printf 'FAILED: %s\n' "$*" >&2; exit 1; }
log() { printf '\n==> %s\n' "$*"; }

log "Public Learning overview"
OVERVIEW="$(curl -fsS "$API_BASE/public/learning/overview")"
[[ "$(jq -r '.success' <<< "$OVERVIEW")" == "true" ]] || fail "Learning overview unsuccessful"
(( $(jq -r '.data.totalResources' <<< "$OVERVIEW") >= 8 )) || fail "Expected starter public learning resources"
(( $(jq -r '.data.originalResources' <<< "$OVERVIEW") >= 8 )) || fail "Expected VidyaSetu Original starter resources"
(( $(jq -r '.data.boards | length' <<< "$OVERVIEW") >= 10 )) || fail "Cross-board registry is incomplete"

log "Featured public motivation / life-skills resources"
RESOURCES="$(curl -fsS "$API_BASE/public/learning/resources?featured=true&limit=20")"
[[ "$(jq -r '.success' <<< "$RESOURCES")" == "true" ]] || fail "Public resources endpoint unsuccessful"
jq -e '.data | any(.category == "MOTIVATION")' <<< "$RESOURCES" >/dev/null || fail "Motivation resource missing"
jq -e '.data | any(.category == "WORK_ETHIC")' <<< "$RESOURCES" >/dev/null || fail "Work ethic resource missing"
jq -e '.data | any(.category == "SOCIAL_RESPONSIBILITY")' <<< "$RESOURCES" >/dev/null || fail "Social responsibility resource missing"

log "Public original article detail"
ARTICLE="$(curl -fsS "$API_BASE/public/learning/resources/progress-not-perfection")"
[[ "$(jq -r '.data.source_code' <<< "$ARTICLE")" == "VIDYASETU_ORIGINAL" ]] || fail "Original source metadata missing"
[[ "$(jq -r '.data.licence' <<< "$ARTICLE")" == "VIDYASETU_ORIGINAL" ]] || fail "Original licence metadata missing"
[[ -n "$(jq -r '.data.body_markdown // empty' <<< "$ARTICLE")" ]] || fail "Original article body missing"

log "NROER source governance defaults"
SOURCES="$(curl -fsS "$API_BASE/public/learning/sources")"
[[ "$(jq -r '.data[] | select(.code=="NROER") | .requires_item_license_check' <<< "$SOURCES")" == "true" ]] || fail "NROER item-level licence verification must be required"
[[ "$(jq -r '.data[] | select(.code=="NROER") | .allow_rehosting_default' <<< "$SOURCES")" == "false" ]] || fail "NROER rehosting must default to false"

log "Authenticate disposable Platform Admin through mock OTP"
SEND="$(curl -fsS -X POST "$API_BASE/auth/send-otp" -H 'Content-Type: application/json' -d "{\"mobile\":\"$ADMIN_MOBILE\",\"role\":\"SUPER_ADMIN\"}")"
OTP="$(jq -r '.data.otp // empty' <<< "$SEND")"
[[ -n "$OTP" ]] || fail "Mock OTP was not exposed in test environment"
LOGIN="$(curl -fsS -X POST "$API_BASE/auth/verify-otp" -H 'Content-Type: application/json' -d "{\"mobile\":\"$ADMIN_MOBILE\",\"otp\":\"$OTP\",\"role\":\"SUPER_ADMIN\"}")"
TOKEN="$(jq -er '.data.accessToken' <<< "$LOGIN")"

log "Learning Studio options"
OPTIONS="$(curl -fsS "$API_BASE/admin/learning/options" -H "Authorization: Bearer $TOKEN")"
jq -e '.data.sources | any(.code=="VIDYASETU_ORIGINAL")' <<< "$OPTIONS" >/dev/null || fail "VidyaSetu Original source missing"
jq -e '.data.boards | any(.code=="CBSE") and any(.code=="UPMSP")' <<< "$OPTIONS" >/dev/null || fail "Expected board options missing"

log "Create and immediately publish an original cross-board article"
SLUG="ci-learning-$(date +%s)-$RANDOM"
CREATE_PAYLOAD="$(jq -n --arg slug "$SLUG" '{
  title:"CI Learning Resource",
  summary:"Disposable Learning Platform E2E resource",
  bodyMarkdown:"## Learn\nThis is a disposable CI-created original resource.",
  resourceType:"ARTICLE",
  category:"STUDY_SKILLS",
  visibility:"PUBLIC",
  reviewStatus:"PUBLISHED",
  language:"en",
  classMin:8,
  classMax:10,
  sourceCode:"VIDYASETU_ORIGINAL",
  licence:"VIDYASETU_ORIGINAL",
  boardCodes:["CBSE","UPMSP"],
  publicSlug:$slug
}')"
CREATED="$(curl -fsS -X POST "$API_BASE/admin/learning/resources" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d "$CREATE_PAYLOAD")"
RESOURCE_ID="$(jq -er '.data.id' <<< "$CREATED")"
[[ -n "$RESOURCE_ID" ]] || fail "Learning Studio did not return a resource id"

PUBLIC_CREATED="$(curl -fsS "$API_BASE/public/learning/resources/$SLUG")"
[[ "$(jq -r '.data.title' <<< "$PUBLIC_CREATED")" == "CI Learning Resource" ]] || fail "Published Learning Studio resource is not public"
jq -e '.data.board_codes | index("CBSE") and index("UPMSP")' <<< "$PUBLIC_CREATED" >/dev/null || fail "Cross-board mapping missing"

log "Reject unsafe NROER import without attribution"
BAD_CODE="$(curl -sS -o /tmp/bad-nroer.json -w '%{http_code}' -X POST "$API_BASE/admin/learning/resources" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"title":"Unsafe NROER copy","resourceType":"EXTERNAL_LINK","category":"ACADEMIC","visibility":"PUBLIC","sourceCode":"NROER","sourceUrl":"https://nroer.gov.in/","externalUrl":"https://nroer.gov.in/","licence":"CC_BY_SA","boardCodes":["COMMON"]}')"
[[ "$BAD_CODE" == "400" ]] || fail "NROER resource without attribution must be rejected; got HTTP $BAD_CODE"

log "Create governed NROER external reference"
NROER_SLUG="ci-nroer-$(date +%s)-$RANDOM"
NROER_PAYLOAD="$(jq -n --arg slug "$NROER_SLUG" '{
  title:"CI NROER Reference",
  summary:"Disposable governed NROER link",
  resourceType:"EXTERNAL_LINK",
  category:"ACADEMIC",
  visibility:"PUBLIC",
  reviewStatus:"PUBLISHED",
  language:"en",
  classMin:8,
  classMax:8,
  sourceCode:"NROER",
  sourceUrl:"https://nroer.gov.in/",
  externalUrl:"https://nroer.gov.in/",
  attributionText:"NROER / CIET-NCERT test attribution; licence verified for this disposable CI reference.",
  licence:"CC_BY_SA",
  boardCodes:["COMMON"],
  publicSlug:$slug
}')"
curl -fsS -X POST "$API_BASE/admin/learning/resources" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d "$NROER_PAYLOAD" >/tmp/nroer-created.json
[[ "$(jq -r '.success' /tmp/nroer-created.json)" == "true" ]] || fail "Governed NROER reference creation failed"

printf '\nLearning Platform E2E smoke passed.\n'
