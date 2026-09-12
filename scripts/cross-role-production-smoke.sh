#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
WEB_BASE="${WEB_BASE:-http://127.0.0.1:3000}"
API_BASE="${API_BASE:-http://127.0.0.1:5000/api/v1}"

log() { printf '\n==> %s\n' "$*"; }
fail() { printf '\nFAILED: %s\n' "$*" >&2; exit 1; }

check_web() {
  local path="$1" code
  code="$(curl -sS -o /dev/null -w '%{http_code}' "$WEB_BASE$path" || true)"
  printf '%-42s %s\n' "$path" "$code"
  [[ "$code" =~ ^(200|301|302|307|308)$ ]] || fail "$WEB_BASE$path returned HTTP $code"
}

check_protected_api() {
  local path="$1" code
  code="$(curl -sS -o /dev/null -w '%{http_code}' "$API_BASE$path" || true)"
  printf '%-58s %s\n' "$path" "$code"
  [[ "$code" == "401" || "$code" == "403" ]] || fail "$API_BASE$path must reject unauthenticated access; got HTTP $code"
}

log "Run existing certified role production smokes"
WEB_BASE="$WEB_BASE" API_BASE="$API_BASE" bash "$SCRIPT_DIR/student-production-smoke.sh"
WEB_BASE="$WEB_BASE" API_BASE="$API_BASE" bash "$SCRIPT_DIR/school-production-smoke.sh"
WEB_BASE="$WEB_BASE" API_BASE="$API_BASE" bash "$SCRIPT_DIR/parent-admin-production-smoke.sh"

log "Cross-role application surfaces"
for path in \
  '/login?role=student' \
  '/login?role=parent' \
  '/login?role=teacher' \
  '/login?role=school' \
  '/student' \
  '/student/homework' \
  '/student/notifications' \
  '/parent/dashboard' \
  '/parent/homework' \
  '/parent/leave' \
  '/parent/messages' \
  '/school/overview' \
  '/school/homework' \
  '/school/absence' \
  '/school/attendance' \
  '/admin' \
  '/admin/analytics' \
  '/admin/audit'; do
  check_web "$path"
done

log "Cross-role API authorization and route-mount contract"
check_protected_api '/student/homework'
check_protected_api '/student/absence/calendar'
check_protected_api '/parent/children'
check_protected_api '/parent/children/00000000-0000-0000-0000-000000000000/homework'
check_protected_api '/parent/absence/children/00000000-0000-0000-0000-000000000000/calendar'
check_protected_api '/school/overview'
check_protected_api '/school/homework/targets'
check_protected_api '/school/absence/leave'
check_protected_api '/admin/analytics'
check_protected_api '/admin/audit'

printf '\nModule 6 cross-role production smoke passed. No production data was modified.\n'
