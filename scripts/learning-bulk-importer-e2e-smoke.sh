#!/usr/bin/env bash
set -Eeuo pipefail

API_BASE="${API_BASE:-http://127.0.0.1:5000/api/v1}"
ADMIN_MOBILE="${ADMIN_MOBILE:-9000000000}"
EARLY_STUDENT_MOBILE="${EARLY_STUDENT_MOBILE:-9888800023}"
STAMP="$(date +%s)-$RANDOM"

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

log "Importer is Admin-only and advertises Content V3 governance"
NOAUTH="$(curl -sS -o /tmp/import-noauth.json -w '%{http_code}' "$API_BASE/admin/learning/imports")"
[[ "$NOAUTH" == "401" ]] || fail "Importer without authentication must return 401, got $NOAUTH"
OPTIONS="$(curl -fsS "${AUTH[@]}" "$API_BASE/admin/learning/imports/options")"
jq -e '.success==true and (.data.grades|length==16) and .data.contract.draftOnly==true and .data.contract.canonicalGradesRequired==true and (.data.contract.languages==["en","hi"])' <<<"$OPTIONS" >/dev/null \
  || fail "Content V3 importer contract is incomplete"
for grade in PRE_NURSERY NURSERY LKG UKG CLASS_1 CLASS_5 CLASS_8 CLASS_12; do
  jq -e --arg grade "$grade" '.data.grades | any(.code==$grade)' <<<"$OPTIONS" >/dev/null || fail "Missing grade $grade"
done

stage_template(){
  local sample="$1" outfile="$2"
  curl -fsS "${AUTH[@]}" "$API_BASE/admin/learning/imports/template?format=csv&sample=$sample" -o "$outfile"
  test -s "$outfile" || fail "$sample template is empty"
  curl -fsS -X POST "${AUTH[@]}" -F "file=@$outfile;type=text/csv" "$API_BASE/admin/learning/imports/stage"
}

log "Class 5 template validates without mutating Learning before commit"
C5_FILE="/tmp/vidyasetu-class5-import.csv"
C5_STAGE="$(stage_template CLASS_5 "$C5_FILE")"
C5_BATCH="$(jq -er '.data.id' <<<"$C5_STAGE")"
jq -e '.data.total_rows==1 and .data.valid_rows==1 and .data.error_rows==0 and .data.imported_rows==0' <<<"$C5_STAGE" >/dev/null \
  || fail "Class 5 template did not validate cleanly"
C5_BEFORE="$(curl -fsS "${AUTH[@]}" "$API_BASE/admin/learning/questions?grade=CLASS_5")"
jq -e '.data | all(.public_code!="VSC5M-Q001")' <<<"$C5_BEFORE" >/dev/null || fail "Class 5 import mutated Question Bank before commit"

log "Admin commits Class 5 batch as governed DRAFT content"
C5_COMMIT="$(curl -fsS -X POST "${AUTH[@]}" "$API_BASE/admin/learning/imports/$C5_BATCH/commit")"
jq -e '.data.status=="COMPLETED" and .data.imported_rows==1 and .data.summary.draftOnly==true' <<<"$C5_COMMIT" >/dev/null \
  || fail "Class 5 batch did not complete under DRAFT-only governance"
C5_ADMIN="$(curl -fsS "${AUTH[@]}" "$API_BASE/admin/learning/questions?grade=CLASS_5")"
jq -e '.data | any(.public_code=="VSC5M-Q001" and .review_status=="DRAFT" and ((.grade_codes // []) | index("CLASS_5") != null))' <<<"$C5_ADMIN" >/dev/null \
  || fail "Imported Class 5 question is not a canonical-grade DRAFT"

