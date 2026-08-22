#!/usr/bin/env bash
set -Eeuo pipefail

API_BASE="${API_BASE:-http://127.0.0.1:5000/api/v1}"

ADMIN_MOBILE="${ADMIN_MOBILE:-9000000000}"
SCHOOL_ADMIN_MOBILE="${SCHOOL_ADMIN_MOBILE:-9100000001}"
TEACHER_MOBILE="${TEACHER_MOBILE:-9200000001}"
STUDENT1_MOBILE="${STUDENT1_MOBILE:-9300000001}"
STUDENT2_MOBILE="${STUDENT2_MOBILE:-9300000002}"
STUDENT3_MOBILE="${STUDENT3_MOBILE:-9300000003}"
STUDENT4_MOBILE="${STUDENT4_MOBILE:-9300000004}"
OUTSIDER_MOBILE="${OUTSIDER_MOBILE:-9300000005}"
PARENT1_MOBILE="${PARENT1_MOBILE:-9400000001}"
PARENT2_MOBILE="${PARENT2_MOBILE:-9400000002}"

STUDENT1_ID="00000000-0000-0000-0000-000000000020"
STUDENT2_ID="00000000-0000-0000-0000-000000000021"
STUDENT3_ID="00000000-0000-0000-0000-000000000022"
STUDENT4_ID="00000000-0000-0000-0000-000000000023"
OUTSIDER_ID="00000000-0000-0000-0000-000000000024"
SCHOOL_ADMIN_ID="00000000-0000-0000-0000-000000000002"
SCHOOL1_ID="10000000-0000-0000-0000-000000000001"
CLASS8A_ID="20000000-0000-0000-0000-000000000001"

log() { printf '\n==> %s\n' "$*"; }
fail() { printf '\nFAILED: %s\n' "$*" >&2; exit 1; }
json_get() { jq -er "$2" <<< "$1"; }

api_request() {
  local method="$1" url="$2" token="${3:-}" body="${4:-}"
  local args=(-fsS -X "$method" "$url")
  [[ -n "$token" ]] && args+=(-H "Authorization: Bearer $token")
  if [[ -n "$body" ]]; then
    args+=(-H 'Content-Type: application/json' -d "$body")
  fi
  curl "${args[@]}"
}

http_status() {
  local method="$1" url="$2" token="${3:-}" body="${4:-}"
  local args=(-sS -o /tmp/groups-e2e-body.json -w '%{http_code}' -X "$method" "$url")
  [[ -n "$token" ]] && args+=(-H "Authorization: Bearer $token")
  if [[ -n "$body" ]]; then
    args+=(-H 'Content-Type: application/json' -d "$body")
  fi
  curl "${args[@]}"
}

bearer_get() { api_request GET "$2" "$1"; }
api_post() { api_request POST "$1" "$3" "$2"; }
api_patch() { api_request PATCH "$1" "$3" "$2"; }
api_delete() { api_request DELETE "$1" "$2"; }

otp_session() {
  local mobile="$1" role="$2" send otp
  send="$(api_request POST "$API_BASE/auth/send-otp" '' "{\"mobile\":\"$mobile\"}")"
  otp="$(json_get "$send" '.data.otp')"
  [[ "$otp" =~ ^[0-9]{6}$ ]] || fail "Development OTP missing for $mobile"
  api_request POST "$API_BASE/auth/verify-otp" '' "$(jq -nc --arg mobile "$mobile" --arg otp "$otp" --arg role "$role" '{mobile:$mobile,otp:$otp,role:$role,deviceInfo:"groups-e2e"}')"
}

token_for() {
  local mobile="$1" role="$2" login
  login="$(otp_session "$mobile" "$role")"
  [[ "$(json_get "$login" '.data.user.role')" == "$role" ]] || fail "Role mismatch for $mobile"
  json_get "$login" '.data.accessToken'
}

admin_group_id() {
  local token="$1" name="$2" status="${3:-PENDING}" payload
  payload="$(bearer_get "$token" "$API_BASE/admin/groups?status=$status")"
  jq -er --arg name "$name" '.data[] | select(.name == $name) | .id' <<< "$payload" | head -n1
}

