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

check_unauthenticated_api() {
  local path="$1" code
  code="$(curl -sS -o /dev/null -w '%{http_code}' "$API_BASE$path" || true)"
  printf '%-34s %s\n' "$path" "$code"
  [[ "$code" == "401" || "$code" == "403" ]] || fail "$API_BASE$path must reject unauthenticated access; got HTTP $code"
}

log "Parent application routes"
for path in \
  /parent/dashboard \
  /parent/performance \
  /parent/attendance \
  /parent/report-card \
  /parent/fees \
  /parent/notifications \
  /parent/messages \
  /parent/grievances; do
  check_web "$path"
done

log "Admin application routes"
for path in \
  /admin/analytics \
  /admin/schools \
  /admin/users \
  /admin/competitions \
  /admin/groups \
  /admin/grievances \
  /admin/content \
  /admin/revenue \
  /admin/support \
  /admin/settings; do
  check_web "$path"
done

log "Parent/Admin authorization boundary"
check_unauthenticated_api "/parent/children"
check_unauthenticated_api "/parent/grievances"
check_unauthenticated_api "/admin/analytics"
check_unauthenticated_api "/admin/schools"
check_unauthenticated_api "/admin/users"
check_unauthenticated_api "/admin/grievances"

printf '\nParent/Admin production smoke passed. No production data was modified.\n'
