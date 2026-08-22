#!/usr/bin/env bash
set -Eeuo pipefail

API_BASE="${API_BASE:-http://127.0.0.1:5000/api/v1}"
DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-vidyasetu_db}"
DB_USER="${DB_USER:-postgres}"
export PGPASSWORD="${DB_PASSWORD:-postgres}"

PARENT_MOBILE="${PARENT_MOBILE:-9400000001}"
SCHOOL_ADMIN_MOBILE="${SCHOOL_ADMIN_MOBILE:-9100000001}"
ADMIN_MOBILE="${ADMIN_MOBILE:-9000000000}"
OTHER_PARENT_MOBILE="9499999998"
OTHER_SCHOOL_ADMIN_MOBILE="9199999998"
TEACHER_MOBILE="9299999998"
PRIMARY_SCHOOL_ID="10000000-0000-0000-0000-000000000001"
OTHER_SCHOOL_ID="98010000-0000-0000-0000-000000000001"
OTHER_SCHOOL_ADMIN_ID="98000000-0000-0000-0000-000000000001"
TEACHER_USER_ID="98000000-0000-0000-0000-000000000002"
OTHER_PARENT_ID="98000000-0000-0000-0000-000000000003"

log(){ printf '\n==> %s\n' "$*"; }
fail(){ printf '\nFAILED: %s\n' "$*" >&2; exit 1; }
json_get(){ jq -er "$2" <<<"$1"; }
psqlq(){ psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -Atc "$1"; }

request(){
  local method="$1" url="$2" body="${3:-}" token="${4:-}"
  local args=(-fsS -X "$method" "$url" -H 'Content-Type: application/json')
  [[ -n "$token" ]] && args+=(-H "Authorization: Bearer $token")
  [[ -n "$body" ]] && args+=(-d "$body")
  curl "${args[@]}"
}

expect_status(){
  local expected="$1" method="$2" url="$3" body="${4:-}" token="${5:-}"
  local tmp code
  tmp="$(mktemp)"
  local args=(-sS -o "$tmp" -w '%{http_code}' -X "$method" "$url" -H 'Content-Type: application/json')
  [[ -n "$token" ]] && args+=(-H "Authorization: Bearer $token")
  [[ -n "$body" ]] && args+=(-d "$body")
  code="$(curl "${args[@]}")"
  LAST_BODY="$(cat "$tmp")"; rm -f "$tmp"
  [[ "$code" == "$expected" ]] || fail "$method $url expected HTTP $expected, got $code: $LAST_BODY"
}

otp_session(){
  local mobile="$1" role="$2" send otp
  send="$(request POST "$API_BASE/auth/send-otp" "$(jq -nc --arg m "$mobile" '{mobile:$m}')")"
  otp="$(json_get "$send" '.data.otp')"
  [[ "$otp" =~ ^[0-9]{6}$ ]] || fail "Development OTP missing for $mobile"
  request POST "$API_BASE/auth/verify-otp" "$(jq -nc --arg m "$mobile" --arg o "$otp" --arg r "$role" '{mobile:$m,otp:$o,role:$r,deviceInfo:"grievance-e2e"}')"
}

log "Create isolation identities in disposable database"
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 <<SQL
INSERT INTO users (id,mobile,name,role,status,language)
VALUES
 ('$OTHER_SCHOOL_ADMIN_ID','$OTHER_SCHOOL_ADMIN_MOBILE','Other School Admin','SCHOOL_ADMIN','ACTIVE','en'),
 ('$TEACHER_USER_ID','$TEACHER_MOBILE','Grievance Test Teacher','TEACHER','ACTIVE','en'),
 ('$OTHER_PARENT_ID','$OTHER_PARENT_MOBILE','Other Parent','PARENT','ACTIVE','en')
ON CONFLICT (id) DO NOTHING;

INSERT INTO schools (id,name,admin_user_id,status,state,academic_year)
VALUES ('$OTHER_SCHOOL_ID','Other Isolation School','$OTHER_SCHOOL_ADMIN_ID','ACTIVE','Uttar Pradesh','2026-27')
ON CONFLICT (id) DO NOTHING;
SQL