log "Authenticate all seeded roles"
ADMIN_TOKEN="$(token_for "$ADMIN_MOBILE" SUPER_ADMIN)"
SCHOOL_ADMIN_TOKEN="$(token_for "$SCHOOL_ADMIN_MOBILE" SCHOOL_ADMIN)"
TEACHER_TOKEN="$(token_for "$TEACHER_MOBILE" TEACHER)"
STUDENT1_TOKEN="$(token_for "$STUDENT1_MOBILE" STUDENT)"
STUDENT2_TOKEN="$(token_for "$STUDENT2_MOBILE" STUDENT)"
STUDENT3_TOKEN="$(token_for "$STUDENT3_MOBILE" STUDENT)"
STUDENT4_TOKEN="$(token_for "$STUDENT4_MOBILE" STUDENT)"
OUTSIDER_TOKEN="$(token_for "$OUTSIDER_MOBILE" STUDENT)"
PARENT1_TOKEN="$(token_for "$PARENT1_MOBILE" PARENT)"
PARENT2_TOKEN="$(token_for "$PARENT2_MOBILE" PARENT)"

log "Verify role-aware Group creation contexts"
STUDENT_CTX="$(bearer_get "$STUDENT1_TOKEN" "$API_BASE/groups/context")"
[[ "$(jq -r '.data.allowedKinds | join(",")' <<< "$STUDENT_CTX")" == "STUDENT" ]] || fail "Student context allows invalid Group kinds"
[[ "$(jq -r --arg id "$CLASS8A_ID" '[.data.classes[] | select(.id == $id)] | length' <<< "$STUDENT_CTX")" -eq 1 ]] || fail "Student Class context missing"

PARENT_CTX="$(bearer_get "$PARENT1_TOKEN" "$API_BASE/groups/context")"
[[ "$(jq -r '.data.allowedKinds | join(",")' <<< "$PARENT_CTX")" == "PARENT" ]] || fail "Parent context allows invalid Group kinds"

TEACHER_CTX="$(bearer_get "$TEACHER_TOKEN" "$API_BASE/groups/context")"
[[ "$(jq -r '[.data.allowedKinds[] | select(. == "TEACHER")] | length' <<< "$TEACHER_CTX")" -eq 1 ]] || fail "Teacher Group kind missing"
[[ "$(jq -r '[.data.allowedKinds[] | select(. == "MIXED")] | length' <<< "$TEACHER_CTX")" -eq 1 ]] || fail "Teacher Mixed Group kind missing"
[[ "$(jq -r --arg id "$CLASS8A_ID" '[.data.classes[] | select(.id == $id)] | length' <<< "$TEACHER_CTX")" -eq 1 ]] || fail "Teacher Class context missing"

SCHOOL_CTX="$(bearer_get "$SCHOOL_ADMIN_TOKEN" "$API_BASE/groups/context")"
[[ "$(jq -r '[.data.allowedKinds[] | select(. == "MIXED")] | length' <<< "$SCHOOL_CTX")" -eq 1 ]] || fail "School Admin Mixed Group kind missing"

log "Enforce creator role safety"
[[ "$(http_status POST "$API_BASE/groups" "$STUDENT1_TOKEN" '{"name":"Unsafe Mixed Student","kind":"MIXED","scope":"PRIVATE"}')" == "403" ]] || fail "Student was allowed to create a Mixed Group"
[[ "$(http_status POST "$API_BASE/groups" "$PARENT1_TOKEN" '{"name":"Unsafe Mixed Parent","kind":"MIXED","scope":"PRIVATE"}')" == "403" ]] || fail "Parent was allowed to create a Mixed Group"
[[ "$(http_status POST "$API_BASE/groups" "$SCHOOL_ADMIN_TOKEN" '{"name":"Unsafe Parent School","kind":"PARENT","scope":"PRIVATE"}')" == "403" ]] || fail "School Admin was allowed to create a Parent Group"