log "Class 8 template follows the same canonical DRAFT-only importer"
C8_FILE="/tmp/vidyasetu-class8-import.csv"
C8_STAGE="$(stage_template CLASS_8 "$C8_FILE")"
C8_BATCH="$(jq -er '.data.id' <<<"$C8_STAGE")"
jq -e '.data.total_rows==1 and .data.valid_rows==1 and .data.error_rows==0' <<<"$C8_STAGE" >/dev/null || fail "Class 8 template did not validate cleanly"
C8_COMMIT="$(curl -fsS -X POST "${AUTH[@]}" "$API_BASE/admin/learning/imports/$C8_BATCH/commit")"
jq -e '.data.status=="COMPLETED" and .data.imported_rows==1' <<<"$C8_COMMIT" >/dev/null || fail "Class 8 batch did not complete"
C8_ADMIN="$(curl -fsS "${AUTH[@]}" "$API_BASE/admin/learning/questions?grade=CLASS_8")"
jq -e '.data | any(.public_code=="VSC8M-Q001" and .review_status=="DRAFT" and ((.grade_codes // []) | index("CLASS_8") != null))' <<<"$C8_ADMIN" >/dev/null \
  || fail "Imported Class 8 question is not a canonical-grade DRAFT"

log "Nursery template validates and commits without leaking to Public Learn"
EY_FILE="/tmp/vidyasetu-early-years-import.csv"
EY_STAGE="$(stage_template EARLY_YEARS "$EY_FILE")"
EY_BATCH="$(jq -er '.data.id' <<<"$EY_STAGE")"
jq -e '.data.total_rows==1 and .data.valid_rows==1 and .data.error_rows==0 and .data.rows[0].normalized_payload.gradeCodes==["NURSERY"]' <<<"$EY_STAGE" >/dev/null \
  || fail "Nursery template did not validate with canonical grade mapping"
EY_COMMIT="$(curl -fsS -X POST "${AUTH[@]}" "$API_BASE/admin/learning/imports/$EY_BATCH/commit")"
EY_RESOURCE_ID="$(jq -er '.data.rows[0].imported_resource_id' <<<"$EY_COMMIT")"
jq -e '.data.status=="COMPLETED" and .data.imported_rows==1' <<<"$EY_COMMIT" >/dev/null || fail "Nursery batch did not complete"
ADMIN_RESOURCES="$(curl -fsS "${AUTH[@]}" "$API_BASE/admin/learning/resources")"
jq -e --arg id "$EY_RESOURCE_ID" '.data | any(.id==$id and .review_status=="DRAFT")' <<<"$ADMIN_RESOURCES" >/dev/null \
  || fail "Imported Nursery resource is not DRAFT"
NURSERY_PUBLIC="$(curl -fsS "$API_BASE/public/learning/resources?grade=NURSERY&q=Find%20the%20red%20object&limit=50")"
jq -e '.data | all(.title!="Find the red object")' <<<"$NURSERY_PUBLIC" >/dev/null || fail "DRAFT Nursery import leaked into Public Learn"

log "Custom Pre-Nursery bilingual row proves earliest canonical grade import"
PN_FILE="/tmp/vidyasetu-pre-nursery-import.json"
cat > "$PN_FILE" <<JSON
{"rows":[{
  "record_type":"RESOURCE",
  "import_key":"CI-PN-WELLBEING-$STAMP",
  "grade_codes":"PRE_NURSERY",
  "board_codes":"COMMON",
  "journey_stage":"SEE",
  "source_code":"VIDYASETU_ORIGINAL",
  "licence":"VIDYASETU_ORIGINAL",
  "visibility":"REGISTERED",
  "title":"CI Pre-Nursery healthy habits $STAMP",
  "title_hi":"सीआई प्री-नर्सरी स्वस्थ आदतें",
  "summary":"A disposable bilingual early-years wellbeing activity.",
  "summary_hi":"प्रारंभिक वर्षों के लिए अस्थायी द्विभाषी स्वास्थ्य गतिविधि।",
  "body_markdown":"Point to one healthy habit you do every day.",
  "body_markdown_hi":"हर दिन की जाने वाली एक स्वस्थ आदत बताइए।",
  "resource_type":"ACTIVITY",
  "category":"WELLBEING"
}]}
JSON
PN_STAGE="$(curl -fsS -X POST "${AUTH[@]}" -F "file=@$PN_FILE;type=application/json" "$API_BASE/admin/learning/imports/stage")"
PN_BATCH="$(jq -er '.data.id' <<<"$PN_STAGE")"
jq -e '.data.total_rows==1 and .data.valid_rows==1 and .data.error_rows==0 and .data.rows[0].normalized_payload.gradeCodes==["PRE_NURSERY"]' <<<"$PN_STAGE" >/dev/null \
  || fail "Pre-Nursery row did not validate"