log "Authenticate Parent, School Admin, Platform Admin and isolation roles"
PARENT_TOKEN="$(json_get "$(otp_session "$PARENT_MOBILE" PARENT)" '.data.accessToken')"
SCHOOL_TOKEN="$(json_get "$(otp_session "$SCHOOL_ADMIN_MOBILE" SCHOOL_ADMIN)" '.data.accessToken')"
ADMIN_TOKEN="$(json_get "$(otp_session "$ADMIN_MOBILE" SUPER_ADMIN)" '.data.accessToken')"
OTHER_PARENT_TOKEN="$(json_get "$(otp_session "$OTHER_PARENT_MOBILE" PARENT)" '.data.accessToken')"
OTHER_SCHOOL_TOKEN="$(json_get "$(otp_session "$OTHER_SCHOOL_ADMIN_MOBILE" SCHOOL_ADMIN)" '.data.accessToken')"
TEACHER_TOKEN="$(json_get "$(otp_session "$TEACHER_MOBILE" TEACHER)" '.data.accessToken')"

log "Resolve an approved linked child and an unlinked child"
CHILDREN="$(request GET "$API_BASE/parent/children" '' "$PARENT_TOKEN")"
CHILD_ID="$(jq -er '[.data[] | select(.school_link_status == "APPROVED")][0].id' <<<"$CHILDREN")"
[[ -n "$CHILD_ID" ]] || fail "No approved linked child available"
PARENT_USER_ID="$(psqlq "SELECT id FROM users WHERE mobile='$PARENT_MOBILE' LIMIT 1;")"
UNLINKED_CHILD="$(psqlq "SELECT s.id FROM students s WHERE NOT EXISTS (SELECT 1 FROM parent_student_links p WHERE p.parent_user_id='$PARENT_USER_ID'::uuid AND p.student_id=s.id) LIMIT 1;")"
[[ -n "$UNLINKED_CHILD" ]] || fail "No unlinked Student available for isolation test"

log "Parent cannot raise concern for unlinked child"
BAD_CREATE="$(jq -nc --arg sid "$UNLINKED_CHILD" '{studentId:$sid,category:"ACADEMICS",priority:"NORMAL",subject:"Unauthorised concern",description:"This concern must be rejected because the child is not linked."}')"
expect_status 403 POST "$API_BASE/parent/grievances" "$BAD_CREATE" "$PARENT_TOKEN"

log "Other Parent cannot raise concern for Parent's child"
BAD_OTHER="$(jq -nc --arg sid "$CHILD_ID" '{studentId:$sid,category:"ATTENDANCE",priority:"NORMAL",subject:"Cross parent attempt",description:"This concern must be rejected because this child belongs to another Parent account."}')"
expect_status 403 POST "$API_BASE/parent/grievances" "$BAD_OTHER" "$OTHER_PARENT_TOKEN"

log "Parent creates formal school concern"
CREATE_BODY="$(jq -nc --arg sid "$CHILD_ID" '{studentId:$sid,category:"ATTENDANCE",priority:"HIGH",subject:"Attendance record needs review",description:"The Parent requests a formal review of an attendance record and a written school response."}')"
CREATED="$(request POST "$API_BASE/parent/grievances" "$CREATE_BODY" "$PARENT_TOKEN")"
GID="$(json_get "$CREATED" '.data.id')"
TICKET="$(json_get "$CREATED" '.data.ticket_number')"
[[ "$(json_get "$CREATED" '.data.status')" == "OPEN" ]] || fail "New concern is not OPEN"
[[ "$TICKET" =~ ^VG-[0-9]{8}-[A-Z0-9]{8}$ ]] || fail "Ticket number format invalid: $TICKET"
[[ "$(json_get "$CREATED" '.data.school_id')" == "$PRIMARY_SCHOOL_ID" ]] || fail "Concern routed to wrong school"
[[ -n "$(json_get "$CREATED" '.data.assigned_to')" ]] || fail "Concern was not assigned to School Admin"

log "Parent and School isolation"
expect_status 404 GET "$API_BASE/parent/grievances/$GID" '' "$OTHER_PARENT_TOKEN"
expect_status 404 GET "$API_BASE/school/grievances/$GID" '' "$OTHER_SCHOOL_TOKEN"
expect_status 403 GET "$API_BASE/school/grievances" '' "$TEACHER_TOKEN"