log "Student Group creation requires Admin approval"
STUDENT_GROUP_NAME="E2E Student Science Group"
STUDENT_GROUP="$(api_post "$API_BASE/groups" "$(jq -nc --arg name "$STUDENT_GROUP_NAME" '{name:$name,description:"Private student revision discussion",kind:"STUDENT",scope:"PRIVATE",maxMembers:20}')" "$STUDENT1_TOKEN")"
STUDENT_GROUP_ID="$(json_get "$STUDENT_GROUP" '.data.id')"
[[ "$(json_get "$STUDENT_GROUP" '.data.status')" == "PENDING" ]] || fail "New Student Group is not pending"
[[ "$(http_status GET "$API_BASE/groups/$STUDENT_GROUP_ID" "$STUDENT2_TOKEN")" == "404" ]] || fail "Unapproved Group is visible to another user"
DISCOVER_BEFORE="$(bearer_get "$STUDENT2_TOKEN" "$API_BASE/groups/discover")"
[[ "$(jq -r --arg id "$STUDENT_GROUP_ID" '[.data[] | select(.id == $id)] | length' <<< "$DISCOVER_BEFORE")" -eq 0 ]] || fail "Unapproved Group appears in discovery"

ADMIN_PENDING_ID="$(admin_group_id "$ADMIN_TOKEN" "$STUDENT_GROUP_NAME")"
[[ "$ADMIN_PENDING_ID" == "$STUDENT_GROUP_ID" ]] || fail "Admin cannot see pending Student Group"
api_patch "$API_BASE/admin/groups/$STUDENT_GROUP_ID/decision" '{"decision":"ACTIVE","note":"E2E approved"}' "$ADMIN_TOKEN" >/dev/null

DISCOVER_AFTER="$(bearer_get "$STUDENT2_TOKEN" "$API_BASE/groups/discover")"
[[ "$(jq -r --arg id "$STUDENT_GROUP_ID" '[.data[] | select(.id == $id)] | length' <<< "$DISCOVER_AFTER")" -eq 1 ]] || fail "Approved Student Group missing from discovery"
PARENT_DISCOVER="$(bearer_get "$PARENT1_TOKEN" "$API_BASE/groups/discover")"
[[ "$(jq -r --arg id "$STUDENT_GROUP_ID" '[.data[] | select(.id == $id)] | length' <<< "$PARENT_DISCOVER")" -eq 0 ]] || fail "Parent can discover Student-only Group"

log "Join request requires owner approval"
JOIN="$(api_post "$API_BASE/groups/$STUDENT_GROUP_ID/join-requests" '{"message":"Please add me"}' "$STUDENT2_TOKEN")"
JOIN_ID="$(json_get "$JOIN" '.data.id')"
[[ "$(http_status GET "$API_BASE/groups/$STUDENT_GROUP_ID/posts" "$STUDENT2_TOKEN")" == "403" ]] || fail "Pending requester can read Group feed"
JOIN_LIST="$(bearer_get "$STUDENT1_TOKEN" "$API_BASE/groups/$STUDENT_GROUP_ID/join-requests")"
[[ "$(jq -r --arg id "$JOIN_ID" '[.data[] | select(.id == $id)] | length' <<< "$JOIN_LIST")" -eq 1 ]] || fail "Owner cannot see join request"
api_patch "$API_BASE/groups/$STUDENT_GROUP_ID/join-requests/$JOIN_ID" '{"decision":"APPROVED"}' "$STUDENT1_TOKEN" >/dev/null
MEMBERS="$(bearer_get "$STUDENT1_TOKEN" "$API_BASE/groups/$STUDENT_GROUP_ID/members")"
[[ "$(jq -r --arg id "$STUDENT2_ID" '[.data[] | select(.user_id == $id and .role == "MEMBER")] | length' <<< "$MEMBERS")" -eq 1 ]] || fail "Approved requester did not become member"

log "Owner transfer works and current owner cannot leave"
api_patch "$API_BASE/groups/$STUDENT_GROUP_ID/owner" "$(jq -nc --arg id "$STUDENT2_ID" '{userId:$id}')" "$STUDENT1_TOKEN" >/dev/null
DETAIL_AFTER_TRANSFER="$(bearer_get "$STUDENT2_TOKEN" "$API_BASE/groups/$STUDENT_GROUP_ID")"
[[ "$(json_get "$DETAIL_AFTER_TRANSFER" '.data.membership_role')" == "OWNER" ]] || fail "Ownership transfer failed"
[[ "$(http_status POST "$API_BASE/groups/$STUDENT_GROUP_ID/leave" "$STUDENT2_TOKEN")" == "409" ]] || fail "Current owner was allowed to leave Group"