PN_COMMIT="$(curl -fsS -X POST "${AUTH[@]}" "$API_BASE/admin/learning/imports/$PN_BATCH/commit")"
PN_RESOURCE_ID="$(jq -er '.data.rows[0].imported_resource_id' <<<"$PN_COMMIT")"
jq -e '.data.status=="COMPLETED" and .data.imported_rows==1' <<<"$PN_COMMIT" >/dev/null || fail "Pre-Nursery batch did not complete"
ADMIN_RESOURCES="$(curl -fsS "${AUTH[@]}" "$API_BASE/admin/learning/resources")"
jq -e --arg id "$PN_RESOURCE_ID" '.data | any(.id==$id and .review_status=="DRAFT")' <<<"$ADMIN_RESOURCES" >/dev/null \
  || fail "Imported Pre-Nursery resource is not DRAFT"
PN_PUBLIC="$(curl -fsS "$API_BASE/public/learning/resources?grade=PRE_NURSERY&limit=100")"
jq -e --arg title "CI Pre-Nursery healthy habits $STAMP" '.data | all(.title!=$title)' <<<"$PN_PUBLIC" >/dev/null \
  || fail "DRAFT Pre-Nursery import leaked into Public Learn"

log "Logged-in Pre-Nursery learner keeps canonical grade and cannot see importer DRAFTs"
EARLY_TOKEN="$(login_new_student "$EARLY_STUDENT_MOBILE")"
EARLY_AUTH=(-H "Authorization: Bearer $EARLY_TOKEN")
curl -fsS -X POST "${EARLY_AUTH[@]}" "$API_BASE/student/profile/complete" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Importer Early Learner","language":"en","gradeLevel":"PN"}' \
  | jq -e '.success==true and .data.student.gradeLevel=="PN"' >/dev/null || fail "Could not create Pre-Nursery Student profile"
EARLY_HOME="$(curl -fsS "${EARLY_AUTH[@]}" "$API_BASE/student/learning/home")"
jq -e '.data.learner.gradeCode=="PRE_NURSERY" and .data.learner.gradeLabel=="Pre-Nursery"' <<<"$EARLY_HOME" >/dev/null \
  || fail "Student Learning did not resolve Pre-Nursery canonical grade"
jq -e --arg title "CI Pre-Nursery healthy habits $STAMP" '.data.recommendedResources | all(.title!=$title)' <<<"$EARLY_HOME" >/dev/null \
  || fail "Importer DRAFT leaked into Pre-Nursery recommendations"
jq -e '.data.recommendedResources | all(.title!="Class 8 Science Quick Guide")' <<<"$EARLY_HOME" >/dev/null \
  || fail "Class 8 content leaked into Pre-Nursery recommendations"
jq -e '.data.assessments | length==0' <<<"$EARLY_HOME" >/dev/null || fail "Formal scored assessments must not be recommended to Pre-Nursery learners"