log "School sees, acknowledges and starts review"
SCHOOL_LIST="$(request GET "$API_BASE/school/grievances" '' "$SCHOOL_TOKEN")"
[[ "$(jq -r --arg id "$GID" '[.data[]|select(.id==$id)]|length' <<<"$SCHOOL_LIST")" == "1" ]] || fail "School cannot see Parent concern"
ACK="$(request PATCH "$API_BASE/school/grievances/$GID/action" '{"action":"ACKNOWLEDGE","note":"School received the concern"}' "$SCHOOL_TOKEN")"
[[ "$(json_get "$ACK" '.data.status')" == "ACKNOWLEDGED" ]] || fail "Acknowledgement failed"
START="$(request PATCH "$API_BASE/school/grievances/$GID/action" '{"action":"START","note":"Attendance register review started"}' "$SCHOOL_TOKEN")"
[[ "$(json_get "$START" '.data.status')" == "IN_PROGRESS" ]] || fail "Start-review failed"

log "School visible reply and hidden internal note"
request POST "$API_BASE/school/grievances/$GID/replies" '{"body":"We are reviewing the class attendance register.","internal":false}' "$SCHOOL_TOKEN" >/dev/null
request POST "$API_BASE/school/grievances/$GID/replies" '{"body":"Internal note: verify register with class teacher.","internal":true}' "$SCHOOL_TOKEN" >/dev/null
PARENT_DETAIL="$(request GET "$API_BASE/parent/grievances/$GID" '' "$PARENT_TOKEN")"
[[ "$(jq -r '[.data.messages[]|select(.body=="We are reviewing the class attendance register.")]|length' <<<"$PARENT_DETAIL")" == "1" ]] || fail "Visible School reply missing from Parent"
[[ "$(jq -r '[.data.messages[]|select(.body|contains("Internal note"))]|length' <<<"$PARENT_DETAIL")" == "0" ]] || fail "Internal School note leaked to Parent"
SCHOOL_DETAIL="$(request GET "$API_BASE/school/grievances/$GID" '' "$SCHOOL_TOKEN")"
[[ "$(jq -r '[.data.messages[]|select(.is_internal==true)]|length' <<<"$SCHOOL_DETAIL")" -ge 1 ]] || fail "Internal note missing for School"

log "Resolution requires actual resolution text"
expect_status 400 PATCH "$API_BASE/school/grievances/$GID/action" '{"action":"RESOLVE"}' "$SCHOOL_TOKEN"
RESOLVED="$(request PATCH "$API_BASE/school/grievances/$GID/action" '{"action":"RESOLVE","note":"Attendance register was corrected and the class record has been reconciled."}' "$SCHOOL_TOKEN")"
[[ "$(json_get "$RESOLVED" '.data.status')" == "RESOLVED" ]] || fail "School resolution failed"
[[ "$(json_get "$RESOLVED" '.data.resolution')" == "Attendance register was corrected and the class record has been reconciled." ]] || fail "Resolution text not stored"

log "Parent closes, reopens and escalates"
CLOSED="$(request PATCH "$API_BASE/parent/grievances/$GID/action" '{"action":"CLOSE","note":"Parent initially accepted the resolution"}' "$PARENT_TOKEN")"
[[ "$(json_get "$CLOSED" '.data.status')" == "CLOSED" ]] || fail "Parent close failed"
REOPENED="$(request PATCH "$API_BASE/parent/grievances/$GID/action" '{"action":"REOPEN","note":"Parent found the issue still visible in the record"}' "$PARENT_TOKEN")"
[[ "$(json_get "$REOPENED" '.data.status')" == "IN_PROGRESS" ]] || fail "Parent reopen failed"
[[ "$(json_get "$REOPENED" '.data.reopen_count | tonumber')" == "1" ]] || fail "Reopen count did not increment"
ESCALATED="$(request PATCH "$API_BASE/parent/grievances/$GID/action" '{"action":"ESCALATE","note":"Please review at Platform level"}' "$PARENT_TOKEN")"
[[ "$(json_get "$ESCALATED" '.data.status')" == "ESCALATED" ]] || fail "Parent escalation failed"

log "School cannot downgrade an escalated concern"
expect_status 409 PATCH "$API_BASE/school/grievances/$GID/action" '{"action":"START","note":"School attempts to restart review"}' "$SCHOOL_TOKEN"

