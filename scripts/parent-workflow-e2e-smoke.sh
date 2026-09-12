#!/usr/bin/env bash
set -Eeuo pipefail

API_BASE="${API_BASE:-http://127.0.0.1:5000/api/v1}"
: "${PARENT_IDENTIFIER:?PARENT_IDENTIFIER is required}"
: "${PARENT_PASSWORD:?PARENT_PASSWORD is required}"
: "${UNLINKED_STUDENT_ID:?UNLINKED_STUDENT_ID is required}"

fail(){ printf 'FAILED: %s\n' "$*" >&2; exit 1; }

LOGIN="$(curl -fsS -X POST "$API_BASE/auth/login" -H 'Content-Type: application/json' -d "{\"identifier\":\"$PARENT_IDENTIFIER\",\"password\":\"$PARENT_PASSWORD\",\"role\":\"PARENT\"}")" || fail 'Parent login failed'
TOKEN="$(printf '%s' "$LOGIN" | jq -er '.data.accessToken')"
CHILDREN="$(curl -fsS "$API_BASE/parent/children" -H "Authorization: Bearer $TOKEN")" || fail 'Linked children request failed'
CHILD_ID="$(printf '%s' "$CHILDREN" | jq -r '.data[0].id // empty')"
[[ -n "$CHILD_ID" ]] || fail 'Parent fixture has no linked child'

curl -fsS "$API_BASE/parent/children/$CHILD_ID/homework" -H "Authorization: Bearer $TOKEN" | jq -e '.success == true and (.data|type)=="array"' >/dev/null || fail 'Linked-child homework visibility failed'
curl -fsS "$API_BASE/parent/children/$CHILD_ID/achievements" -H "Authorization: Bearer $TOKEN" | jq -e '.success == true and (.data|type)=="array"' >/dev/null || fail 'Linked-child achievements visibility failed'

code="$(curl -sS -o /tmp/parent-unlinked-homework.json -w '%{http_code}' "$API_BASE/parent/children/$UNLINKED_STUDENT_ID/homework" -H "Authorization: Bearer $TOKEN")"
[[ "$code" == "403" || "$code" == "404" ]] || fail "Unlinked child homework was not denied (HTTP $code)"

code="$(curl -sS -o /tmp/parent-unlinked-achievements.json -w '%{http_code}' "$API_BASE/parent/children/$UNLINKED_STUDENT_ID/achievements" -H "Authorization: Bearer $TOKEN")"
[[ "$code" == "403" || "$code" == "404" ]] || fail "Unlinked child achievements were not denied (HTTP $code)"

printf 'Parent workflow linked-child visibility and isolation smoke passed.\n'