log "Member posting rules, comments, pinning and comment moderation"
[[ "$(http_status POST "$API_BASE/groups/$STUDENT_GROUP_ID/posts" "$STUDENT1_TOKEN" '{"body":"Member announcement should fail","isAnnouncement":true}')" == "403" ]] || fail "Ordinary member can publish announcements"
POST="$(api_post "$API_BASE/groups/$STUDENT_GROUP_ID/posts" '{"body":"Let us revise science chapter one together."}' "$STUDENT1_TOKEN")"
POST_ID="$(json_get "$POST" '.data.id')"
COMMENT="$(api_post "$API_BASE/groups/$STUDENT_GROUP_ID/posts/$POST_ID/comments" '{"body":"I will share my notes."}' "$STUDENT2_TOKEN")"
COMMENT_ID="$(json_get "$COMMENT" '.data.id')"
[[ "$(http_status DELETE "$API_BASE/groups/$STUDENT_GROUP_ID/comments/$COMMENT_ID" "$STUDENT1_TOKEN")" == "403" ]] || fail "Member removed another member comment"
api_delete "$API_BASE/groups/$STUDENT_GROUP_ID/comments/$COMMENT_ID" "$STUDENT2_TOKEN" >/dev/null
COMMENT2="$(api_post "$API_BASE/groups/$STUDENT_GROUP_ID/posts/$POST_ID/comments" '{"body":"Owner can moderate this comment."}' "$STUDENT1_TOKEN")"
COMMENT2_ID="$(json_get "$COMMENT2" '.data.id')"
api_delete "$API_BASE/groups/$STUDENT_GROUP_ID/comments/$COMMENT2_ID" "$STUDENT2_TOKEN" >/dev/null
api_patch "$API_BASE/groups/$STUDENT_GROUP_ID/posts/$POST_ID/pin" '{"pinned":true}' "$STUDENT2_TOKEN" >/dev/null
POSTS="$(bearer_get "$STUDENT2_TOKEN" "$API_BASE/groups/$STUDENT_GROUP_ID/posts")"
[[ "$(jq -r --arg id "$POST_ID" '.data[] | select(.id == $id) | .is_pinned' <<< "$POSTS")" == "true" ]] || fail "Owner pin did not persist"

log "Direct invitation requires recipient acceptance"
INVITE="$(api_post "$API_BASE/groups/$STUDENT_GROUP_ID/invitations" "$(jq -nc --arg id "$STUDENT3_ID" '{userId:$id,message:"Join our science group"}')" "$STUDENT2_TOKEN")"
INVITE_ID="$(json_get "$INVITE" '.data.id')"
[[ "$(json_get "$INVITE" '.data.status')" == "PENDING_RECIPIENT" ]] || fail "Owner invitation did not reach recipient approval state"
[[ "$(http_status GET "$API_BASE/groups/$STUDENT_GROUP_ID/posts" "$STUDENT3_TOKEN")" == "403" ]] || fail "Invited user became member before accepting"
INVITES3="$(bearer_get "$STUDENT3_TOKEN" "$API_BASE/groups/invitations")"
[[ "$(jq -r --arg id "$INVITE_ID" '[.data[] | select(.id == $id)] | length' <<< "$INVITES3")" -eq 1 ]] || fail "Recipient cannot see invitation"
api_patch "$API_BASE/groups/invitations/$INVITE_ID/respond" '{"decision":"ACCEPTED"}' "$STUDENT3_TOKEN" >/dev/null
bearer_get "$STUDENT3_TOKEN" "$API_BASE/groups/$STUDENT_GROUP_ID/posts" >/dev/null

