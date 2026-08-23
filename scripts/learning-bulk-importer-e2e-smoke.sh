#!/usr/bin/env bash
set -Eeuo pipefail

API_BASE="${API_BASE:-http://127.0.0.1:5000/api/v1}"
ADMIN_MOBILE="${ADMIN_MOBILE:-9000000000}"
EARLY_STUDENT_MOBILE="${EARLY_STUDENT_MOBILE:-9888800023}"

fail(){ printf 'FAILED: %s\n' "$*" >&2; exit 1; }
log(){ printf '\n==> %s\n' "$*"; }

login_admin(){
  local send otp response
  send="$(curl -fsS -X POST "$API_BASE/auth/send-otp" -H 'Content-Type: application/json' -d "{\"mobile\":\"$ADMIN_MOBILE\",\"role\":\"SUPER_ADMIN\"}")"
  otp="$(jq -er '.data.otp' <<<"$send")"
  response="$(curl -fsS -X POST "$API_BASE/auth/verify-otp" -H 'Content-Type: application/json' -d "{\"mobile\":\"$ADMIN_MOBILE\",\"otp\":\"$otp\",\"role\":\"SUPER_ADMIN\"}")"
  jq -er '.data.accessToken' <<<"$response"
}

login_new_student(){
  local mobile="$1" send otp response
  send="$(curl -fsS -X POST "$API_BASE/auth/send-otp" -H 'Content-Type: application/json' -d "{\"mobile\":\"$mobile\",\"role\":\"STUDENT\"}")"
  otp="$(jq -er '.data.otp' <<<"$send")"
  response="$(curl -fsS -X POST "$API_BASE/auth/verify-otp" -H 'Content-Type: application/json' -d "{\"mobile\":\"$mobile\",\"otp\":\"$otp\",\"role\":\"STUDENT\"}")"
  jq -er '.data.accessToken' <<<"$response"
}

ADMIN_TOKEN="$(login_admin)"
AUTH=(-H "Authorization: Bearer $ADMIN_TOKEN")

log "Importer is Admin-only"
NOAUTH="$(curl -sS -o /tmp/import-noauth.json -w '%{http_code}' "$API_BASE/admin/learning/imports")"
[[ "$NOAUTH" == "401" ]] || fail "Importer without authentication must return 401, got $NOAUTH"

log "Global grade catalogue covers Pre-Nursery through Class 12"
OPTIONS="$(curl -fsS "${AUTH[@]}" "$API_BASE/admin/learning/imports/options")"
jq -e '.success==true and (.data.grades|length==16)' <<<"$OPTIONS" >/dev/null || fail "Expected 16 canonical grade levels"
for grade in PRE_NURSERY NURSERY LKG UKG CLASS_1 CLASS_5 CLASS_8 CLASS_12; do
  jq -e --arg grade "$grade" '.data.grades | any(.code==$grade)' <<<"$OPTIONS" >/dev/null || fail "Missing grade $grade"
done

stage_template(){
  local sample="$1" outfile="$2"
  curl -fsS "${AUTH[@]}" "$API_BASE/admin/learning/imports/template?format=csv&sample=$sample" -o "$outfile"
  test -s "$outfile" || fail "$sample template is empty"
  curl -fsS -X POST "${AUTH[@]}" -F "file=@$outfile;type=text/csv" "$API_BASE/admin/learning/imports/stage"
}

log "Class 5 template stages but does not mutate Learning catalogue before commit"
C5_FILE="/tmp/vidyasetu-class5-import.csv"
C5_STAGE="$(stage_template CLASS_5 "$C5_FILE")"
C5_BATCH="$(jq -er '.data.id' <<<"$C5_STAGE")"
jq -e '.data.total_rows==2 and .data.valid_rows==2 and .data.error_rows==0 and .data.imported_rows==0' <<<"$C5_STAGE" >/dev/null || fail "Class 5 template did not validate cleanly"
BEFORE_C5="$(curl -fsS "$API_BASE/public/learning/resources?grade=CLASS_5&limit=100")"
jq -e '.data | all(.title != "Class 5 Science Quick Guide")' <<<"$BEFORE_C5" >/dev/null || fail "Class 5 import mutated catalogue before Admin commit"