log "Platform Admin oversight, internal note and visible reply"
ADMIN_LIST="$(request GET "$API_BASE/admin/grievances?status=ESCALATED" '' "$ADMIN_TOKEN")"
[[ "$(jq -r --arg id "$GID" '[.data[]|select(.id==$id)]|length' <<<"$ADMIN_LIST")" == "1" ]] || fail "Escalated grievance absent from Admin oversight"
request POST "$API_BASE/admin/grievances/$GID/replies" '{"body":"Internal Admin note: review SLA and school response.","internal":true}' "$ADMIN_TOKEN" >/dev/null
request POST "$API_BASE/admin/grievances/$GID/replies" '{"body":"Platform Admin has accepted the escalation for review.","internal":false}' "$ADMIN_TOKEN" >/dev/null
PARENT_AFTER_ADMIN="$(request GET "$API_BASE/parent/grievances/$GID" '' "$PARENT_TOKEN")"
[[ "$(jq -r '[.data.messages[]|select(.body=="Platform Admin has accepted the escalation for review.")]|length' <<<"$PARENT_AFTER_ADMIN")" == "1" ]] || fail "Admin public reply missing from Parent"
[[ "$(jq -r '[.data.messages[]|select(.body|contains("Internal Admin note"))]|length' <<<"$PARENT_AFTER_ADMIN")" == "0" ]] || fail "Internal Admin note leaked to Parent"
ADMIN_DETAIL="$(request GET "$API_BASE/admin/grievances/$GID" '' "$ADMIN_TOKEN")"
[[ "$(jq -r '[.data.messages[]|select(.is_internal==true)]|length' <<<"$ADMIN_DETAIL")" -ge 2 ]] || fail "Admin cannot see internal notes"

log "Platform Admin resolves escalated concern"
ADMIN_RESOLVED="$(request PATCH "$API_BASE/admin/grievances/$GID/status" '{"status":"RESOLVED","note":"Platform review completed; school and Parent records were reconciled."}' "$ADMIN_TOKEN")"
[[ "$(json_get "$ADMIN_RESOLVED" '.data.status')" == "RESOLVED" ]] || fail "Admin resolution failed"

log "Notifications and immutable history"
NOTIFICATION_COUNT="$(psqlq "SELECT COUNT(*) FROM notifications WHERE reference_id='$GID'::uuid AND reference_type='GRIEVANCE';")"
(( NOTIFICATION_COUNT >= 6 )) || fail "Expected grievance notifications were not created"
for action in SUBMITTED ACKNOWLEDGE START SCHOOL_REPLY INTERNAL_NOTE CLOSE REOPEN ESCALATE ADMIN_INTERNAL_NOTE ADMIN_REPLY ADMIN_STATUS; do
  COUNT="$(psqlq "SELECT COUNT(*) FROM grievance_history WHERE grievance_id='$GID'::uuid AND action='$action';")"
  (( COUNT >= 1 )) || fail "Missing history action: $action"
done

log "Database invariants"
[[ "$(psqlq "SELECT COUNT(*) FROM parent_grievances g JOIN students s ON s.id=g.student_id WHERE g.school_id<>s.school_id OR s.school_link_status<>'APPROVED';")" == "0" ]] || fail "Grievance school/student invariant failed"
[[ "$(psqlq "SELECT COUNT(*) FROM parent_grievances WHERE ticket_number IS NULL OR ticket_number='';")" == "0" ]] || fail "Blank grievance ticket exists"
[[ "$(psqlq "SELECT COUNT(*) FROM (SELECT ticket_number FROM parent_grievances GROUP BY ticket_number HAVING COUNT(*)>1) x;")" == "0" ]] || fail "Duplicate grievance ticket exists"
[[ "$(psqlq "SELECT COUNT(*) FROM grievance_messages gm LEFT JOIN parent_grievances g ON g.id=gm.grievance_id WHERE g.id IS NULL;")" == "0" ]] || fail "Orphan grievance message exists"
[[ "$(psqlq "SELECT COUNT(*) FROM grievance_history gh LEFT JOIN parent_grievances g ON g.id=gh.grievance_id WHERE g.id IS NULL;")" == "0" ]] || fail "Orphan grievance history exists"

log "Parent Concern & Grievance E2E passed"