log "Ordinary member nomination requires owner approval and recipient consent"
NOMINATION="$(api_post "$API_BASE/groups/$STUDENT_GROUP_ID/invitations" "$(jq -nc --arg id "$STUDENT4_ID" '{userId:$id,message:"Strong study partner"}')" "$STUDENT1_TOKEN")"
NOMINATION_ID="$(json_get "$NOMINATION" '.data.id')"
[[ "$(json_get "$NOMINATION" '.data.status')" == "PENDING_OWNER_APPROVAL" ]] || fail "Member nomination bypassed owner approval"
[[ "$(jq -r '.data | length' <<< "$(bearer_get "$STUDENT4_TOKEN" "$API_BASE/groups/invitations")")" -eq 0 ]] || fail "Nominee received invitation before owner approval"
NOMINATIONS="$(bearer_get "$STUDENT2_TOKEN" "$API_BASE/groups/$STUDENT_GROUP_ID/nominations")"
[[ "$(jq -r --arg id "$NOMINATION_ID" '[.data[] | select(.id == $id)] | length' <<< "$NOMINATIONS")" -eq 1 ]] || fail "Owner cannot see member nomination"
api_patch "$API_BASE/groups/$STUDENT_GROUP_ID/nominations/$NOMINATION_ID" '{"decision":"APPROVED"}' "$STUDENT2_TOKEN" >/dev/null
INVITES4="$(bearer_get "$STUDENT4_TOKEN" "$API_BASE/groups/invitations")"
APPROVED_INVITE_ID="$(jq -er --arg group "$STUDENT_GROUP_ID" '.data[] | select(.group_id == $group) | .id' <<< "$INVITES4" | head -n1)"
api_patch "$API_BASE/groups/invitations/$APPROVED_INVITE_ID/respond" '{"decision":"ACCEPTED"}' "$STUDENT4_TOKEN" >/dev/null

log "Declined invitation never creates membership"
DECLINE="$(api_post "$API_BASE/groups/$STUDENT_GROUP_ID/invitations" "$(jq -nc --arg id "$OUTSIDER_ID" '{userId:$id}')" "$STUDENT2_TOKEN")"
DECLINE_ID="$(json_get "$DECLINE" '.data.id')"
api_patch "$API_BASE/groups/invitations/$DECLINE_ID/respond" '{"decision":"DECLINED"}' "$OUTSIDER_TOKEN" >/dev/null
[[ "$(http_status GET "$API_BASE/groups/$STUDENT_GROUP_ID/posts" "$OUTSIDER_TOKEN")" == "403" ]] || fail "Declined invitee became Group member"

log "Owner can promote moderator; moderator can announce"
api_patch "$API_BASE/groups/$STUDENT_GROUP_ID/members/$STUDENT3_ID/role" '{"role":"MODERATOR"}' "$STUDENT2_TOKEN" >/dev/null
MOD_ANN="$(api_post "$API_BASE/groups/$STUDENT_GROUP_ID/posts" '{"body":"Moderator announcement","isAnnouncement":true}' "$STUDENT3_TOKEN")"
[[ "$(json_get "$MOD_ANN" '.data.is_announcement')" == "true" ]] || fail "Moderator announcement failed"

log "Reporting reaches Super Admin and can be resolved"
REPORT="$(api_post "$API_BASE/groups/$STUDENT_GROUP_ID/reports" "$(jq -nc --arg id "$POST_ID" '{targetType:"POST",targetId:$id,reason:"INAPPROPRIATE_CONTENT",details:"E2E moderation report"}')" "$STUDENT3_TOKEN")"
REPORT_ID="$(json_get "$REPORT" '.data.id')"
ADMIN_REPORTS="$(bearer_get "$ADMIN_TOKEN" "$API_BASE/admin/group-reports?status=OPEN")"
[[ "$(jq -r --arg id "$REPORT_ID" '[.data[] | select(.id == $id)] | length' <<< "$ADMIN_REPORTS")" -eq 1 ]] || fail "Admin cannot see open Group report"
api_patch "$API_BASE/admin/group-reports/$REPORT_ID" '{"status":"RESOLVED","resolution":"E2E reviewed"}' "$ADMIN_TOKEN" >/dev/null