log "Admin commits Class 5 validated batch"
C5_COMMIT="$(curl -fsS -X POST "${AUTH[@]}" "$API_BASE/admin/learning/imports/$C5_BATCH/commit")"
jq -e '.data.status=="COMPLETED" and .data.imported_rows==2' <<<"$C5_COMMIT" >/dev/null || fail "Class 5 batch did not complete"
C5_PUBLIC="$(curl -fsS "$API_BASE/public/learning/resources?grade=CLASS_5&board=COMMON&limit=100")"
jq -e '.data | any(.title=="Class 5 Science Quick Guide")' <<<"$C5_PUBLIC" >/dev/null || fail "Imported Class 5 public resource not discoverable by canonical grade"

log "Class 8 template uses the same global importer"
C8_FILE="/tmp/vidyasetu-class8-import.csv"
C8_STAGE="$(stage_template CLASS_8 "$C8_FILE")"
C8_BATCH="$(jq -er '.data.id' <<<"$C8_STAGE")"
jq -e '.data.total_rows==2 and .data.valid_rows==2 and .data.error_rows==0' <<<"$C8_STAGE" >/dev/null || fail "Class 8 template did not validate cleanly"
C8_COMMIT="$(curl -fsS -X POST "${AUTH[@]}" "$API_BASE/admin/learning/imports/$C8_BATCH/commit")"
jq -e '.data.status=="COMPLETED" and .data.imported_rows==2' <<<"$C8_COMMIT" >/dev/null || fail "Class 8 batch did not complete"
curl -fsS "$API_BASE/public/learning/resources?grade=CLASS_8&limit=100" | jq -e '.data | any(.title=="Class 8 Science Quick Guide")' >/dev/null || fail "Imported Class 8 public resource missing"

log "Early-years template proves Pre-Nursery/Nursery support"
EY_FILE="/tmp/vidyasetu-early-years-import.csv"
EY_STAGE="$(stage_template EARLY_YEARS "$EY_FILE")"
EY_BATCH="$(jq -er '.data.id' <<<"$EY_STAGE")"
jq -e '.data.total_rows==1 and .data.valid_rows==1 and .data.error_rows==0' <<<"$EY_STAGE" >/dev/null || fail "Early-years template did not validate"
EY_COMMIT="$(curl -fsS -X POST "${AUTH[@]}" "$API_BASE/admin/learning/imports/$EY_BATCH/commit")"
jq -e '.data.status=="COMPLETED" and .data.imported_rows==1' <<<"$EY_COMMIT" >/dev/null || fail "Early-years batch did not complete"
curl -fsS "$API_BASE/public/learning/resources?grade=PRE_NURSERY&limit=100" | jq -e '.data | any(.title=="Let us learn primary colours")' >/dev/null || fail "Pre-Nursery resource missing after import"
curl -fsS "$API_BASE/public/learning/resources?grade=NURSERY&limit=100" | jq -e '.data | any(.title=="Let us learn primary colours")' >/dev/null || fail "Nursery mapping missing after import"

log "Logged-in Pre-Nursery learner receives canonical early-years Learning, not Class 8 content"
EARLY_TOKEN="$(login_new_student "$EARLY_STUDENT_MOBILE")"
EARLY_AUTH=(-H "Authorization: Bearer $EARLY_TOKEN")
curl -fsS -X POST "${EARLY_AUTH[@]}" "$API_BASE/student/profile/complete" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Importer Early Learner","language":"en","gradeLevel":"PN"}' \
  | jq -e '.success==true and .data.student.gradeLevel=="PN"' >/dev/null || fail "Could not create Pre-Nursery Student profile"
EARLY_HOME="$(curl -fsS "${EARLY_AUTH[@]}" "$API_BASE/student/learning/home")"
jq -e '.data.learner.gradeCode=="PRE_NURSERY" and .data.learner.gradeLabel=="Pre-Nursery"' <<<"$EARLY_HOME" >/dev/null || fail "Student Learning did not resolve Pre-Nursery canonical grade"
jq -e '.data.recommendedResources | any(.title=="Let us learn primary colours")' <<<"$EARLY_HOME" >/dev/null || fail "Imported early-years resource was not recommended to Pre-Nursery learner"
jq -e '.data.recommendedResources | all(.title!="Class 8 Science Quick Guide")' <<<"$EARLY_HOME" >/dev/null || fail "Class 8 content leaked into Pre-Nursery recommendations"
jq -e '.data.assessments | length==0' <<<"$EARLY_HOME" >/dev/null || fail "Formal scored assessments must not be recommended to Pre-Nursery learners"

