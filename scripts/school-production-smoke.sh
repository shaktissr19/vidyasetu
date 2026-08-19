#!/usr/bin/env bash
set -Eeuo pipefail

WEB_BASE="${WEB_BASE:-http://127.0.0.1:3000}"
API_BASE="${API_BASE:-http://127.0.0.1:5000/api/v1}"

log() { printf '\n==> %s\n' "$*"; }
fail() { printf '\nFAILED: %s\n' "$*" >&2; exit 1; }

check_web() {
  local path="$1" code
  code="$(curl -sS -o /dev/null -w '%{http_code}' "$WEB_BASE$path" || true)"
  printf '%-34s %s\n' "$path" "$code"
  [[ "$code" =~ ^(200|301|302|307|308)$ ]] || fail "$WEB_BASE$path returned HTTP $code"
}

log "School public/read-only application routes"
for path in \
  /login?role=school \
  /login?role=teacher \
  /school/overview \
  /school/enrollments \
  /school/students \
  /school/classes \
  /school/teachers \
  /school/attendance \
  /school/fees \
  /school/timetable \
  /school/exams \
  /school/results \
  /school/announcements \
  /school/profile \
  /school/onboarding; do
  check_web "$path"
done

log "Read-only API/database discovery contract"
OPTIONS="$(curl -fsS "$API_BASE/auth/student-registration-options")"
[[ "$(jq -r '.success' <<< "$OPTIONS")" == "true" ]] || fail "Student registration options endpoint is unhealthy"
SCHOOL_COUNT="$(jq -r '.data.schools | length' <<< "$OPTIONS")"
(( SCHOOL_COUNT >= 2 )) || fail "Expected at least two active Schools in production demo data"
CLASS_COUNT="$(jq -r '[.data.schools[].classes[]] | length' <<< "$OPTIONS")"
(( CLASS_COUNT >= 4 )) || fail "Expected configured School classes in registration options"
if jq -e '.data.schools[] | select(.academic_year != "2026-27")' <<< "$OPTIONS" >/dev/null; then
  fail "At least one active demo School is not aligned to academic year 2026-27"
fi

printf '\nSchool production smoke passed. No production data was modified.\n'