log "Parent Groups are isolated to Parent role"
PARENT_GROUP_NAME="E2E Parent Support Group"
PARENT_GROUP="$(api_post "$API_BASE/groups" "$(jq -nc --arg name "$PARENT_GROUP_NAME" '{name:$name,description:"Parents discussing school support",kind:"PARENT",scope:"PRIVATE"}')" "$PARENT1_TOKEN")"
PARENT_GROUP_ID="$(json_get "$PARENT_GROUP" '.data.id')"
api_patch "$API_BASE/admin/groups/$PARENT_GROUP_ID/decision" '{"decision":"ACTIVE"}' "$ADMIN_TOKEN" >/dev/null
PARENT_JOIN="$(api_post "$API_BASE/groups/$PARENT_GROUP_ID/join-requests" '{}' "$PARENT2_TOKEN")"
PARENT_JOIN_ID="$(json_get "$PARENT_JOIN" '.data.id')"
api_patch "$API_BASE/groups/$PARENT_GROUP_ID/join-requests/$PARENT_JOIN_ID" '{"decision":"APPROVED"}' "$PARENT1_TOKEN" >/dev/null
STUDENT_DISCOVER_PARENT="$(bearer_get "$STUDENT1_TOKEN" "$API_BASE/groups/discover")"
[[ "$(jq -r --arg id "$PARENT_GROUP_ID" '[.data[] | select(.id == $id)] | length' <<< "$STUDENT_DISCOVER_PARENT")" -eq 0 ]] || fail "Student can discover Parent-only Group"

log "Teacher creates Class-scoped Mixed Group"
MIXED_GROUP_NAME="E2E Class 8 Mixed Discussion"
MIXED_BODY="$(jq -nc --arg name "$MIXED_GROUP_NAME" --arg school "$SCHOOL1_ID" --arg class "$CLASS8A_ID" '{name:$name,description:"Teacher-moderated Class 8 discussion",kind:"MIXED",scope:"CLASS",schoolId:$school,classId:$class,maxMembers:50}')"
MIXED_GROUP="$(api_post "$API_BASE/groups" "$MIXED_BODY" "$TEACHER_TOKEN")"
MIXED_GROUP_ID="$(json_get "$MIXED_GROUP" '.data.id')"
[[ "$(json_get "$MIXED_GROUP" '.data.status')" == "PENDING" ]] || fail "Teacher Mixed Group is not pending"
api_patch "$API_BASE/admin/groups/$MIXED_GROUP_ID/decision" '{"decision":"ACTIVE"}' "$ADMIN_TOKEN" >/dev/null

MIXED_JOIN_STUDENT="$(api_post "$API_BASE/groups/$MIXED_GROUP_ID/join-requests" '{}' "$STUDENT1_TOKEN")"
MIXED_JOIN_STUDENT_ID="$(json_get "$MIXED_JOIN_STUDENT" '.data.id')"
api_patch "$API_BASE/groups/$MIXED_GROUP_ID/join-requests/$MIXED_JOIN_STUDENT_ID" '{"decision":"APPROVED"}' "$TEACHER_TOKEN" >/dev/null
MIXED_JOIN_PARENT="$(api_post "$API_BASE/groups/$MIXED_GROUP_ID/join-requests" '{}' "$PARENT1_TOKEN")"
MIXED_JOIN_PARENT_ID="$(json_get "$MIXED_JOIN_PARENT" '.data.id')"
api_patch "$API_BASE/groups/$MIXED_GROUP_ID/join-requests/$MIXED_JOIN_PARENT_ID" '{"decision":"APPROVED"}' "$TEACHER_TOKEN" >/dev/null

log "Class scope blocks unrelated students"
OUTSIDER_DISCOVER="$(bearer_get "$OUTSIDER_TOKEN" "$API_BASE/groups/discover")"
[[ "$(jq -r --arg id "$MIXED_GROUP_ID" '[.data[] | select(.id == $id)] | length' <<< "$OUTSIDER_DISCOVER")" -eq 0 ]] || fail "Different-class Student can discover Class Group"
[[ "$(http_status POST "$API_BASE/groups/$MIXED_GROUP_ID/join-requests" "$OUTSIDER_TOKEN" '{}')" == "403" ]] || fail "Different-class Student can request Class Group membership"