log "Question rows are mapped to canonical grades"
QUESTIONS="$(curl -fsS "${AUTH[@]}" "$API_BASE/admin/learning/questions")"
jq -e '.data | any(.public_code=="VSC5M-Q001") and any(.public_code=="VSC8M-Q001")' <<<"$QUESTIONS" >/dev/null || fail "Imported Class 5/Class 8 questions missing"

log "Unsafe NROER domain is staged INVALID and cannot be committed"
BAD_FILE="/tmp/vidyasetu-bad-nroer.json"
cat > "$BAD_FILE" <<'JSON'
{"rows":[{"record_type":"RESOURCE","import_key":"CI-BAD-NROER-001","grade_codes":"CLASS_5","board_codes":"COMMON","title":"Spoofed NROER","body_markdown":"Unsafe test","resource_type":"ARTICLE","category":"ACADEMIC","visibility":"PUBLIC","review_status":"PUBLISHED","source_code":"NROER","source_url":"https://example.com/?next=nroer.gov.in/resource","licence":"CC_BY_SA","attribution_text":"Test attribution"}]}
JSON
BAD_STAGE="$(curl -fsS -X POST "${AUTH[@]}" -F "file=@$BAD_FILE;type=application/json" "$API_BASE/admin/learning/imports/stage")"
BAD_BATCH="$(jq -er '.data.id' <<<"$BAD_STAGE")"
jq -e '.data.error_rows==1 and .data.valid_rows==0 and (.data.rows[0].errors | any(test("nroer.gov.in")))' <<<"$BAD_STAGE" >/dev/null || fail "Spoofed NROER URL was not rejected during validation"
BAD_COMMIT_CODE="$(curl -sS -o /tmp/bad-import-commit.json -w '%{http_code}' -X POST "${AUTH[@]}" "$API_BASE/admin/learning/imports/$BAD_BATCH/commit")"
[[ "$BAD_COMMIT_CODE" == "400" ]] || fail "Invalid import batch must not commit"

log "Duplicate import keys inside one upload are rejected"
DUP_FILE="/tmp/vidyasetu-duplicate-import.json"
cat > "$DUP_FILE" <<'JSON'
{"rows":[
 {"record_type":"RESOURCE","import_key":"CI-DUP-001","grade_codes":"CLASS_5","board_codes":"COMMON","title":"Duplicate One","body_markdown":"One","resource_type":"ARTICLE","category":"ACADEMIC","visibility":"REGISTERED","review_status":"DRAFT","source_code":"VIDYASETU_ORIGINAL","licence":"VIDYASETU_ORIGINAL"},
 {"record_type":"RESOURCE","import_key":"CI-DUP-001","grade_codes":"CLASS_8","board_codes":"COMMON","title":"Duplicate Two","body_markdown":"Two","resource_type":"ARTICLE","category":"ACADEMIC","visibility":"REGISTERED","review_status":"DRAFT","source_code":"VIDYASETU_ORIGINAL","licence":"VIDYASETU_ORIGINAL"}
]}
JSON
DUP_STAGE="$(curl -fsS -X POST "${AUTH[@]}" -F "file=@$DUP_FILE;type=application/json" "$API_BASE/admin/learning/imports/stage")"
jq -e '.data.error_rows==2 and (.data.rows | all(.validation_status=="INVALID"))' <<<"$DUP_STAGE" >/dev/null || fail "Duplicate import keys were not rejected"

log "Previously imported keys cannot be imported a second time"
C5_REPEAT="$(curl -fsS -X POST "${AUTH[@]}" -F "file=@$C5_FILE;type=text/csv" "$API_BASE/admin/learning/imports/stage")"
jq -e '.data.error_rows==2 and (.data.rows | all(.errors | any(test("already exists"))))' <<<"$C5_REPEAT" >/dev/null || fail "Existing import keys were not blocked"

printf '\nGlobal Learning Bulk Importer E2E smoke passed.\n'