log "Unsafe NROER domain is staged INVALID and cannot be committed"
BAD_FILE="/tmp/vidyasetu-bad-nroer.json"
cat > "$BAD_FILE" <<'JSON'
{"rows":[{"record_type":"RESOURCE","import_key":"CI-BAD-NROER-001","grade_codes":"CLASS_5","board_codes":"COMMON","title":"Spoofed NROER","title_hi":"नकली एनआरओईआर","summary":"Unsafe domain certification row.","summary_hi":"असुरक्षित डोमेन परीक्षण पंक्ति।","body_markdown":"Unsafe test","body_markdown_hi":"असुरक्षित परीक्षण","resource_type":"ARTICLE","category":"ACADEMIC","visibility":"PUBLIC","review_status":"PUBLISHED","source_code":"NROER","source_url":"https://example.com/?next=nroer.gov.in/resource","licence":"CC_BY_SA","attribution_text":"Test attribution"}]}
JSON
BAD_STAGE="$(curl -fsS -X POST "${AUTH[@]}" -F "file=@$BAD_FILE;type=application/json" "$API_BASE/admin/learning/imports/stage")"
BAD_BATCH="$(jq -er '.data.id' <<<"$BAD_STAGE")"
jq -e '.data.error_rows==1 and .data.valid_rows==0 and (.data.rows[0].errors | any(test("nroer.gov.in"; "i")))' <<<"$BAD_STAGE" >/dev/null \
  || fail "Spoofed NROER URL was not rejected during validation"
BAD_COMMIT_CODE="$(curl -sS -o /tmp/bad-import-commit.json -w '%{http_code}' -X POST "${AUTH[@]}" "$API_BASE/admin/learning/imports/$BAD_BATCH/commit")"
[[ "$BAD_COMMIT_CODE" == "400" ]] || fail "Invalid import batch must not commit"

log "Duplicate import keys inside one upload are rejected"
DUP_FILE="/tmp/vidyasetu-duplicate-import.json"
cat > "$DUP_FILE" <<'JSON'
{"rows":[
 {"record_type":"RESOURCE","import_key":"CI-DUP-001","grade_codes":"CLASS_5","board_codes":"COMMON","title":"Duplicate One","title_hi":"डुप्लिकेट एक","summary":"Duplicate certification one.","summary_hi":"डुप्लिकेट परीक्षण एक।","body_markdown":"One","body_markdown_hi":"एक","resource_type":"ACTIVITY","category":"WELLBEING","visibility":"REGISTERED","review_status":"DRAFT","source_code":"VIDYASETU_ORIGINAL","licence":"VIDYASETU_ORIGINAL"},
 {"record_type":"RESOURCE","import_key":"CI-DUP-001","grade_codes":"CLASS_8","board_codes":"COMMON","title":"Duplicate Two","title_hi":"डुप्लिकेट दो","summary":"Duplicate certification two.","summary_hi":"डुप्लिकेट परीक्षण दो।","body_markdown":"Two","body_markdown_hi":"दो","resource_type":"ACTIVITY","category":"WELLBEING","visibility":"REGISTERED","review_status":"DRAFT","source_code":"VIDYASETU_ORIGINAL","licence":"VIDYASETU_ORIGINAL"}
]}
JSON
DUP_STAGE="$(curl -fsS -X POST "${AUTH[@]}" -F "file=@$DUP_FILE;type=application/json" "$API_BASE/admin/learning/imports/stage")"
jq -e '.data.error_rows==1 and .data.valid_rows==1 and (.data.rows | any(.errors | any(test("Duplicate import_key"))))' <<<"$DUP_STAGE" >/dev/null \
  || fail "Duplicate import key was not rejected"
DUP_COMMIT_CODE="$(curl -sS -o /tmp/dup-import-commit.json -w '%{http_code}' -X POST "${AUTH[@]}" "$API_BASE/admin/learning/imports/$(jq -er '.data.id' <<<"$DUP_STAGE")/commit")"
[[ "$DUP_COMMIT_CODE" == "400" ]] || fail "Partially invalid duplicate batch must not commit"

log "Previously imported keys cannot be imported a second time"
C5_REPEAT="$(curl -fsS -X POST "${AUTH[@]}" -F "file=@$C5_FILE;type=text/csv" "$API_BASE/admin/learning/imports/stage")"
jq -e '.data.error_rows==1 and .data.valid_rows==0 and (.data.rows[0].errors | any(test("already exists")))' <<<"$C5_REPEAT" >/dev/null \
  || fail "Existing import key was not blocked"

printf '\nContent Platform 3.0 Global Learning Bulk Importer E2E smoke passed.\n'