log "Mixed Group ownership cannot be transferred to a Student"
[[ "$(http_status PATCH "$API_BASE/groups/$MIXED_GROUP_ID/owner" "$TEACHER_TOKEN" "$(jq -nc --arg id "$STUDENT1_ID" '{userId:$id}')")" == "409" ]] || fail "Mixed Group ownership transferred to Student"

log "School Admin invitation requires acceptance and Admin can recover ownership"
SCHOOL_ADMIN_INVITE="$(api_post "$API_BASE/groups/$MIXED_GROUP_ID/invitations" "$(jq -nc --arg id "$SCHOOL_ADMIN_ID" '{userId:$id,message:"Co-moderate this Class Group"}')" "$TEACHER_TOKEN")"
SCHOOL_ADMIN_INVITE_ID="$(json_get "$SCHOOL_ADMIN_INVITE" '.data.id')"
api_patch "$API_BASE/groups/invitations/$SCHOOL_ADMIN_INVITE_ID/respond" '{"decision":"ACCEPTED"}' "$SCHOOL_ADMIN_TOKEN" >/dev/null
ADMIN_MEMBERS="$(bearer_get "$ADMIN_TOKEN" "$API_BASE/admin/groups/$MIXED_GROUP_ID/members")"
[[ "$(jq -r --arg id "$SCHOOL_ADMIN_ID" '[.data[] | select(.user_id == $id)] | length' <<< "$ADMIN_MEMBERS")" -eq 1 ]] || fail "Admin cannot inspect Group members"
api_patch "$API_BASE/admin/groups/$MIXED_GROUP_ID/owner" "$(jq -nc --arg id "$SCHOOL_ADMIN_ID" '{userId:$id}')" "$ADMIN_TOKEN" >/dev/null
MIXED_AFTER_ADMIN_TRANSFER="$(bearer_get "$SCHOOL_ADMIN_TOKEN" "$API_BASE/groups/$MIXED_GROUP_ID")"
[[ "$(json_get "$MIXED_AFTER_ADMIN_TRANSFER" '.data.membership_role')" == "OWNER" ]] || fail "Admin ownership recovery failed"

log "Admin suspension blocks Group activity and reactivation restores it"
api_patch "$API_BASE/admin/groups/$MIXED_GROUP_ID/status" '{"status":"SUSPENDED","note":"E2E moderation pause"}' "$ADMIN_TOKEN" >/dev/null
[[ "$(http_status POST "$API_BASE/groups/$MIXED_GROUP_ID/posts" "$STUDENT1_TOKEN" '{"body":"Should be blocked while suspended"}')" == "409" ]] || fail "Suspended Group still accepts posts"
api_patch "$API_BASE/admin/groups/$MIXED_GROUP_ID/status" '{"status":"ACTIVE"}' "$ADMIN_TOKEN" >/dev/null
api_post "$API_BASE/groups/$MIXED_GROUP_ID/posts" '{"body":"Posting restored after Admin reactivation"}' "$STUDENT1_TOKEN" >/dev/null

log "Rejected Group remains unusable and owner receives decision state"
REJECT_GROUP="$(api_post "$API_BASE/groups" '{"name":"E2E Rejected Student Group","kind":"STUDENT","scope":"PRIVATE"}' "$STUDENT1_TOKEN")"
REJECT_GROUP_ID="$(json_get "$REJECT_GROUP" '.data.id')"
api_patch "$API_BASE/admin/groups/$REJECT_GROUP_ID/decision" '{"decision":"REJECTED","note":"E2E policy rejection"}' "$ADMIN_TOKEN" >/dev/null
MINE_AFTER_REJECT="$(bearer_get "$STUDENT1_TOKEN" "$API_BASE/groups/mine")"
[[ "$(jq -r --arg id "$REJECT_GROUP_ID" '.data[] | select(.id == $id) | .status' <<< "$MINE_AFTER_REJECT")" == "REJECTED" ]] || fail "Owner cannot see rejected Group status"
[[ "$(http_status POST "$API_BASE/groups/$REJECT_GROUP_ID/posts" "$STUDENT1_TOKEN" '{"body":"Should not post"}')" == "409" ]] || fail "Rejected Group accepts posts"

log "Groups E2E passed"
