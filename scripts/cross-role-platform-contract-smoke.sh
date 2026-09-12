#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

fail() { printf 'FAILED: %s\n' "$*" >&2; exit 1; }
require_file() { [[ -s "$1" ]] || fail "Missing required file: $1"; }
require_text() { grep -Fq -- "$2" "$1" || fail "$1 is missing required contract: $2"; }

require_file scripts/cross-role-platform-e2e-smoke.sh
require_file scripts/cross-role-production-smoke.sh
require_file scripts/student-production-smoke.sh
require_file scripts/school-production-smoke.sh
require_file scripts/parent-admin-production-smoke.sh
require_file scripts/deploy-main-native.sh
require_file frontend/src/lib/sessionPolicy.ts
require_file backend/src/routes/auth.routes.ts
require_file backend/src/routes/parent.routes.ts
require_file backend/src/routes/school.routes.ts
require_file backend/src/routes/admin.routes.ts
require_file backend/.env.example

bash -n scripts/cross-role-platform-e2e-smoke.sh
bash -n scripts/cross-role-production-smoke.sh
bash -n scripts/deploy-main-native.sh

for role in STUDENT PARENT TEACHER SCHOOL_ADMIN SUPER_ADMIN; do
  require_text scripts/cross-role-platform-e2e-smoke.sh "$role"
done

for endpoint in \
  '/school/homework' \
  '/student/homework' \
  '/parent/children/$STUDENT_ID/homework' \
  '/parent/absence/children/$STUDENT_ID/leave' \
  '/school/absence/leave' \
  '/school/absence/calendar' \
  '/student/absence/calendar' \
  '/parent/absence/children/$STUDENT_ID/calendar' \
  '/parent/children/$STUDENT_ID/messages' \
  '/admin/analytics'; do
  require_text scripts/cross-role-platform-e2e-smoke.sh "$endpoint"
done

require_text frontend/src/lib/sessionPolicy.ts 'SESSION_IDLE_TIMEOUT_MS = 10 * 60 * 1000'
require_text frontend/src/lib/sessionPolicy.ts 'SESSION_RETURN_GRACE_MS = 5 * 60 * 1000'
require_text backend/src/routes/auth.routes.ts "router.post('/logout'"
require_text backend/.env.example 'JWT_ACCESS_EXPIRY=10m'

require_text scripts/cross-role-production-smoke.sh 'student-production-smoke.sh'
require_text scripts/cross-role-production-smoke.sh 'school-production-smoke.sh'
require_text scripts/cross-role-production-smoke.sh 'parent-admin-production-smoke.sh'
require_text scripts/cross-role-production-smoke.sh '/school/homework'
require_text scripts/cross-role-production-smoke.sh '/school/absence'
require_text scripts/cross-role-production-smoke.sh '/parent/homework'
require_text scripts/cross-role-production-smoke.sh '/admin/audit'

require_text scripts/deploy-main-native.sh 'Run local non-destructive cross-role release smoke'
require_text scripts/deploy-main-native.sh 'bash scripts/cross-role-production-smoke.sh'
require_text scripts/deploy-main-native.sh 'WEB_BASE=https://vidyasetu.sbs API_BASE=https://vidyasetu.sbs/api/v1 bash scripts/cross-role-production-smoke.sh'

printf 'Module 6 cross-role contract certification passed.\n'
